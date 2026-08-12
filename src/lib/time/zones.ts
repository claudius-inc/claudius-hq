/**
 * Timezone conversion for anything the reader is meant to act on.
 *
 * The market data underneath is ET — some of it as ISO instants, some as bare
 * ET wall-clock strings the pipelines already formatted ("8:30", "6:14pm").
 * The reader is not in ET, so the pages render every clock in the viewer's own
 * zone and say which zone that is.
 *
 * Pure and isomorphic on purpose: the server renders the ET reading (which it
 * can compute deterministically) and the client re-renders the same instant
 * locally after mount. Both halves call into here.
 */

export const ET_ZONE = "America/New_York";

/** How far a zone is ahead of UTC at a given instant, in milliseconds. */
export function zoneOffsetMs(timeZone: string, at: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);
  const f: Record<string, number> = {};
  for (const p of parts) if (p.type !== "literal") f[p.type] = Number(p.value);
  return Date.UTC(f.year, f.month - 1, f.day, f.hour, f.minute, f.second) - at.getTime();
}

/** The YYYY-MM-DD an instant falls on in a zone. */
export function zoneDate(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}

/**
 * An ET wall-clock reading on an ET calendar date, as a real instant.
 *
 * Read twice: the first offset is sampled at a guessed instant, which is on the
 * wrong side of the boundary on the two DST days a year. Re-sampling at the
 * corrected instant settles it.
 */
export function etWallClockToInstant(etDate: string, etClock: string): Date | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(etDate);
  const parsed = parseEtClock(etClock);
  if (!d || !parsed) return null;

  const naive = Date.UTC(
    Number(d[1]),
    Number(d[2]) - 1,
    Number(d[3]),
    parsed.hour24,
    parsed.minute,
  );
  const first = naive - zoneOffsetMs(ET_ZONE, new Date(naive));
  return new Date(naive - zoneOffsetMs(ET_ZONE, new Date(first)));
}

/** "8:30" and "6:14pm" are both shapes the pipelines emit. */
function parseEtClock(clock: string): { hour24: number; minute: number } | null {
  const m =
    /^\s*(\d{1,2}):(\d{2})\s*([ap])\.?m\.?\s*$/i.exec(clock) ??
    /^\s*(\d{1,2}):(\d{2})\s*$/.exec(clock);
  if (!m) return null;

  let hour24 = Number(m[1]);
  const minute = Number(m[2]);
  if (hour24 > 23 || minute > 59) return null;

  const meridiem = m[3]?.toLowerCase();
  if (meridiem === "p" && hour24 < 12) hour24 += 12;
  if (meridiem === "a" && hour24 === 12) hour24 = 0;
  return { hour24, minute };
}

/** "4:00 PM" → "4:00pm". The uppercase form is shouty next to body text. */
function tidyMeridiem(t: string): string {
  return t.replace(/\s?([AP])M/i, (_, p: string) => p.toLowerCase() + "m");
}

/**
 * The zone's short label, e.g. "EDT", "GMT+8". Intl's own answer rather than a
 * hand-kept abbreviation table — a table would be wrong for exactly the zones
 * nobody thought to add.
 */
export function zoneAbbr(timeZone: string, at: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "short" }).formatToParts(at);
  return parts.find((p) => p.type === "timeZoneName")?.value ?? timeZone;
}

/** The zone's readable name, e.g. "Singapore Time", "ET". */
export function zoneName(timeZone: string, at: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "shortGeneric",
  }).formatToParts(at);
  return parts.find((p) => p.type === "timeZoneName")?.value ?? timeZone;
}

/** The zone the browser is set to. Falls back to ET where Intl has no answer. */
export function viewerZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || ET_ZONE;
  } catch {
    return ET_ZONE;
  }
}

/** True when a zone keeps the same clock as ET, so "not ET" would be a lie. */
export function isEasternClock(timeZone: string, at: Date): boolean {
  return timeZone === ET_ZONE || zoneOffsetMs(timeZone, at) === zoneOffsetMs(ET_ZONE, at);
}

export interface ClockOptions {
  /** Prefix the date, e.g. "Mar 19, 2:00am GMT+8". */
  withDate?: boolean;
  /**
   * Append "(+1d)" when the instant reads on a different calendar day here than
   * it does in ET. Without it, a 4:00pm ET close renders as "4:00am" against a
   * session dated the day before, which states something untrue. Ignored when
   * `withDate` is set — the date already carries it.
   */
  markEtDayShift?: boolean;
  /** Override the label, e.g. "ET" instead of Intl's "EDT". */
  abbr?: string;
}

/** An instant as wall-clock in a zone, e.g. "4:00am GMT+8 (+1d)". */
export function formatClock(at: Date, timeZone: string, opts: ClockOptions = {}): string {
  const time = tidyMeridiem(
    at.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone }),
  );
  const label = opts.abbr ?? zoneAbbr(timeZone, at);

  if (opts.withDate) {
    const day = at.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      timeZone,
    });
    return `${day}, ${time} ${label}`;
  }

  const shift = opts.markEtDayShift ? etDayShift(at, timeZone) : "";
  return `${time} ${label}${shift}`;
}

/** " (+1d)" / " (−1d)" when a zone reads the instant on a different date to ET. */
function etDayShift(at: Date, timeZone: string): string {
  const here = zoneDate(at, timeZone);
  const there = zoneDate(at, ET_ZONE);
  if (here === there) return "";

  const delta = Math.round(
    (Date.parse(`${here}T00:00:00Z`) - Date.parse(`${there}T00:00:00Z`)) / 86_400_000,
  );
  if (!Number.isFinite(delta) || delta === 0) return "";
  return ` (${delta > 0 ? "+" : "−"}${Math.abs(delta)}d)`;
}

/**
 * How long ago an instant was, in words: "just now", "12 mins ago", "3 hours
 * ago", "2 days ago".
 *
 * Deliberately coarse. A freshness line is read to answer "is this current",
 * and a figure that ticks by the second invites the reader to trust a precision
 * the underlying data does not have.
 */
export function relativeAge(at: Date, now: Date): string {
  const minutes = Math.floor((now.getTime() - at.getTime()) / 60_000);
  if (minutes < 0) return "just now";
  if (minutes < 1) return "just now";
  if (minutes === 1) return "1 min ago";
  if (minutes < 60) return `${minutes} mins ago`;

  const hours = Math.floor(minutes / 60);
  if (hours === 1) return "1 hour ago";
  if (hours < 24) return `${hours} hours ago`;

  const days = Math.floor(hours / 24);
  return days === 1 ? "1 day ago" : `${days} days ago`;
}
