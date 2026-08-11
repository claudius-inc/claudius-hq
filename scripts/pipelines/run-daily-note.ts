/**
 * Daily Market Note ("The Tape") — generation pipeline.
 * See docs/daily-note-spec.md §8. Runner: GitHub Actions tsx, triggered ≥6:15pm ET.
 *
 *   npx tsx scripts/pipelines/run-daily-note.ts
 *
 * Flow: GATE (§7a) → ASSEMBLE (§8.1) → RENDER (§2) → PERSIST → SEND/EDIT.
 * A failed session gate is a graceful skip (exit 0) that alerts the admin
 * itself (the workflow's failure-only step won't fire on a clean exit).
 * The note is persisted BEFORE the send so a Telegram outage can't lose it.
 */
import { eq } from "drizzle-orm";
import { db, dailyNotes } from "@/db";
import { logger } from "@/lib/logger";
import { checkTradingSession } from "@/lib/notes/session";
import { assembleFacts } from "@/lib/notes/assemble";
import { writeProse } from "@/lib/notes/write";
import { renderPush, renderWeb } from "@/lib/notes/render";
import { sendNote, editNote, alertAdmin } from "@/lib/notes/telegram";

const SRC = "notes/pipeline";

/** Public site the "Full note →" link points at. */
const WEB_BASE_URL = "https://claudiusinc.com";

function webUrl(date: string): string {
  // Env override exists only for local runs and preview deploys.
  const base = (process.env.NOTE_WEB_BASE_URL || WEB_BASE_URL).replace(/\/$/, "");
  return `${base}/markets/notes/${date}`;
}

async function main() {
  // 0. GATE (§7a)
  const gate = await checkTradingSession();
  if (!gate.isSession) {
    logger.info(SRC, `Skipping — ${gate.reason}`, { marketDate: gate.marketDate });
    await alertAdmin(`SKIPPED — daily note for ${gate.marketDate}: ${gate.reason}`);
    return; // exit 0 — a skip is a valid outcome
  }
  const date = gate.marketDate;

  // 1. ASSEMBLE (§8.1)
  const facts = await assembleFacts(date);
  logger.info(SRC, "Facts assembled", {
    date,
    have: {
      indices: !!facts.indices,
      rates: !!facts.rates,
      vix: !!facts.vix,
      crossAsset: !!facts.crossAsset,
      sectors: !!facts.sectors,
      breadth: !!facts.breadth,
    },
  });

  if (!facts.indices) {
    // Without indices there is no note worth sending.
    await alertAdmin(`WARNING — daily note ${date}: no index data assembled; not sending.`);
    process.exitCode = 1;
    return;
  }

  // 2. WRITE PROSE (§8.2) + VALIDATE (§8.3) — additive; null → deterministic note.
  const prose = await writeProse(facts);

  // 3. RENDER (§2)
  const url = webUrl(date);
  const pushHtml = renderPush({ facts, webUrl: url, prose: prose ?? undefined });
  const webBody = renderWeb({ facts, webUrl: url, prose: prose ?? undefined });

  // 4. PERSIST (before send, so an outage can't cost the record)
  const existing = await db.select().from(dailyNotes).where(eq(dailyNotes.date, date)).limit(1);
  const priorMessageId = existing[0]?.telegramMessageId ?? null;

  // Persist the prose too, not just its rendering — a later note or the weekly
  // wrap can then quote what we actually wrote.
  const proseJson = prose ? JSON.stringify(prose) : null;

  await db
    .insert(dailyNotes)
    .values({
      date,
      facts: JSON.stringify(facts),
      prose: proseJson,
      pushHtml,
      webBody,
      telegramMessageId: priorMessageId,
    })
    .onConflictDoUpdate({
      target: dailyNotes.date,
      set: { facts: JSON.stringify(facts), prose: proseJson, pushHtml, webBody },
    });

  // 5. SEND / EDIT
  // The note goes to a normal bot chat, not a channel — the same admin chat the
  // repo's other jobs already use.
  const chatId = Number(process.env.TELEGRAM_ADMIN_CHAT_ID);
  if (!Number.isFinite(chatId) || chatId === 0) {
    // A config error must be loud (§2) — the note was persisted but nobody saw it.
    logger.error(SRC, "TELEGRAM_ADMIN_CHAT_ID missing or invalid; persisted but did not send", { date });
    await alertAdmin(`WARNING — daily note ${date} persisted but NOT sent: TELEGRAM_ADMIN_CHAT_ID missing or invalid.`);
    process.exitCode = 1;
    return;
  }

  const persistMessageId = async (id: number) =>
    db.update(dailyNotes).set({ telegramMessageId: id }).where(eq(dailyNotes.date, date));

  if (priorMessageId) {
    try {
      await editNote(chatId, priorMessageId, pushHtml);
      logger.info(SRC, "Edited existing note", { date, messageId: priorMessageId });
    } catch (err) {
      // The old message was deleted → edit fails forever. Resend instead of
      // wedging every future run.
      if (err instanceof Error && /message to edit not found|message can't be edited/i.test(err.message)) {
        logger.warn(SRC, "Prior message gone; resending", { date });
        const res = await sendNote(chatId, pushHtml);
        if (res.messageId) await persistMessageId(res.messageId);
      } else {
        throw err;
      }
    }
  } else {
    const res = await sendNote(chatId, pushHtml);
    if (res.messageId) await persistMessageId(res.messageId);
    logger.info(SRC, "Sent new note", { date, messageId: res.messageId });
  }
}

main().catch(async (err) => {
  logger.error(SRC, "Daily note pipeline crashed", { error: err });
  await alertAdmin(`FAILED — daily note pipeline crashed: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
