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
import type { GroupRegime, RegimeSummary } from "@/lib/markets/perp-regime";

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
 * Contexts the regime block shows, in a FIXED order.
 *
 * Not "the largest groups", which was the first attempt: group sizes move with
 * the liquidity floor, so the block would reshuffle between days and the reader
 * would have to re-find their line every morning. A fixed spine is learnable.
 * Anything present but unlisted fills the remaining slots by size.
 */
const REGIME_SPINE = ["majors", "alts", "semis", "tech"];

/**
 * Residual buckets — a name that matched no sector, not a context.
 *
 * Printed nowhere, kept in the summary. "equity-other" is reliably one of the
 * largest groups by count and says nothing, so on a four-line block it would
 * displace a line that means something.
 */
const REGIME_RESIDUAL = new Set(["equity-other"]);

/** Groups shown. Four covers both books at two per line. */
const REGIME_MAX_GROUPS = 4;

/**
 * Groups per line.
 *
 * The spine is two books — majors/alts is crypto, semis/tech is equities — so
 * pairing positionally puts one book on each line. That grouping is SEMANTIC,
 * not typographic, which is the whole point: it survives a proportional font,
 * where the `padEnd(6)` column this block was first built around did not.
 */
const REGIME_PER_LINE = 2;

/** Short enough for the 30-character line. */
const GROUP_LABEL: Record<string, string> = {
  majors: "majors",
  alts: "alts",
  semis: "semis",
  tech: "tech",
  financials: "financ",
  consumer: "consmr",
  industrial: "indust",
  commodity: "cmdty",
  premarket: "premkt",
  "crypto-equity": "cr-eq",
};

/**
 * Horizon the block describes, and the caption it prints.
 *
 * `ret7` and not `ret30`. A message that goes out every morning describing a
 * 30-day median is reporting something the reader has already lived through,
 * and the 7-day read is the only one every group has the history to fill: the
 * tradfi book is the young cohort, and at 90 days `industrial` and
 * `equity-other` fall under the 5-name floor entirely while `semis` and `tech`
 * roughly halve. See the coverage table in
 * `scripts/research/run-perp-regime-windows.ts`.
 */
const REGIME_HORIZON = "7d";

/**
 * Flat band for the direction glyph, in percent.
 *
 * An arrow asserts a direction, so a group whose weekly median sits inside this
 * band gets "→" instead. Below a percent the move is not distinguishable from
 * noise in either book, and an arrow would claim more than the number carries.
 */
const FLAT_BAND_PCT = 1;

/** Which way a book has been going, or that it has not been going anywhere. */
function directionGlyph(ret: number): string {
  if (!Number.isFinite(ret)) return "→";
  if (ret >= FLAT_BAND_PCT) return "↗";
  if (ret <= -FLAT_BAND_PCT) return "↘";
  return "→";
}

