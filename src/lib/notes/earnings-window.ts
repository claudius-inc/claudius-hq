/**
 * Which session is a report's REACTION day — see docs/daily-note-v2-spec.md §B.
 *
 * Yahoo's `earningsTimestamp` is a session-half placeholder, not a real release
 * time: before-open reporters are stamped 08:30 ET and after-close reporters
 * 16:00 ET (verified across WMT/PG/KO/MCD at 08:30 and AAPL/AKAM/AMD at 16:00).
 * So an "is the instant inside this interval" test is wrong in both directions —
 * it misses every before-open reporter, and it blames a report for the regular
 * session that closed before it. Classify by date + session half instead.
 *
 * Finnhub's earnings calendar carries an explicit `bmo`/`amc` field and is the
 * better signal where available (§A); this module is the Yahoo-only fallback and
 * the shared vocabulary both paths resolve to.
 */
import { etDate } from "@/lib/notes/session";

/** Where a report sits relative to the session we are writing about. */
export type EarningsPlacement =
  /** Reported before today's open → today's regular session is the reaction. */
  | "reaction-today-bmo"
  /** Reported after the prior close → today's regular session is the reaction. */
  | "reaction-today-amc"
  /** Reported after today's close → only the extended session can react (§G). */
  | "after-todays-close"
  /** Weekend stamp, future date, missing — not classifiable, so no attribution. */
  | "none";

/** Minutes since ET midnight for an instant. */
function etMinutes(ms: number): number {
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

/** Defensive timestamp coercion — Yahoo returns Date, epoch-s, or a string. */
export function toMs(t: unknown): number {
  if (!t) return 0;
  if (t instanceof Date) return t.getTime();
  if (typeof t === "string") return Date.parse(t);
  if (typeof t === "number") return t > 1e12 ? t : t * 1000;
  return 0;
}

const OPEN_MIN = 9 * 60 + 30; // 09:30 ET

export interface PlacementInput {
  /** Yahoo `earningsTimestamp`, or a Finnhub-derived instant. */
  stamp: unknown;
  /** The session being written about, YYYY-MM-DD ET. */
  marketDate: string;
  /** The previous trading session's date, YYYY-MM-DD ET. */
  priorSessionDate: string | null;
  /**
   * Minutes-since-ET-midnight of today's actual close. Never hardcode 16:00 —
   * a half-day closes at 13:00 and the boundary must move with it.
   */
  closeMinute: number;
}

/** Classify a report against the session we are writing about. */
export function placeEarnings({
  stamp,
  marketDate,
  priorSessionDate,
  closeMinute,
}: PlacementInput): EarningsPlacement {
  const ms = toMs(stamp);
  // Number.isFinite first: Date.parse of a bad string is NaN, every comparison
  // against NaN is false, and NaN would reach the ET formatter and throw —
  // killing the whole note over one malformed field among 503 quotes.
  if (!Number.isFinite(ms) || ms <= 0) return "none";
  const day = etDate(ms);
  const minute = etMinutes(ms);

  if (day === marketDate) {
    if (minute <= OPEN_MIN) return "reaction-today-bmo";
    if (minute >= closeMinute) return "after-todays-close";
    // Mid-session stamp: not a real placeholder value, so do not guess.
    return "none";
  }
  // The stamp also rolls FORWARD to the next confirmed report, sometimes with
  // isEarningsDateEstimate false — so a future date must never be treated as
  // "just reported".
  if (priorSessionDate && day === priorSessionDate && minute >= OPEN_MIN) {
    return "reaction-today-amc";
  }
  return "none";
}

/** True when today's regular session is the one reacting to the report. */
export function isReactionDay(p: EarningsPlacement): boolean {
  return p === "reaction-today-bmo" || p === "reaction-today-amc";
}
