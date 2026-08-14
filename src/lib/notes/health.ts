/**
 * Connector health — see docs/implementation-plans/2026-08-13-tape-accuracy.md Part E.
 *
 * §1a governs the PAGE: a feed that failed is omitted, never approximated, and that
 * does not change. This is a second, separate channel — the operator gets told.
 * The reader still gets nothing rather than a guess.
 *
 * The gap this closes is real and has cost twice already. `alertAdmin` exists but
 * every one of its call sites is pipeline-level (the session gate, missing indices,
 * a missing chat id, two crash handlers). Individual connectors return `null` and
 * the note quietly omits a section — so `FOMC_DECISIONS` shipped empty for months
 * and the dealer gamma sign shipped inverted, both in silence.
 *
 * Two design rules are load-bearing and easy to get wrong:
 *
 *  1. **`empty` and `skipped` never alert.** "FRED answered and nothing is
 *     scheduled" is a fact; "FRED never answered" is an outage. The distinction
 *     already exists as `fetchUpcomingReleases`'s `answered` flag.
 *  2. **Alerts are edge-triggered with escalation.** A nightly digest for a
 *     three-week outage is fifteen identical messages, which is how a digest gets
 *     muted. See `decideAlerts`.
 */

export type ConnectorStatus = "ok" | "empty" | "skipped" | "degraded" | "down";

export interface ConnectorHealth {
  /** Must match a `CONNECTOR_REGISTRY` entry, or the registry check will flag it. */
  name: string;
  status: ConnectorStatus;
  /** Why. Required for `skipped`, `degraded` and `down` — a bare status is not actionable. */
  detail?: string;
  /** Coverage, where a partial answer is meaningful: specs scheduled vs specs resolved. */
  itemsExpected?: number;
  itemsGot?: number;
}

/**
 * Every connector the daily note expects to hear from.
 *
 * The point of an explicit list is the failure no per-call error handler can see:
 * a source that stops being CALLED at all. A run reporting fewer entries than this
 * holds is itself degraded.
 *
 * `FOMC calendar` is in here despite being a hand-maintained array rather than a
 * fetch. A static list is a source whose "fetch" is a date comparison, and keeping
 * it in the same digest is the only thing that guarantees anyone looks at it —
 * which is exactly what did not happen when it shipped empty.
 */
export const CONNECTOR_REGISTRY = [
  "Yahoo quotes",
  "Yahoo cross-asset",
  "Yahoo VIX",
  "Treasury yields",
  "WSJ breadth",
  "SPY option chain",
  "FRED calendar",
  "FRED releases",
  "FOMC calendar",
  "Nasdaq consensus",
  "SPDR holdings",
  "Attribution",
] as const;

/** A connector's state as of the previous run, from the `connector_health` table. */
export interface StoredHealth {
  name: string;
  lastStatus: ConnectorStatus;
  /** Consecutive runs in a failing state, including the last one. */
  streakCount: number;
  lastRunDate: string;
  /** The last run we actually SENT an alert for. Null means never alerted. */
  lastAlertedDate: string | null;
}

const isFailing = (s: ConnectorStatus): boolean => s === "degraded" || s === "down";

/** Whole days between two YYYY-MM-DD dates. */
function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return Number.POSITIVE_INFINITY;
  return (b - a) / 86_400_000;
}

/** How often a persistent failure is repeated once it has been reported twice. */
const REMINDER_DAYS = 7;

export interface HealthDecision {
  /** Failing connectors that earned a message this run. */
  alerts: ConnectorHealth[];
  /** Connectors that recovered from a failure the operator was actually told about. */
  recovered: string[];
  /** Every connector's new stored state, to be written unconditionally. */
  updates: StoredHealth[];
  /** True when the digest should be sent at all. */
  shouldSend: boolean;
}

/**
 * Which failures earn a message tonight.
 *
 * Pure, and separated from both the database and Telegram, because the escalation
 * rules are the part with real behaviour and they need a test rather than a
 * production outage to exercise them.
 *
 * Edge-triggering alone has a hole: a connector that alternates down, ok, down, ok
 * produces an edge every night, which is noisier than the nightly digest it
 * replaced. That is not hypothetical — Yahoo blanks open interest across the whole
 * option chain overnight, measured 2026-08-13. So:
 *
 *  - `down` alerts immediately. A first 403 from an IP block should land the same
 *    evening.
 *  - `degraded` waits for a SECOND consecutive session. A degradation that heals
 *    overnight is the one event the operator cannot act on — it is over before
 *    they read the message — so suppressing it costs nothing.
 *  - Then again on the third session, then weekly. Silence in between.
 *  - Recovery is reported only for a failure that was actually alerted, or
 *    recovery re-introduces the noise the rules above just removed.
 */
