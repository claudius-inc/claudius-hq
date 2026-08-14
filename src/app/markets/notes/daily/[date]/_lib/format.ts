import { etWallClockToInstant } from "@/lib/time/zones";

/**
 * Number and date formatting for the daily note page.
 *
 * Deliberately mirrors `src/lib/notes/render.ts`: signed percentages, never
 * ▲/▼ glyphs (they font-substitute per platform), and no emoji anywhere. The
 * web page renders from `StructuredFacts` rather than the pre-baked push HTML,
 * so it needs its own copy of the conventions the push already follows.
 */

/** Signed percentage, e.g. "+1.5%" / "-0.6%". */
export function spct(pct: number, dp = 1): string {
  return `${pct >= 0 ? "+" : ""}${pct.toFixed(dp)}%`;
}

/**
 * Signed percentage POINTS, e.g. "+0.40pp". Contribution figures are points of
 * index move, not percentages of anything — rendering `topPoints` through
 * `spct` produced "-0.4% of the index's -0.1%", which reads as a ratio and is
 * off by two orders of magnitude if taken literally.
 */
export function spp(points: number, dp = 2): string {
  return `${points >= 0 ? "+" : ""}${points.toFixed(dp)}pp`;
}

/** Signed basis points, e.g. "+6bp". */
export function sbp(n: number): string {
  return `${n >= 0 ? "+" : ""}${n}bp`;
}

/** Thousands-separated integer. */
export function intFmt(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

/** 1 → "1st", 2 → "2nd", 11 → "11th", 23 → "23rd". */
export function ordinal(n: number): string {
  const v = Math.round(n);
  const rem100 = v % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${v}th`;
  switch (v % 10) {
    case 1:
      return `${v}st`;
    case 2:
      return `${v}nd`;
    case 3:
      return `${v}rd`;
    default:
      return `${v}th`;
  }
}

/**
 * Direction colour for a change. Zero is neutral rather than positive: a flat
 * print is not a gain, and painting it emerald overstates eleven sectors'
 * worth of rounding.
 *
 * The 700 steps, NOT the 600 steps the style guide names for financial text.
 * Measured against white, `emerald-600` (#059669) is 3.77:1 and `red-600`
 * (#dc2626) is 4.83:1 — so on a page that is mostly `text-sm` tables, every
 * GAIN failed WCAG AA while every loss passed. A page that is systematically
 * harder to read when the market is up is worse than one that is uniformly
 * hard. `emerald-700` is 5.48:1 and `red-700` 6.47:1, and using the same step
 * on both sides keeps the pair balanced in weight.
 *
 * This is a deviation from docs/STYLE-GUIDE.md, which needs the same fix
 * site-wide; it is recorded here rather than silently diverging.
 */
export function toneClass(v: number): string {
  if (v > 0) return "text-emerald-700";
  if (v < 0) return "text-red-700";
  return "text-gray-500";
}

/**
 * The same three-way split, as a fill for chart marks.
 *
 * These are the emerald-600 / red-600 hexes, NOT the `--chart-up` /
 * `--chart-down` tokens in globals.css. Those tokens exist for the shortlist
 * canvas charts and are a deeper pair (#1f7a52 / #a83a31) that separates by
 * only ΔE 5.0 under deuteranopia — below the ΔE 6 floor. This pair clears it at
 * 8.6 on the same metric (OKLab ×100, per the dataviz validator).
 *
 * These are FILLS, not ink. Text uses `toneClass`, which steps one darker for
 * contrast. A fill only has to clear 3:1 as a graphical object, which
 * emerald-600 does at 3.77:1.
 *
 * Colour is never the sole encoding, which matters more here than the CVD
 * margin: the two fills are near-identical in LIGHTNESS, so they are
 * indistinguishable in greyscale or a mono print. Every bar is anchored to a
 * centre origin, so which side of the origin it extends carries the sign on its
 * own, and the signed value is always printed in the same row.
 */
export const MARK_UP = "#059669";
export const MARK_DOWN = "#dc2626";
export const MARK_NEUTRAL = "#9ca3af";

export function fillFor(v: number): string {
  if (v > 0) return MARK_UP;
  if (v < 0) return MARK_DOWN;
  return MARK_NEUTRAL;
}

/** "Monday, August 10, 2026" — always read in UTC so the ISO date is literal. */
export function prettyDate(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

/**
 * "Aug 13, Thu" — the archive list, where the weekday carries more than the year.
 *
 * Which session a note covers is most of what a reader scans for: a Monday note
 * opens on the weekend's news and a Friday one closes the week, and that is
 * invisible in a bare date. The year is dropped rather than added because the
 * list is sorted newest-first, so it is recoverable from position, while the
 * weekday is not recoverable from anything.
 */
export function shortDayDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  const md = d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  const wd = d.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
  return `${md}, ${wd}`;
}

/** "Aug 10" — for dense contexts such as the prev/next rail. */
export function shortDate(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/**
 * A bare ET wall-clock string as an ISO instant, anchored to its ET date.
 *
 * Parts of the fact set carry a formatted ET reading rather than a timestamp —
 * `MacroRelease.timeEt` ("8:30"), `PostMarketMove.asOfEt` ("6:14pm"), and both
 * are already written into every archived note, so they cannot be re-typed.
 * Anchoring them to the session date recovers the instant, which is what
 * `LocalTime` needs to read them in the viewer's zone.
 */
export function etClockIso(etDate: string, etClock: string): string | null {
  return etWallClockToInstant(etDate, etClock)?.toISOString() ?? null;
}

