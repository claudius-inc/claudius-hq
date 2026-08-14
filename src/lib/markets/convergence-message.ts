/**
 * The Telegram rendering for the convergence shortlist.
 *
 * WHY THIS IS A MODULE AND NOT TWO COPIES
 * ---------------------------------------
 * Two senders exist for good reasons — the screen runs on a Binance-permitted
 * VPS, the send runs in CI so the bot token never lands on that box — and each
 * had grown its own copy of this formatter. They drifted: one grew daily-trend
 * badges and 🆕/⚠️ flags, the other grew funnel counts, and a layout fix had to
 * be made twice or not at all. The renderer takes a plain row shape both callers
 * can build, so the message has one definition.
 *
 * WRITTEN FOR A PHONE, NOT A TERMINAL
 * -----------------------------------
 * The previous layout was three lines per name at 57 characters, read on a
 * screen that fits about 30. Every line wrapped mid-value, which also meant the
 * `padEnd` column alignment it was built around did nothing. The budget here is
 * `LINE_BUDGET`, and the detail that no longer fits lives on the web page the
 * button links to.
 */
import type { TrendDirection } from "@/lib/markets/equity-history";

/**
 * Characters that fit one line on the target phone, measured from a screenshot
 * at the reader's own font size — not a guess at Telegram's default. Both lines
 * of a record are built to sit under it, so nothing wraps.
 */
export const LINE_BUDGET = 30;

/** Where the numbers this message no longer carries can be read in full. */
export const SHORTLIST_URL = "https://claudiusinc.com/markets/shortlist";

/** The rendering's view of a pick. Both callers project onto this. */
export interface MessageRow {
  base: string;
  category: string;
  score: number;
  maxScore: number;
  price: number | null;
  /** Negated 1-day return — the ranking key. Printed as the move itself. */
  rev6: number | null;
  oiChangePct: number | null;
  /** Own-history volatility rank, 0-100. */
  volPctl: number | null;
  comboGated: boolean;
  freshFlag?: boolean;
  contested?: boolean;
  trend?: TrendDirection | null;
  side?: "long" | "short";
}