export function decideAlerts(
  current: ConnectorHealth[],
  prior: StoredHealth[],
  runDate: string,
): HealthDecision {
  const priorByName = new Map(prior.map((p) => [p.name, p]));
  const alerts: ConnectorHealth[] = [];
  const recovered: string[] = [];
  const updates: StoredHealth[] = [];

  for (const h of current) {
    const was = priorByName.get(h.name);

    if (!isFailing(h.status)) {
      // Only worth announcing if the operator was told it was broken.
      if (was && isFailing(was.lastStatus) && was.lastAlertedDate) recovered.push(h.name);
      updates.push({
        name: h.name,
        lastStatus: h.status,
        streakCount: 0,
        lastRunDate: runDate,
        lastAlertedDate: null,
      });
      continue;
    }

    const streak = (was && isFailing(was.lastStatus) ? was.streakCount : 0) + 1;
    // `down` is louder than `degraded` from the first session.
    const firstAlertAt = h.status === "down" ? 1 : 2;
    const sinceAlert = was?.lastAlertedDate ? daysBetween(was.lastAlertedDate, runDate) : null;

    const send =
      streak === firstAlertAt ||
      (streak === 3 && firstAlertAt < 3) ||
      (sinceAlert == null ? streak >= firstAlertAt : sinceAlert >= REMINDER_DAYS);

    if (send) alerts.push(h);
    updates.push({
      name: h.name,
      lastStatus: h.status,
      streakCount: streak,
      lastRunDate: runDate,
      lastAlertedDate: send ? runDate : was?.lastAlertedDate ?? null,
    });
  }

  return { alerts, recovered, updates, shouldSend: alerts.length > 0 || recovered.length > 0 };
}

/**
 * Registry entries that did not report, as synthetic `degraded` records.
 *
 * This is the check that catches a connector which stopped being called rather
 * than failing — no per-call error handler can see that, because there is no call.
 */
export function missingFromRegistry(current: ConnectorHealth[]): ConnectorHealth[] {
  const seen = new Set(current.map((c) => c.name));
  return CONNECTOR_REGISTRY.filter((n) => !seen.has(n)).map((name) => ({
    name,
    status: "degraded" as const,
    detail: "did not report this run — the connector may no longer be called",
  }));
}

/** Coverage as a clause, when the connector reported it. */
function coverage(h: ConnectorHealth): string {
  if (h.itemsExpected == null || h.itemsGot == null) return "";
  return ` (${h.itemsGot}/${h.itemsExpected})`;
}

function line(h: ConnectorHealth, streak: number): string {
  const detail = h.detail ? ` — ${h.detail}` : "";
  const age = streak >= 2 ? `  [${streak}${streak === 2 ? "nd" : streak === 3 ? "rd" : "th"} session]` : "";
  return `  ${h.name}${detail}${coverage(h)}${age}`;
}

/**
 * The digest, as plain text for Telegram.
 *
 * `skipped` entries appear ONLY on a run that already has failures. A connector
 * that legitimately did nothing is noise on a healthy night, but on a broken one
 * it is the difference between "sectors is down" and "sectors is down, which is
 * why three other things did nothing" — the cascade has to read as one story.
 */
export function formatDigest(
  date: string,
  decision: HealthDecision,
  all: ConnectorHealth[],
): string {
  const streakOf = (name: string) => decision.updates.find((u) => u.name === name)?.streakCount ?? 1;
  const parts: string[] = [`CONNECTORS — daily note ${date}`];

  const down = decision.alerts.filter((a) => a.status === "down");
  const degraded = decision.alerts.filter((a) => a.status === "degraded");

  if (down.length > 0) parts.push("", "DOWN", ...down.map((h) => line(h, streakOf(h.name))));
  if (degraded.length > 0) parts.push("", "DEGRADED", ...degraded.map((h) => line(h, streakOf(h.name))));
  if (decision.recovered.length > 0) {
    parts.push("", "RECOVERED", ...decision.recovered.map((n) => `  ${n}`));
  }

  const skipped = all.filter((h) => h.status === "skipped");
  if (decision.alerts.length > 0 && skipped.length > 0) {
    parts.push("", "SKIPPED (shown because this run has failures)");
    parts.push(...skipped.map((h) => `  ${h.name}${h.detail ? ` — ${h.detail}` : ""}`));
  }

  const healthy = all.filter((h) => h.status === "ok" || h.status === "empty").map((h) => h.name);
  if (healthy.length > 0) parts.push("", `OK: ${healthy.join(", ")}`);

  return parts.join("\n");
}
