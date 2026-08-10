/**
 * Trading-session / timezone / holiday gate — see docs/daily-note-spec.md §7a.
 *
 * The repo has no US market-holiday calendar, so the gate is quote-based:
 * generate ONLY if `^GSPC`'s last regular-session print is today-ET AND the cash
 * session has closed (`marketState ∈ {POST, POSTPOST, CLOSED}`). This rejects
 * both holidays (stale prior close, not-today timestamp) and mid-session runs
 * (a workflow_dispatch or DST bug that would snapshot live prices as "the close").
 *
 * A failed gate is a graceful skip (exit 0), so the caller — not a workflow
 * failure step — must alert the admin.
 */
import YahooFinance from "yahoo-finance2";
import { logger } from "@/lib/logger";

const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });
const SRC = "notes/session";

const CLOSED_STATES = new Set(["POST", "POSTPOST", "CLOSED"]);

/**
 * Defensive timestamp coercion — Yahoo returns a Date, epoch seconds, epoch
 * milliseconds, or a string, depending on the field and the endpoint.
 *
 * This is the single copy for the whole note pipeline. Three modules had grown
 * their own, which is how the same field ends up classified two ways in one run.
 */
export function toMs(t: unknown): number {
  if (!t) return 0;
  if (t instanceof Date) return t.getTime();
  if (typeof t === "string") return Date.parse(t);
  if (typeof t === "number") return t > 1e12 ? t : t * 1000;
  return 0;
}

/**
 * Minutes since ET midnight for an instant. The note's session arithmetic —
 * which half of the session a report landed in, whether an extended print is
 * after the close — is all expressed in these.
 */
export function etMinutes(ms: number): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(new Date(ms));
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return (h % 24) * 60 + m;
}

/** Calendar date (YYYY-MM-DD) of an epoch-ms instant, in America/New_York. */
export function etDate(ms: number): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(ms));
}

/** Today's ET market date. */
export function etToday(now = Date.now()): string {
  return etDate(now);
}

/** ET UTC-offset string ("-04:00" EDT / "-05:00" EST) for an instant. */
export function etOffset(ms: number): string {
  const name = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    timeZoneName: "longOffset",
  })
    .formatToParts(new Date(ms))
    .find((p) => p.type === "timeZoneName")?.value;
  const m = name?.match(/GMT([+-]\d{2}:\d{2})/);
  return m ? m[1] : "-05:00";
}

/** ISO stamp for `hhmmss` ET on `marketDate` (YYYY-MM-DD). */
export function etStamp(marketDate: string, hms: string, now = Date.now()): string {
  return `${marketDate}T${hms}${etOffset(now)}`;
}

export interface SessionCheck {
  /** True only if today-ET was a completed trading session. */
  isSession: boolean;
  /** The ET market date to generate for (the session's date). */
  marketDate: string;
  marketState: string | null;
  /** ET date of the quote's last regular print (for diagnostics). */
  quoteDate: string | null;
  reason: string;
}

export async function checkTradingSession(now = Date.now()): Promise<SessionCheck> {
  const today = etToday(now);
  try {
    const q = (await yahooFinance.quote("^GSPC")) as {
      regularMarketTime?: unknown;
      marketState?: string;
    };
    const ms = toMs(q?.regularMarketTime);
    const quoteDate = ms > 0 ? etDate(ms) : null;
    const marketState = q?.marketState ?? null;

    const isToday = quoteDate === today;
    const isClosed = marketState != null && CLOSED_STATES.has(marketState);
    const isSession = isToday && isClosed;

    const reason = isSession
      ? "closed session confirmed"
      : !isToday
        ? `not today-ET (last print ${quoteDate ?? "unknown"})`
        : `session not closed (marketState=${marketState ?? "unknown"})`;

    if (!isSession) logger.info(SRC, `Session gate: skip — ${reason}`, { today, quoteDate, marketState });
    return { isSession, marketDate: today, marketState, quoteDate, reason };
  } catch (error) {
    logger.error(SRC, "Session gate check failed", { error });
    // A feed failure is a skip, not a fabricated session.
    return { isSession: false, marketDate: today, marketState: null, quoteDate: null, reason: "quote fetch failed" };
  }
}
