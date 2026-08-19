/**
 * Rates back-fill — replace a note's provisional (or absent) yields with the
 * authoritative US Treasury par curve once it publishes.
 *
 * The daily pipeline runs ~6:20pm ET, and the Treasury CSV sometimes has not
 * posted the day's row by then. When that happens the note ships with Yahoo's
 * provisional 10Y/30Y (see `sources/yahoo-rates.ts`) or, if Yahoo was not on the
 * session either, with no rates at all. This pass re-checks the Treasury feed for
 * recent notes in that state and, when the row has appeared, swaps in the full
 * curve — 2Y and 2s10s included — re-renders the note, and edits the Telegram
 * message so the sent copy matches the archive.
 *
 * It only ever moves a note from provisional/absent to authoritative. A note that
 * already carries a Treasury curve is left untouched, so the pass is idempotent
 * and safe to run on every session.
 */
import { eq, gte, desc } from "drizzle-orm";
import { db, dailyNotes } from "@/db";
import { logger } from "@/lib/logger";
import { fetchRatesFact } from "@/lib/notes/sources/treasury";
import { renderPush, renderWeb } from "@/lib/notes/render";
import { editNote } from "@/lib/notes/telegram";
import type { StructuredFacts, NoteProse } from "@/lib/notes/types";

const SRC = "notes/rates-backfill";

/** Public site the "Full note →" link points at (mirrors run-daily-note). */
function webUrl(date: string): string {
  const base = (process.env.NOTE_WEB_BASE_URL || "https://claudiusinc.com").replace(/\/$/, "");
  return `${base}/markets/notes/daily/${date}`;
}

/** A date whose stored rates are null or provisional — a candidate to back-fill. */
function needsBackfill(facts: StructuredFacts): boolean {
  const rates = facts.rates;
  return !rates || rates.value.provisional === true;
}

export type BackfillOutcome =
  | "filled" // provisional/absent → authoritative Treasury curve
  | "still-missing" // Treasury row still not published
  | "already-authoritative"; // nothing to do

export interface BackfillResult {
  date: string;
  outcome: BackfillOutcome;
  /** Whether the Telegram message was edited (only on `filled`). */
  edited: boolean;
}

/**
 * Re-check the Treasury feed for every recent note whose rates are provisional or
 * absent, and fill the ones that can now be filled.
 *
 * @param lookbackDays how far back to scan (default 7 — the feed rarely lags a
 *   full week, and older gaps are not worth an edit to a note nobody is reading).
 */
export async function backfillRates(lookbackDays = 7): Promise<BackfillResult[]> {
  const since = new Date(Date.now() - lookbackDays * 86_400_000).toISOString().slice(0, 10);
  const rows = await db
    .select()
    .from(dailyNotes)
    .where(gte(dailyNotes.date, since))
    .orderBy(desc(dailyNotes.date));

  const chatId = Number(process.env.TELEGRAM_ADMIN_CHAT_ID);
  const canEdit = Number.isFinite(chatId) && chatId !== 0;

  const results: BackfillResult[] = [];
  for (const row of rows) {
    let facts: StructuredFacts;
    try {
      facts = JSON.parse(row.facts) as StructuredFacts;
    } catch (error) {
      logger.warn(SRC, "Skipping a note with unparseable facts", { date: row.date, error });
      continue;
    }

    if (!needsBackfill(facts)) {
      results.push({ date: row.date, outcome: "already-authoritative", edited: false });
      continue;
    }

    const authoritative = await fetchRatesFact(row.date);
    if (!authoritative) {
      results.push({ date: row.date, outcome: "still-missing", edited: false });
      continue;
    }

    // Swap in the authoritative curve and re-render from the SAME persisted prose,
    // so only the yields change — the note is not re-written.
    const updatedFacts: StructuredFacts = { ...facts, rates: authoritative };
    const prose = row.prose ? (safeProse(row.prose, row.date) ?? undefined) : undefined;
    const url = webUrl(row.date);
    const pushHtml = renderPush({ facts: updatedFacts, webUrl: url, prose });
    const webBody = renderWeb({ facts: updatedFacts, webUrl: url, prose });

    await db
      .update(dailyNotes)
      .set({ facts: JSON.stringify(updatedFacts), pushHtml, webBody })
      .where(eq(dailyNotes.date, row.date));

    // Edit the sent message so the Telegram copy matches the archive. A gone
    // message or an unchanged body is not a failure — the persisted note is what
    // matters, and the edit is a courtesy on top of it.
    let edited = false;
    if (canEdit && row.telegramMessageId) {
      try {
        await editNote(chatId, row.telegramMessageId, pushHtml);
        edited = true;
      } catch (error) {
        logger.warn(SRC, "Could not edit the sent note after back-fill", { date: row.date, error });
      }
    }

    logger.info(SRC, "Filled provisional/absent rates with the Treasury curve", {
      date: row.date,
      was: facts.rates ? "provisional" : "absent",
      edited,
    });
    results.push({ date: row.date, outcome: "filled", edited });
  }

  return results;
}

function safeProse(json: string, date: string): NoteProse | null {
  try {
    return JSON.parse(json) as NoteProse;
  } catch (error) {
    logger.warn(SRC, "Persisted prose is not valid JSON; re-rendering without it", { date, error });
    return null;
  }
}
