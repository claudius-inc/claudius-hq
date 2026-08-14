/**
 * Persisting connector health and sending the digest.
 *
 * Split from `health.ts` on purpose: the escalation RULES are pure and tested,
 * this is the part that touches the database and Telegram. Nothing here can throw
 * into the pipeline — a broken alert must never cost the note.
 */
import { db, connectorHealth } from "@/db";
import { logger } from "@/lib/logger";
import { alertAdmin } from "@/lib/notes/telegram";
import {
  decideAlerts,
  formatDigest,
  type ConnectorHealth,
  type StoredHealth,
  type ConnectorStatus,
} from "@/lib/notes/health";

const SRC = "notes/health-report";

/**
 * Reserved `connector_health` row recording that the PIPELINE ran.
 *
 * Not a connector, and deliberately not in `CONNECTOR_REGISTRY` — the digest
 * never mentions it and `decideAlerts` never sees it, because it is read by
 * something outside this process entirely. It lives in this table only to avoid a
 * second one for a single row.
 */
export const PIPELINE_HEARTBEAT = "__pipeline__";

/**
 * Stamp that the job ran, before anything can go wrong.
 *
 * Called at the very top of the pipeline — ahead of the session gate, the
 * assembly and the send — because it answers "did the scheduler fire", which is
 * the one failure every other guard in this file is blind to. A gate skip on a
 * holiday still stamps it, which is what lets the watchdog tell a quiet market
 * from a dead cron without knowing the market calendar.
 */
export async function recordPipelineHeartbeat(): Promise<void> {
  const nowIso = new Date().toISOString();
  const runDate = nowIso.slice(0, 10);
  try {
    await db
      .insert(connectorHealth)
      .values({
        name: PIPELINE_HEARTBEAT,
        lastStatus: "ok",
        streakCount: 0,
        lastRunDate: runDate,
        lastDetail: nowIso,
      })
      .onConflictDoUpdate({
        target: connectorHealth.name,
        set: { lastStatus: "ok", lastRunDate: runDate, lastDetail: nowIso },
      });
  } catch (error) {
    // Never fatal. A missing heartbeat is exactly what the watchdog reports on,
    // so a failure here is already covered by the mechanism it belongs to.
    logger.warn(SRC, "Pipeline heartbeat failed", { error });
  }
}

/**
 * Record this run's health, and tell the operator if anything earned it.
 *
 * Called AFTER the note is sent, in its own try/catch, so that a Telegram outage
 * or a schema problem costs the digest and nothing else.
 *
 * The write is unconditional and happens even when nothing is sent — the streak
 * counter is only useful if every run updates it, and the runs that matter most
 * are the ones that would otherwise bail out early.
 */
export async function reportHealth(date: string, current: ConnectorHealth[]): Promise<void> {
  try {
    const rows = await db.select().from(connectorHealth);
    const prior: StoredHealth[] = rows.map((r) => ({
      name: r.name,
      lastStatus: r.lastStatus as ConnectorStatus,
      streakCount: r.streakCount,
      lastRunDate: r.lastRunDate,
      lastAlertedDate: r.lastAlertedDate,
    }));

    const decision = decideAlerts(current, prior, date);

    for (const u of decision.updates) {
      const detail = current.find((c) => c.name === u.name)?.detail ?? null;
      await db
        .insert(connectorHealth)
        .values({
          name: u.name,
          lastStatus: u.lastStatus,
          streakCount: u.streakCount,
          lastRunDate: u.lastRunDate,
          lastAlertedDate: u.lastAlertedDate,
          lastDetail: detail,
        })
        .onConflictDoUpdate({
          target: connectorHealth.name,
          set: {
            lastStatus: u.lastStatus,
            streakCount: u.streakCount,
            lastRunDate: u.lastRunDate,
            lastAlertedDate: u.lastAlertedDate,
            lastDetail: detail,
          },
        });
    }

    logger.info(SRC, "Connector health recorded", {
      date,
      failing: current.filter((c) => c.status === "degraded" || c.status === "down").map((c) => c.name),
      alerting: decision.alerts.map((a) => a.name),
      recovered: decision.recovered,
    });

    // A healthy run says nothing. A daily all-clear is how a digest gets muted.
    if (!decision.shouldSend) return;
    await alertAdmin(formatDigest(date, decision, current));
  } catch (error) {
    logger.error(SRC, "Health report failed — the note itself is unaffected", { error });
  }
}
