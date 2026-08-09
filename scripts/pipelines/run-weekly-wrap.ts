/**
 * Weekly wrap ("The Week") — see docs/daily-note-v2-spec.md §C.
 *
 *   npx tsx scripts/pipelines/run-weekly-wrap.ts
 *
 * Runs after the last daily note of the week has persisted. It reads those
 * notes rather than re-deriving anything, so a session that did not happen
 * simply is not there — which is what makes it holiday-proof without a market
 * calendar.
 *
 * A week it cannot honestly describe is skipped, never approximated: no notes
 * at all, no prior-week anchor, or an anchor so old the span is no longer a
 * week. Each skip alerts, because a silent no-wrap looks identical to success.
 */
import { eq } from "drizzle-orm";
import { db, weeklyNotes } from "@/db";
import { logger } from "@/lib/logger";
import { etToday, checkTradingSession } from "@/lib/notes/session";
import { resolveWeek, aggregateWeek } from "@/lib/notes/weekly";
import { renderWeeklyPush, renderWeeklyWeb } from "@/lib/notes/render-weekly";
import { sendNote, editNote, alertAdmin } from "@/lib/notes/telegram";

const SRC = "notes/weekly-pipeline";
const WEB_BASE_URL = "https://claudiusinc.com";

function webUrl(weekEnd: string): string {
  const base = (process.env.NOTE_WEB_BASE_URL || WEB_BASE_URL).replace(/\/$/, "");
  return `${base}/markets/notes/weekly/${weekEnd}`;
}

async function main() {
  const today = etToday();

  // Only wrap on a Friday. A manual dispatch mid-week would otherwise publish
  // Mon–Wed as a three-session "week", and Friday's real run would then create a
  // second row and a second message for the same week.
  const dow = new Date(`${today}T12:00:00Z`).getUTCDay();
  if (dow !== 5) {
    logger.info(SRC, "Not a Friday — no wrap", { today, dow });
    await alertAdmin(`📭 Weekly wrap skipped: ${today} is not a Friday.`);
    return;
  }

  const anchors = await resolveWeek(today);
  if (!anchors) {
    // resolveWeek logs which of the three refusals applied.
    await alertAdmin(`📭 Weekly wrap skipped for the week ending ${today}: the week could not be resolved.`);
    return; // exit 0 — a skip is a valid outcome
  }

  // If today TRADED but produced no note, the week is truncated and wrapping it
  // would imply Friday was a holiday — a false claim by implication, and the
  // window is real: only ~30 minutes separate the daily's retry slot from this
  // job. Worse, once Friday's note lands the week resolves to a DIFFERENT key,
  // so a second row and a second message would follow. Skip instead.
  const session = await checkTradingSession();
  if (session.isSession && anchors.weekEnd !== session.marketDate) {
    logger.warn(SRC, "Today traded but has no note — refusing to wrap a truncated week", {
      traded: session.marketDate,
      resolvedEnd: anchors.weekEnd,
    });
    await alertAdmin(
      `⚠️ Weekly wrap skipped: ${session.marketDate} traded but has no daily note, so the week would be wrapped as if it ended ${anchors.weekEnd}. Fix the daily note, then re-run.`,
    );
    return;
  }

  const facts = aggregateWeek(anchors);
  logger.info(SRC, "Week aggregated", {
    weekStart: facts.weekStart,
    weekEnd: facts.weekEnd,
    sessions: facts.sessions,
    indices: facts.indices.length,
    breadthDays: facts.breadth?.sessionsCovered ?? 0,
  });

  const url = webUrl(facts.weekEnd);
  const pushHtml = renderWeeklyPush(facts, url);
  const webBody = renderWeeklyWeb(facts, url);

  // Persist before sending, so a Telegram outage cannot cost the record.
  const existing = await db.select().from(weeklyNotes).where(eq(weeklyNotes.weekEnd, facts.weekEnd)).limit(1);
  const priorMessageId = existing[0]?.telegramMessageId ?? null;

  await db
    .insert(weeklyNotes)
    .values({
      weekEnd: facts.weekEnd,
      weekStart: facts.weekStart,
      sessions: facts.sessions,
      facts: JSON.stringify(facts),
      pushHtml,
      webBody,
      telegramMessageId: priorMessageId,
    })
    .onConflictDoUpdate({
      target: weeklyNotes.weekEnd,
      set: { weekStart: facts.weekStart, sessions: facts.sessions, facts: JSON.stringify(facts), pushHtml, webBody },
    });

  const chatId = Number(process.env.TELEGRAM_ADMIN_CHAT_ID);
  if (!Number.isFinite(chatId) || chatId === 0) {
    logger.error(SRC, "No chat id configured; wrap persisted but not sent", { weekEnd: facts.weekEnd });
    await alertAdmin(`⚠️ Weekly wrap ${facts.weekEnd} persisted but NOT sent: no chat id configured.`);
    process.exitCode = 1;
    return;
  }

  if (priorMessageId) {
    try {
      await editNote(chatId, priorMessageId, pushHtml);
    } catch (err) {
      if (err instanceof Error && /message to edit not found|message can't be edited/i.test(err.message)) {
        const res = await sendNote(chatId, pushHtml);
        if (res.messageId) {
          await db.update(weeklyNotes).set({ telegramMessageId: res.messageId }).where(eq(weeklyNotes.weekEnd, facts.weekEnd));
        }
      } else throw err;
    }
  } else {
    const res = await sendNote(chatId, pushHtml);
    if (res.messageId) {
      await db.update(weeklyNotes).set({ telegramMessageId: res.messageId }).where(eq(weeklyNotes.weekEnd, facts.weekEnd));
    }
  }
  logger.info(SRC, "Weekly wrap sent", { weekEnd: facts.weekEnd });
}

main().catch(async (err) => {
  logger.error(SRC, "Weekly wrap crashed", { error: err });
  await alertAdmin(`❌ Weekly wrap crashed: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