// Strips the legacy-Markdown control characters Telegram would choke on.
// Backtick included: an unpaired one 400s the whole message.
export const clean = (s: string) => String(s).replace(/[_*[\]`]/g, "").trim();

export const pct = (v: number | null) =>
  v === null || v === undefined ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;

/**
 * Percent with no decimal — the second line has no room for tenths of a percent
 * on a figure as noisy as open interest.
 *
 * The zero case is signed explicitly. Taking the sign from the input rather than
 * the rounded output printed "+0%" for -0.4 and "0%" for -0.6, which reads as
 * two different numbers and is the same number.
 */
const pct0 = (v: number | null) => {
  if (v === null || v === undefined) return "—";
  const n = Math.round(v);
  return n === 0 ? "0%" : `${n > 0 ? "+" : ""}${n}%`;
};

export function fmtPrice(p: number | null): string {
  if (p === null || p === undefined) return "";
  if (p >= 1000) return "$" + Math.round(p).toLocaleString("en-US");
  if (p >= 1) return "$" + p.toFixed(2);
  if (p >= 0.01) return "$" + p.toFixed(4);
  return "$" + Number(p).toPrecision(2);
}

/** Compact category marker, so a tradfi name is distinguishable at a glance. */
const CATEGORY_TAG: Record<string, string> = {
  crypto: "",
  equity: "📊",
  premarket: "🚀",
  commodity: "🛢",
  index: "📉",
};

/**
 * Compression, as a glyph only.
 *
 * The percentile itself used to be printed beside it — "coiled 4", "vol 61" —
 * which reads as a count rather than a rank, and spends five characters on a
 * number nobody acts on. The glyph carries the whole signal: coiled or moving.
 * The percentile is on the page.
 */
function compressionGlyph(volPctl: number | null): string {
  if (volPctl === null) return "";
  if (volPctl <= 25) return " 🪤";
  if (volPctl >= 75) return " 🌊";
  return "";
}

/**
 * Long-term daily trend agreement, from the underlying's own daily series.
 * Blank when no long-term read exists — crypto, pre-IPO, unmapped names.
 */
function trendGlyph(r: MessageRow): string {
  if (!r.trend || !r.side) return "";
  if (r.trend === "mixed") return " 〰️";
  const agrees =
    (r.side === "long" && r.trend === "up") || (r.side === "short" && r.trend === "down");
  return agrees ? " ✅" : " ⛔";
}

/**
 * One name, as two lines.
 *
 * Line 1 is identity and price; line 2 is why it sits where it does. The ticker
 * is the bold element and the score is not: the score gates the list but ranks
 * poorly on its own, by this project's own holdout, so it had no business being
 * the loudest token on the row. Backticks are gone from the ticker for the same
 * reason — Telegram's monospace face is lighter and narrower than the body
 * text, so the most important word on the line was rendering as the faintest.
 *
 * Line 2 is DROPPED, not left empty, when its inputs are missing. The previous
 * version emitted its separator unconditionally and a run with no ranking data
 * printed a lone "·" under every name.
 */
function renderRow(r: MessageRow, i: number): string[] {
  const tag = CATEGORY_TAG[r.category] ?? "";
  const lines = [
    `*${i + 1} ${clean(r.base)}*${tag ? " " + tag : ""} ${fmtPrice(r.price)}` +
      ` · ${r.score}/${r.maxScore}${trendGlyph(r)}`,
  ];

  const bits: string[] = [];
  // rev6 is the NEGATED return, so report the move itself: a long candidate
  // that fell 8% reads "1d -8.0%", not "+8.0".
  if (r.rev6 !== null) bits.push(`1d ${pct(-r.rev6)}`);
  if (r.oiChangePct !== null) bits.push(`OI ${pct0(r.oiChangePct)}`);

  if (bits.length) {
    const gate = r.comboGated ? "⚡ " : "";
    const flags = (r.freshFlag ? " 🆕" : "") + (r.contested ? " ⚠️" : "");
    lines.push(`   ${gate}${bits.join(" · ")}${compressionGlyph(r.volPctl)}${flags}`);
  }

  return lines;
}

export function renderSide(rows: MessageRow[], heading: string): string[] {
  if (!rows.length) return [heading, "_none cleared the threshold_", ""];
  return [heading, ...rows.flatMap(renderRow), ""];
}

/**
 * The as-of stamp in the reader's own timezone.
 *
 * `2026-08-13 23:59Z` cost a wrapped line to say something the reader then had
 * to convert. There is one recipient and they are in Singapore, so it is stated
 * once, in the header, the way the daily note does it.
 */
export function fmtAsOf(iso: string, tz = "Asia/Singapore", tzLabel = "SGT"): string {
  const d = new Date(iso.endsWith("Z") || iso.includes("+") ? iso : iso + "Z");
  if (Number.isNaN(d.getTime())) return iso;
  const f = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return `${f.format(d)} ${tzLabel}`;
}

export const HEADER = "🎯 *Convergence — Binance Perps*";

/**
 * The standing legend and the standing caveat.
 *
 * Built from the rows rather than fixed, because only one of the two senders
 * has daily-trend data: a constant legend advertised ✅/⛔/〰️ every morning in
 * a message that could never print them. A legend describing glyphs that are
 * not there teaches the reader to stop reading the legend.
 *
 * What is left repeats daily and becomes furniture within a week, so it is only
 * the glyphs actually used above it and the one caveat that changes how the
 * list should be used.
 */
export function footer(rows: MessageRow[]): string[] {
  const lines = [
    // "within the gate" is load-bearing, not padding: gated names sort ahead of
    // ungated ones regardless of their reversal, so without it the list looks
    // mis-sorted whenever an ungated name has the bigger move.
    "_⚡ cleared the volume+funding gate · ordered by 1d reversal within the gate_",
    "_🪤 coiled · 🌊 moving · 🆕 new · ⚠️ contested_",
  ];
  if (rows.some((r) => r.trend && r.side)) {
    lines.push("_✅ daily trend agrees · ⛔ opposes · 〰️ unclear_");
  }
  lines.push(
    "_A shortlist to review, not signals. ORDER validated (holdout IC 0.078, t=5.97); " +
      "PROFIT is not (top-10 basket t=0.15)._",
  );
  return lines;
}

/** Telegram inline keyboard sending the reader to the full grid and the charts. */
export const SHORTLIST_BUTTON = {
  inline_keyboard: [[{ text: "📊 Charts & full detail", url: SHORTLIST_URL }]],
};
