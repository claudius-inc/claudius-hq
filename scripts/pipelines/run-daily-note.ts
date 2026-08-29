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
import { checkTradingSession, etToday } from "@/lib/notes/session";
import { assembleFacts } from "@/lib/notes/assemble";
import { writeProse } from "@/lib/notes/write";
import { renderPush, renderWeb } from "@/lib/notes/render";
import { sendNote, editNote, alertAdmin } from "@/lib/notes/telegram";
import { reportHealth, recordPipelineHeartbeat } from "@/lib/notes/health-report";
import { archiveSurprises } from "@/lib/notes/surprise-archive";

const SRC = "notes/pipeline";

/** Public site the "Full note →" link points at. */
const WEB_BASE_URL = "https://claudiusinc.com";

function webUrl(date: string): string {
  // Env override exists only for local runs and preview deploys.
  const base = (process.env.NOTE_WEB_BASE_URL || WEB_BASE_URL).replace(/\/$/, "");
  return `${base}/markets/notes/daily/${date}`;
}

async function main() {
  // 0a. HEARTBEAT — before the gate, so it records that the JOB ran, not that a
  // note shipped. Those are different questions and only this one can answer
  // "is the scheduler still alive": the cron fires every weekday, and on a
  // holiday it fires and then skips at the gate below. A watchdog keyed off notes
  // would have to know the market calendar to tell a holiday from a dead cron;
  // keyed off this, it does not.
  await recordPipelineHeartbeat();

  // 0. GATE (§7a)
  const gate = await checkTradingSession();
  if (!gate.isSession) {
    logger.info(SRC, `Skipping — ${gate.reason}`, { marketDate: gate.marketDate });
    await alertAdmin(`SKIPPED — daily note for ${gate.marketDate}: ${gate.reason}`);
    return; // exit 0 — a skip is a valid outcome
  }
  const date = gate.marketDate;

  // 0b. HOLIDAY / ALREADY-PUBLISHED GUARD.
  //
  // The gate now keys off the session that CLOSED, not wall-clock today, which is
  // what lets a delayed run still publish the right session. The cost is that on
  // a market holiday the cron still fires and the S&P's last print is a PRIOR,
  // already-published session — so without this guard the pipeline would re-run
  // the LLM and OVERWRITE that day's stored note with holiday-refetched data.
  //
  // Skip only when BOTH hold: the session is not today's (a prior day), AND it
  // already has a SENT note. That leaves the two cases we must still handle
  // untouched — a genuinely missed prior session (no row, or a persisted-but-
  // unsent note to retry) still generates, and today's own session still runs,
  // including a same-evening second cron re-editing with late-arriving data.
  // Quiet on purpose: the note is already out, the heartbeat already fired, so an
  // alert here would be nightly noise during a GitHub-delay stretch.
  if (date !== etToday()) {
    const already = await db
      .select({ messageId: dailyNotes.telegramMessageId })
      .from(dailyNotes)
      .where(eq(dailyNotes.date, date))
      .limit(1);
    if (already[0]?.messageId != null) {
      logger.info(SRC, "Prior session already published; skipping re-process", { date });
      return; // exit 0 — nothing to do, not an error
    }
  }

  // 1. ASSEMBLE (§8.1)
  const { facts, health } = await assembleFacts(date);
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
    // Without indices there is no note worth sending. Report health anyway — this
    // is exactly the run whose connector state the operator most needs, and the
    // streak counter is only useful if the worst runs still update it.
    await reportHealth(date, health);
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

  // 6. ARCHIVE the day's surprises. Collection only — nothing renders this yet.
  // It runs after the send because it is for a question two years from now, not
  // for tonight's note.
  await archiveSurprises(facts);

  // 7. CONNECTOR HEALTH — after the send, and it swallows its own errors.
  //
  // §1a governs the note: a failed feed was already omitted above, silently and
  // correctly. This is the second channel, and the only one that tells a human a
  // source has stopped answering. It runs last so it can never cost the note.
  await reportHealth(date, health);

  // "Did the job run at all" is answered by the heartbeat at step 0a and read by
  // /api/cron/note-watchdog, which runs on Vercel — a different execution
  // environment, so a dead Actions runner leaves the watchdog running. An
  // optional outbound ping to an external service is supported as well, for the
  // one case neither can cover: our whole infrastructure being down at once.
  await pingDeadMansSwitch();
}

/**
 * Optional third-party dead-man's switch.
 *
 * The Vercel watchdog covers a dead GitHub Actions runner, which is the failure
 * that actually happens. This covers the residual one it cannot: Vercel and
 * Actions both down, where nothing we own is left to notice. Unset is a
 * legitimate configuration and the call is skipped silently.
 */
async function pingDeadMansSwitch(): Promise<void> {
  const url = process.env.HEALTHCHECK_PING_URL;
  if (!url) return;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    await fetch(url, { signal: controller.signal }).finally(() => clearTimeout(timer));
    logger.info(SRC, "Dead-man's switch pinged");
  } catch (error) {
    // A missed ping is exactly what the external service is watching for, so a
    // failure here is already covered by the mechanism it belongs to.
    logger.warn(SRC, "Dead-man's ping failed", { error });
  }
}

main().catch(async (err) => {
  logger.error(SRC, "Daily note pipeline crashed", { error: err });
  await alertAdmin(`FAILED — daily note pipeline crashed: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
