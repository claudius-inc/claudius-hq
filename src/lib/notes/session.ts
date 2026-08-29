/**
 * Trading-session / timezone / holiday gate — see docs/daily-note-spec.md §7a.
 *
 * The repo has no US market-holiday calendar, so the gate is quote-based, keyed
 * off `^GSPC`. It generates for the session that ACTUALLY CLOSED — the ET date
 * of the S&P's last regular print — and refuses only two things:
 *
 *   1. A LIVE session (`marketState === "REGULAR"`), where the last print is a
 *      mid-session snapshot, not a close.
 *   2. A STALE feed (last print older than a long holiday weekend), which means
 *      the quote is frozen rather than reporting a real session.
 *
 * WHY MARKETDATE IS THE QUOTE'S DATE, NOT WALL-CLOCK "TODAY"
 * ---------------------------------------------------------
 * The old gate required the last print to equal today-ET and published for
 * today-ET. That silently assumed the job runs the same ET calendar day as the
 * session. It does not: GitHub Actions delivers scheduled crons late — observed
 * 5-8h on 2026-08-26/27 — and a run that slips past ET midnight then computed
 * the NEXT day, saw the just-closed session as "not today-ET", and skipped it.
 * The 22:20/23:20 UTC crons (6:20/7:20pm ET) skipped whole sessions this way.
 *
 * Keying the note's date to the session that closed makes a delayed run publish
 * the session it was meant to, at the correct date, however late GitHub is. It
 * cannot mislabel a stale session with fresh data either: the quote's date IS
 * the latest completed session, and every live feed reflects that same session
 * until the next one opens — at which point the quote's date advances with them.
 *
 * A failed gate is a graceful skip (exit 0), so the caller — not a workflow
 * failure step — must alert the admin.
 */
import YahooFinance from "yahoo-finance2";
import { logger } from "@/lib/logger";

const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });
const SRC = "notes/session";

/**
 * The last print is a completed session in every state EXCEPT `REGULAR`
 * (in-session, live) — a denylist rather than the old {POST,POSTPOST,CLOSED}
 * allowlist, because a run delayed into the next day's PRE window is still
 * publishing the PRIOR session's completed close, and an allowlist that omitted
 * PRE would skip it. Only REGULAR carries a non-final print.
 */
const LIVE_STATE = "REGULAR";

/**
 * A last print older than this means the feed is frozen, not that a real
 * session is being reported. Six days clears the longest realistic gap — a
 * Thursday close bracketed by a Friday holiday, the weekend, and a Monday
 * holiday, read on the Wednesday — while still rejecting a genuinely stuck quote.
 */
const MAX_SESSION_AGE_DAYS = 6;

const dayDiff = (fromDate: string, toDate: string): number =>
  Math.round((Date.parse(`${toDate}T00:00:00Z`) - Date.parse(`${fromDate}T00:00:00Z`)) / 86_400_000);

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
  /** True when the S&P's last print is a completed, non-stale session. */
  isSession: boolean;
  /** The ET market date to generate for — the session that closed, NOT
   *  wall-clock today, so a delayed run still publishes the right session. */
  marketDate: string;
  marketState: string | null;
  /** ET date of the quote's last regular print (for diagnostics). */
  quoteDate: string | null;
  reason: string;
}

/**
 * The gate decision, without the network — pure so it can be tested against the
 * exact run timestamps that exposed the delay bug. `regularMarketTimeMs` is the
 * S&P's last regular print in epoch ms (0 when absent).
 */
export function evaluateSession(
  now: number,
  regularMarketTimeMs: number,
  marketState: string | null,
): SessionCheck {
  const today = etToday(now);
  const quoteDate = regularMarketTimeMs > 0 ? etDate(regularMarketTimeMs) : null;

  // A present, non-empty state that is not the live one. Empty/whitespace is
  // treated as absent — a fresh-but-garbage quote must not pass where the old
  // allowlist would have rejected it.
  const hasState = marketState !== null && marketState.trim() !== "";
  const isLive = marketState === LIVE_STATE;
  const ageDays = quoteDate ? dayDiff(quoteDate, today) : Infinity;
  const isFresh = quoteDate !== null && ageDays <= MAX_SESSION_AGE_DAYS && ageDays >= 0;
  const isSession = hasState && !isLive && isFresh;

  // The date is the session that closed, never wall-clock today — that is the
  // whole point of the fix.
  const marketDate = quoteDate ?? today;

  const reason = isSession
    ? "closed session confirmed"
    : !hasState
      ? "quote missing marketState"
      : isLive
        ? "session in progress (marketState=REGULAR)"
        : quoteDate === null
          ? "no last-print timestamp"
          : `last print ${quoteDate} is stale (${ageDays}d old)`;

  return { isSession, marketDate, marketState, quoteDate, reason };
}

export async function checkTradingSession(now = Date.now()): Promise<SessionCheck> {
  try {
    const q = (await yahooFinance.quote("^GSPC")) as {
      regularMarketTime?: unknown;
      marketState?: string;
    };
    const result = evaluateSession(now, toMs(q?.regularMarketTime), q?.marketState ?? null);
    if (!result.isSession) {
      logger.info(SRC, `Session gate: skip — ${result.reason}`, {
        today: etToday(now),
        quoteDate: result.quoteDate,
        marketState: result.marketState,
      });
    }
    return result;
  } catch (error) {
    logger.error(SRC, "Session gate check failed", { error });
    // A feed failure is a skip, not a fabricated session.
    return { isSession: false, marketDate: etToday(now), marketState: null, quoteDate: null, reason: "quote fetch failed" };
  }
}
