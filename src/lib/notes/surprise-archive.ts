/**
 * The macro surprise archive — COLLECTION ONLY.
 *
 * Nothing renders this and nothing should yet. The question it exists to answer
 * ("what has happened when a print came in above consensus") needs a sample this
 * table does not have: CPI prints twelve times a year, so two years splits into
 * buckets of about ten, against a daily 10Y standard deviation of 5-7bp. A median
 * over ten observations with a range spanning zero is indistinguishable from no
 * effect — and a rendered median gets read as a playbook however carefully it is
 * framed. So it accumulates, and the question gets answered properly later.
 *
 * There is deliberately NO backfill script. Nasdaq serves consensus for historical
 * dates, but a historical row's `previous` is that day's vintage while FRED's has
 * since moved under annual seasonal revisions — the join is only validated
 * same-day. Backfilled rows would be the majority of the table and the least
 * trustworthy part of it.
 *
 * Two provenance columns keep vintages from silently mixing:
 *
 *  - `consensusCaptured` — 'same-day' is the only join measured to be exact.
 *  - `measuredAs` — close-to-close contains the WHOLE day, not the reaction.
 *    Yahoo retains 5-minute bars for about 60 days, so an 8:30→10:00 window can
 *    never be backfilled, but it CAN be captured forward from today. Both are
 *    recorded here so the two are never averaged together.
 */
import YahooFinance from "yahoo-finance2";
import { db, macroSurpriseHistory } from "@/db";
import { logger } from "@/lib/logger";
import { etDate, etMinutes } from "@/lib/notes/session";
import type { StructuredFacts } from "@/lib/notes/types";

const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });
const SRC = "notes/surprise-archive";

/** What the session's move is measured on. Yields in bp, the rest in percent. */
const REACTION_SYMBOLS = { spy: "SPY", tnx: "^TNX", vix: "^VIX" } as const;

interface Reaction {
  spyPct: number | null;
  tnxBp: number | null;
  vixChg: number | null;
}

/**
 * The 8:30→10:00 ET window, which is the reaction as opposed to the day.
 *
 * Only possible going forward: 5-minute bars age out at roughly 60 days, so this
 * is exactly the figure a backfill cannot produce and the reason collection starts
 * now rather than when the study is wanted.
 *
 * Returns null if the bars do not cover the window, and the caller then falls back
 * to close-to-close rather than dropping the row — a coarse measure that is
 * labelled coarse is still worth having.
 */
async function intradayReaction(symbol: string, marketDate: string): Promise<number | null> {
  try {
    const chart = (await yahooFinance.chart(symbol, {
      period1: new Date(`${marketDate}T00:00:00Z`),
      interval: "5m",
    })) as { quotes?: { date?: Date; close?: number | null }[] };

    const bars = (chart?.quotes ?? []).filter(
      (q): q is { date: Date; close: number } => q?.date != null && q.close != null && Number.isFinite(q.close),
    );
    const inWindow = bars.filter((bq) => {
      const ms = bq.date.getTime();
      if (etDate(ms) !== marketDate) return false;
      const min = etMinutes(ms);
      return min >= 8 * 60 + 30 && min <= 10 * 60;
    });
    if (inWindow.length < 2) return null;
    const first = inWindow[0].close;
    const last = inWindow[inWindow.length - 1].close;
    if (!first) return null;
    return ((last - first) / first) * 100;
  } catch (error) {
    logger.warn(SRC, "Intraday window unavailable", { symbol, marketDate, error });
    return null;
  }
}

/** Session close-to-close, from the facts already assembled. No extra fetch. */
function closeToCloseReaction(facts: StructuredFacts): Reaction {
  const spy = facts.indices?.value.find((i) => i.symbol === "^GSPC")?.changePct ?? null;
  const tnx = facts.rates?.value.chg10Bp ?? null;
  const vix = facts.vix?.value.change ?? null;
  return { spyPct: spy, tnxBp: tnx, vixChg: vix };
}

/**
 * Append one row per release that printed today.
 *
 * Idempotent on (release, series, date), so a re-run overwrites rather than
 * duplicating. Never throws into the pipeline: this is an archive for a future
 * question, and losing a row costs nothing today.
 */
export async function archiveSurprises(facts: StructuredFacts): Promise<void> {
  const releases = facts.macro?.value ?? [];
  if (releases.length === 0) return;

  try {
    const fallback = closeToCloseReaction(facts);
    // One intraday attempt, on the index proxy only. If it lands, the row is
    // labelled as the tighter measure; if not, the session move stands in.
    const spyIntraday = await intradayReaction(REACTION_SYMBOLS.spy, facts.date);
    const measuredAs = spyIntraday != null ? "intraday-0830-1000" : "close-to-close";

    for (const r of releases) {
      await db
        .insert(macroSurpriseHistory)
        .values({
          // The release id is not carried on MacroRelease, so the label is the
          // stable key alongside the date. Both are stored; neither is guessed.
          releaseId: 0,
          seriesId: r.label,
          releaseDate: facts.date,
          consensus: r.consensus ?? null,
          actual: r.actual,
          prior: r.prior,
          surprise: r.surprise ?? null,
          spyPct: spyIntraday ?? fallback.spyPct,
          tnxBp: fallback.tnxBp,
          vixChg: fallback.vixChg,
          measuredAs,
          consensusCaptured: "same-day",
        })
        .onConflictDoUpdate({
          target: [macroSurpriseHistory.releaseId, macroSurpriseHistory.seriesId, macroSurpriseHistory.releaseDate],
          set: {
            consensus: r.consensus ?? null,
            actual: r.actual,
            surprise: r.surprise ?? null,
            spyPct: spyIntraday ?? fallback.spyPct,
            tnxBp: fallback.tnxBp,
            vixChg: fallback.vixChg,
            measuredAs,
          },
        });
    }
    logger.info(SRC, "Surprise rows archived", {
      date: facts.date,
      rows: releases.length,
      withConsensus: releases.filter((r) => r.consensus != null).length,
      measuredAs,
    });
  } catch (error) {
    logger.warn(SRC, "Surprise archive failed — the note is unaffected", { error });
  }
}