/**
 * The regime block: what each book has been doing lately. Nothing more.
 *
 * WHAT THIS BLOCK USED TO CLAIM, AND WHY IT NO LONGER DOES
 * --------------------------------------------------------
 * It led with the universe's regime label and an efficiency multiple —
 * "Crabbing · 1.2× coin flip" — and warned when the tape was trending, on the
 * argument that `rev6` is a mean-reversion bet and so suits a sideways tape and
 * not a trending one. That argument was never measured. It has now been, by
 * `scripts/research/run-perp-regime-windows.ts --deep=1095`, which regresses the
 * daily cross-sectional IC of the reversal ranking on the efficiency multiple at
 * 7/14/30/60/90-day windows across 1,003 days, and there is nothing there:
 *
 *   - every window lands between -0.046 and +0.037, none significant;
 *   - the 30-day window this block actually printed reads corr +0.018 at a
 *     block-permutation p of 0.60. The number shown every morning had no
 *     measurable relationship with whether that morning's ordering worked;
 *   - correcting for five windows having been tried, family-wise p = 0.553;
 *   - the largest spread any window could hand a reader is 0.011 of IC.
 *
 * Meanwhile the ranking itself measures 0.0480 at t = 9.31 over the same days.
 * The ORDER is fine. It is the framing around it that was unsupported.
 *
 * TWO TRAPS, RECORDED SO THEY ARE NOT WALKED INTO TWICE
 * -----------------------------------------------------
 * First, `rev6` IS the last 6 bars, so an efficiency window ending at t contains
 * the ranking key — 14% of a 42-bar window against 1% of a 540-bar one. That
 * contamination scales as 6/W and manufactures a "short windows win" ranking out
 * of nothing, so every window in the study is embargoed to end 6 bars early.
 *
 * Second, an earlier pass over 158 days — all the 1,500-bar per-call ceiling
 * allowed before `fetchBarsDeep` existed — put 7 days at corr -0.171, negative
 * in all three panels and in both halves, which reads exactly like a real effect
 * short on power. Over 1,003 days it is +0.031. The sign flipped. A consistent
 * sign across two halves of a single regime era is worth very little.
 *
 * So the block reports what the books have DONE, which is observation, and
 * claims nothing about what today's ordering is worth, which the data does not
 * support. `RegimeSummary.universe` is deliberately unread here — the headline
 * it fed was the unsupported part.
 *
 * IT IS NOT A TABLE, BECAUSE TELEGRAM CANNOT DRAW ONE
 * ---------------------------------------------------
 * The first version put each group on its own line with `padEnd` columns, which
 * is the same mistake this module's docstring already records being made once:
 * Telegram sets body text in a PROPORTIONAL font, so the percent column simply
 * wandered down the message. A fenced monospace block would align it and was
 * rejected — it renders as a tinted copy-me card that shouts louder than the
 * picks it is meant to frame, it cannot carry bold, and its backticks are a 400
 * waiting to happen. Two groups to a line needs no alignment at all.
 *
 * WHY A GLYPH HERE AND A SIGNED PERCENT EVERYWHERE ELSE
 * -----------------------------------------------------
 * An earlier pass removed arrows from this block on the rule that a signed
 * percent beside an arrow is two encodings of one quantity. That rule is intact
 * — it is the reason `1d -8.0%` still carries no glyph. What changed is that
 * the percent is gone from HERE, so the arrow is now the only encoding rather
 * than a duplicate of one, and it buys the line enough slack to fit two books
 * on a 30-character screen. The magnitudes are on the page the button links to.
 */
export function renderRegime(s: RegimeSummary | null): string[] {
  if (!s || !s.groups.length) return [];

  const chosen = s.groups.filter((g) => !REGIME_RESIDUAL.has(g.group));
  const spine = REGIME_SPINE.map((name) => chosen.find((g) => g.group === name)).filter(
    (g): g is GroupRegime => g !== undefined,
  );
  const rest = chosen
    .filter((g) => !REGIME_SPINE.includes(g.group))
    .sort((a, b) => b.n - a.n);
  const shown = [...spine, ...rest].slice(0, REGIME_MAX_GROUPS);
  if (!shown.length) return [];

  // The horizon is captioned once, in the header, rather than leading the first
  // pair. It applies to every arrow below it, and a caption that sits inside one
  // of the two lines reads as though it qualifies only that line.
  const lines = [`🌡 *Tape · ${REGIME_HORIZON}*`];

  const cells = shown.map(
    (g) => `${clean(GROUP_LABEL[g.group] ?? g.group).slice(0, 6)} ${directionGlyph(g.ret7)}`,
  );
  for (let i = 0; i < cells.length; i += REGIME_PER_LINE) {
    lines.push(`   _${cells.slice(i, i + REGIME_PER_LINE).join(" · ")}_`);
  }

  lines.push("");
  return lines;
}

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
    // NO regime legend. An earlier draft explained "rw" and the 30-day horizon
    // down here, which is exactly the furniture this function is built to avoid.
    // The block states both inline instead — that is what "coin flip" and the
    // leading "30d" are for.
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
