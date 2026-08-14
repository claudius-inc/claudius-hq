/**
 * GET /api/cron/note-watchdog
 *
 * Watches the daily-note PIPELINE — not its data sources.
 *
 * Every connector failure is already caught inside the pipeline and reported to
 * Telegram by the health digest (`src/lib/notes/health.ts`). That machinery has
 * one blind spot it cannot close from the inside: **the job never running**.
 * GitHub disables scheduled workflows after 60 days of repository inactivity, and
 * a disabled cron emits nothing — no failure, no skip, no alert. A watchdog in the
 * same repository dies with it, which is why the weekly wrap cannot be the answer.
 *
 * This runs on VERCEL, on the deployed app, driven by Vercel's scheduler. It is a
 * different execution environment from GitHub Actions, so a dead Actions runner
 * leaves it running — while staying entirely inside our own infrastructure and
 * reporting to the same Telegram chat as everything else.
 *
 * Schedule: daily (vercel.json). Auth: `x-vercel-cron` or `Bearer ${CRON_SECRET}`,
 * matching the other cron routes in this directory.
 *
 * Residual risk, stated rather than hidden: if Vercel AND GitHub Actions are both
 * down, or Telegram is unreachable, nothing reports. No self-hosted watchdog can
 * close that — it needs a third party outside every system we own. The gap is
 * small and known, which is the most that is true.
 */
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, connectorHealth } from "@/db";
import { logger } from "@/lib/logger";
import { alertAdmin } from "@/lib/notes/telegram";
import { PIPELINE_HEARTBEAT } from "@/lib/notes/health-report";

export const dynamic = "force-dynamic";

const SRC = "api/cron/note-watchdog";

/**
 * How stale the heartbeat may be before it is a real absence.
 *
 * The job fires every weekday, so the longest legitimate gap is a weekend:
 * Friday's run to Monday's check is three days. Four means a weekday was missed.
 *
 * Holidays need no allowance at all, which is the whole reason the heartbeat is
 * stamped before the session gate rather than derived from the notes table — a
 * Thanksgiving run still fires, still stamps, and then skips.
 */
const MAX_HEARTBEAT_AGE_DAYS = 3;

function isAuthorized(req: NextRequest): boolean {
  if (req.headers.get("x-vercel-cron") === "1") return true;
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const rows = await db
      .select()
      .from(connectorHealth)
      .where(eq(connectorHealth.name, PIPELINE_HEARTBEAT))
      .limit(1);
    const beat = rows[0];

    // No row at all means the pipeline has not completed a single run since the
    // heartbeat shipped. On a fresh deploy that is expected for a day or two, so
    // it is reported rather than escalated.
    if (!beat) {
      logger.warn(SRC, "No pipeline heartbeat recorded yet");
      await alertAdmin(
        "WATCHDOG — the daily note pipeline has never recorded a heartbeat. If it has been more than a day since deploy, the workflow is not running.",
      );
      return NextResponse.json({ ok: false, reason: "no-heartbeat" });
    }

    const today = new Date().toISOString().slice(0, 10);
    const ageDays =
      (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${beat.lastRunDate}T00:00:00Z`)) / 86_400_000;

    if (!Number.isFinite(ageDays) || ageDays <= MAX_HEARTBEAT_AGE_DAYS) {
      logger.info(SRC, "Pipeline heartbeat is current", { lastRunDate: beat.lastRunDate, ageDays });
      return NextResponse.json({ ok: true, lastRunDate: beat.lastRunDate, ageDays });
    }

    // Deliberately says what to CHECK. A watchdog that only says something is
    // wrong makes the reader rediscover the failure mode every time.
    logger.error(SRC, "Daily note pipeline has not run", { lastRunDate: beat.lastRunDate, ageDays });
    await alertAdmin(
      `WATCHDOG — the daily note pipeline has not run since ${beat.lastRunDate} (${Math.round(ageDays)} days).\n\n` +
        "The job fires every weekday, so a gap this long is not a holiday. Check that the " +
        "Daily Market Note workflow is still enabled — GitHub disables scheduled workflows " +
        "after 60 days of repository inactivity, and a disabled cron sends no failure notice.",
    );
    return NextResponse.json({ ok: false, lastRunDate: beat.lastRunDate, ageDays });
  } catch (error) {
    // The watchdog failing is itself worth knowing, and this route runs on
    // infrastructure that is up if it is executing at all.
    logger.error(SRC, "Watchdog check failed", { error });
    await alertAdmin(
      `WATCHDOG — the note watchdog could not read the heartbeat: ${error instanceof Error ? error.message : String(error)}`,
    );
    return NextResponse.json({ ok: false, reason: "check-failed" }, { status: 500 });
  }
}
