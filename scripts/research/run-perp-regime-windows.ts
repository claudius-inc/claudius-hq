/**
 * Which ER window actually identifies the regime the shortlist cares about?
 *
 * Run with:
 *   npx tsx scripts/research/run-perp-regime-windows.ts
 *   npx tsx scripts/research/run-perp-regime-windows.ts --json
 *
 * WHAT IS BEING ASKED
 * -------------------
 * `perp-regime.ts` reads trend over ONE window (`longBars`, 180 bars = 30 days)
 * and the choice was made a priori, never measured. The regime block exists for
 * exactly one purpose: to tell the reader whether the `rev6` reversal ranking
 * suits today's tape. So the window that "identifies the regime" best is the one
 * whose reading most strongly predicts the ranking's own daily information
 * coefficient — not the one that looks most stable, and not the one a chart
 * reader would pick.
 *
 * THE MEASUREMENT
 * ---------------
 * For each evaluation day t (every 6 bars = 1 day) and each window W:
 *
 *   xrw(W,t)  median efficiency ratio over W bars, as a multiple of the
 *             random-walk null 1/sqrt(W) — the same quantity the message
 *             prints, computed at t rather than only at the last bar.
 *   ic(t)     cross-sectional Spearman between `rev6` (the NEGATED 1-day
 *             return, the live ranking key) and the forward 1-day return.
 *
 * A window earns its place if `xrw(W,·)` explains `ic(·)`. Reversal is a
 * mean-reversion bet, so the sign that vindicates the block is NEGATIVE: more
 * directional tape ⇒ worse reversal ranking.
 *
 * THE EMBARGO, WHICH IS THE WHOLE BALLGAME
 * ----------------------------------------
 * A naive reading computes the ER window ending at t — but `rev6` IS the last 6
 * bars, so those 6 bars sit INSIDE the ER window. A high `xrw` then partly means
 * "yesterday's move ran with the week", which is mechanically entangled with the
 * dispersion of `rev6` rather than predictive of it. Worse, the contamination
 * scales exactly the way a naive result does: 6/42 = 14% of a 7-day window,
 * 6/180 = 3% of a 30-day window, 6/540 = 1% of a 90-day window. A spurious
 * "short windows win" is the EXPECTED artifact, so the primary result here is
 * the EMBARGOED one — every ER window ends at t-6, strictly before the ranking
 * key is formed. The contemporaneous figure is reported beside it only to size
 * the artifact.
 *
 * THREE MORE CONTROLS
 * -------------------
 *  - BALANCED PANEL. The name count grows 323 → 392 across the sample as young
 *    contracts phase in. If both xrw and IC drift with composition, an index
 *    join manufactures correlation. Repeated on the names present every day.
 *  - BLOCK PERMUTATION. xrw is heavily autocorrelated across overlapping
 *    windows, so a textbook correlation t-stat is meaningless. p-values come
 *    from circularly block-shuffling the IC series, which preserves its own
 *    structure while destroying alignment with xrw.
 *  - FAMILY-WISE p. Five windows were tested and the best reported. The same
 *    permutation draws give the null for `max |corr|` across all five, which is
 *    the statistic actually being selected on.
 *
 * AND A HORSE RACE
 * ----------------
 * The efficiency ratio may simply be proxying something simpler. Cross-sectional
 * dispersion and realized vol are tested on the identical embargoed footing —
 * if either matches ER, the ER machinery is not carrying its weight.
 *
 * BIASES THAT REMAIN, STATED
 * --------------------------
 *  1. The universe is filtered by liquidity measured at the LAST bar, so it is
 *     survivorship-tinted: a name that died mid-sample is absent throughout.
 *     Every window is handed the identical universe, so the comparison between
 *     windows is fair even though the level of each is optimistic.
 *  2. The sample is one regime era. If `xrw` never reaches the trending end of
 *     its range in-sample, any claim about trending tape is extrapolation, and
 *     the printed range says so.
 *
 * Reads the venue live, writes nothing.
 */
import "dotenv/config";
import {
  VENUES,
  fetchBarsForAll,
  fetchBarsDeepForAll,
  type PerpBar,
  type PerpSymbol,
} from "@/lib/markets/perp-venues";
import { CONVERGENCE_CONFIG, isNonTradable } from "@/lib/markets/convergence-screen";
import { efficiencyRatio, groupOf, randomWalkEr, REGIME_CONFIG } from "@/lib/markets/perp-regime";
import { spearman, summarizeIc } from "@/lib/markets/backtest";

const JSON_OUT = process.argv.includes("--json");

/**
 * Bars per request. 1500 is Binance's per-call ceiling and the reason this
 * study is possible at all: the screen fetches 400, which cannot even hold a
 * single 90-day window (540 bars), let alone evaluate one over history.
 */
const BAR_LIMIT = 1500;

/**
 * `--deep[=days]` pages past that ceiling for the liquid names only.
 *
 * The shallow run reaches 158 evaluation days, which is one regime era and
 * never contained a trending tape — `xrw` topped out below the 1.8x threshold.
 * Depth is the only fix for that, and it is expensive: several full-weight
 * calls per symbol instead of one. Off by default, so the cheap run stays cheap.
 */
const DEEP_DAYS = (() => {
  const arg = process.argv.find((a) => a === "--deep" || a.startsWith("--deep="));
  if (!arg) return 0;
  const v = arg.includes("=") ? Number(arg.split("=")[1]) : 1095;
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : 1095;
})();

/** 4h bars per day — the spacing of the grid, of `rev6`, and of the embargo. */
const BARS_PER_DAY = 6;

/** Bars held out between the end of the ER window and the ranking key. */
const EMBARGO_BARS = BARS_PER_DAY;

/** The windows on trial, in bars. 7d / 14d / 30d / 60d / 90d. */
const WINDOWS = [42, 84, 180, 360, 540];
const label = (w: number) => `${Math.round(w / BARS_PER_DAY)}d`;

/** 4h in ms. Used to prove a name's history is contiguous around an eval day. */
const INTERVAL_MS = 14_400_000;

/**
 * Days with fewer scorable names than this are dropped.
 *
 * A cross-sectional IC over a handful of names is mostly sampling noise, and
 * the early history is thin: the deepest series reaches back further than most
 * of the book has existed.
 */
const MIN_NAMES_PER_DAY = 40;

/** Permutation draws, and the block length in DAYS that each draw preserves. */
const PERM_DRAWS = 2000;
const PERM_BLOCK_DAYS = 21;

/** Fixed seed: a research number that moves between runs cannot be checked. */
const SEED = 20260815;

/** mulberry32 — small, seeded, adequate for a shuffle. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Efficiency ratio at an arbitrary end index, in O(1) after an O(n) prefix pass.
 *
 * `efficiencyRatio` in the lib reads the LAST n+1 closes only, so evaluating it
 * across history would mean re-slicing every series at every day at every
 * window. Same quantity, and `assertMatchesLib` below checks it against the lib
 * at the final bar rather than asking the reader to trust the algebra.
 */
function erAt(closes: number[], absDiffPrefix: number[], n: number, end: number): number | null {
  const start = end - n;
  if (start < 0 || end >= closes.length) return null;
  const net = Math.abs(closes[end] - closes[start]);
  const gross = absDiffPrefix[end] - absDiffPrefix[start];
  return gross > 0 ? net / gross : null;
}

function absDiffPrefixOf(closes: number[]): number[] {
  const p = new Array<number>(closes.length).fill(0);
  for (let i = 1; i < closes.length; i++) p[i] = p[i - 1] + Math.abs(closes[i] - closes[i - 1]);
  return p;
}

const median = (xs: number[]): number => {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);

const stdev = (xs: number[]): number => {
  if (xs.length < 2) return NaN;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
};

/** Pearson, for the xrw→IC relationship where both sides are continuous. */
function pearson(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n < 3) return NaN;
  const mx = mean(xs);
  const my = mean(ys);
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    const a = xs[i] - mx;
    const b = ys[i] - my;
    num += a * b;
    dx += a * a;
    dy += b * b;
  }
  const den = Math.sqrt(dx * dy);
  return den === 0 ? NaN : num / den;
}

/**
 * Circular block shuffle: reassemble the series from randomly-placed blocks of
 * `L`, wrapping at the end. Preserves structure inside a block, destroys any
 * alignment with the regressor — the null this study needs.
 */
function circularBlockShuffle(ys: number[], L: number, rand: () => number): number[] {
  const n = ys.length;
  const out: number[] = [];
  while (out.length < n) {
    const start = Math.floor(rand() * n);
    for (let k = 0; k < L && out.length < n; k++) out.push(ys[(start + k) % n]);
  }
  return out;
}

interface Series {
  base: string;
  group: string;
  times: number[];
  closes: number[];
  prefix: number[];
  idxByTime: Map<number, number>;
}

function assertMatchesLib(series: Series[]): void {
  for (const s of series.slice(0, 25)) {
    const end = s.closes.length - 1;
    const mine = erAt(s.closes, s.prefix, REGIME_CONFIG.longBars, end);
    const lib = efficiencyRatio(s.closes, REGIME_CONFIG.longBars);
    if (mine === null || lib === null) continue;
    if (Math.abs(mine - lib) > 1e-9) {
      throw new Error(`erAt disagrees with efficiencyRatio on ${s.base}: ${mine} vs ${lib}`);
    }
  }
}

interface Analysis {
  corr: number;
  corrSpearman: number;
  pBlock: number;
  icCalm: number;
  icDirectional: number;
  spread: number;
  p33: number;
  p67: number;
  corrFirstHalf: number;
  corrSecondHalf: number;
}

/** The full read on one regressor against the daily IC series. */
function analyse(xs: number[], ys: number[], perms: number[][]): Analysis {
  const corr = pearson(xs, ys);
  const sorted = [...xs].sort((a, b) => a - b);
  const p33 = sorted[Math.floor(sorted.length / 3)];
  const p67 = sorted[Math.floor((2 * sorted.length) / 3)];
  const pairs = xs.map((x, i) => ({ x, ic: ys[i] }));
  const icCalm = mean(pairs.filter((p) => p.x <= p33).map((p) => p.ic));
  const icDirectional = mean(pairs.filter((p) => p.x >= p67).map((p) => p.ic));

  let ge = 0;
  for (const yp of perms) if (Math.abs(pearson(xs, yp)) >= Math.abs(corr)) ge++;

  const half = Math.floor(xs.length / 2);
  return {
    corr,
    corrSpearman: spearman(xs, ys),
    pBlock: (ge + 1) / (perms.length + 1),
    icCalm,
    icDirectional,
    spread: icCalm - icDirectional,
    p33,
    p67,
    corrFirstHalf: pearson(xs.slice(0, half), ys.slice(0, half)),
    corrSecondHalf: pearson(xs.slice(half), ys.slice(half)),
  };
}

/** Daily (6-bar) returns ending at `end`, most recent first. */
function dailyReturns(closes: number[], end: number, count: number): number[] {
  const out: number[] = [];
  for (let k = 0; k < count; k++) {
    const b = end - k * BARS_PER_DAY;
    const a = b - BARS_PER_DAY;
    if (a < 0 || !(closes[a] > 0)) break;
    out.push((100 * (closes[b] - closes[a])) / closes[a]);
  }
  return out;
}

async function main() {
  const venue = VENUES.binance;
  const symbols = (await venue.listSymbols()).filter((s) => !isNonTradable(s.base));
  if (!JSON_OUT) console.log(`Universe: ${symbols.length} tradable perps. Fetching ${BAR_LIMIT} 4h bars...`);

  const barMap = await fetchBarsForAll(venue, symbols, CONVERGENCE_CONFIG.interval, BAR_LIMIT);

  const maxWindow = Math.max(...WINDOWS);
  /** History a name needs to be scorable on a day: window + embargo + forward. */
  const NEED_BACK = maxWindow + EMBARGO_BARS;
  const series: Series[] = [];
  /** Every liquid name's history depth, kept before the depth filter — a long
   *  window that cannot reach a book is not a choice between windows, it is a
   *  choice to stop reporting that book. */
  const liquidDepth: { group: string; bars: number }[] = [];

  // The screen's own liquidity floor, measured at the last bar. Bias (1).
  // Applied on the shallow pull so the deep pull — which is the expensive one —
  // only pays for names the shortlist could actually draw from.
  const liquid: PerpSymbol[] = symbols.filter((sym) => {
    const bars = barMap.get(sym.symbol);
    if (!bars || !bars.length) return false;
    const tail = bars.slice(-CONVERGENCE_CONFIG.liquidityBars);
    const avgQ = tail.reduce((a, b) => a + (Number.isFinite(b.q) ? b.q : 0), 0) / (tail.length || 1);
    return avgQ >= CONVERGENCE_CONFIG.minAvgQuoteVol;
  });

  let deepMap: Map<string, PerpBar[]> | null = null;
  if (DEEP_DAYS) {
    const target = DEEP_DAYS * BARS_PER_DAY;
    if (!JSON_OUT) {
      console.log(
        `Deep pull: ${liquid.length} liquid names × up to ${target} bars ` +
          `(${DEEP_DAYS} days). Several calls each — this takes minutes.`,
      );
    }
    deepMap = await fetchBarsDeepForAll(venue, liquid, CONVERGENCE_CONFIG.interval, target);
  }

  for (const sym of liquid) {
    const bars = (deepMap?.get(sym.symbol) ?? barMap.get(sym.symbol)) as PerpBar[] | undefined;
    if (!bars || !bars.length) continue;

    liquidDepth.push({ group: groupOf(sym.base, sym.category), bars: bars.length });
    if (bars.length < NEED_BACK + BARS_PER_DAY * 2) continue;

    const closes = bars.map((b) => b.c);
    const times = bars.map((b) => b.t);
    const idxByTime = new Map<number, number>();
    for (let i = 0; i < times.length; i++) idxByTime.set(times[i], i);
    series.push({
      base: sym.base,
      group: groupOf(sym.base, sym.category),
      times,
      closes,
      prefix: absDiffPrefixOf(closes),
      idxByTime,
    });
  }

  assertMatchesLib(series);

  // Names are joined on BAR TIME, never on array position: histories differ in
  // depth, so index `t` is a different date in a 1,500-bar series than in a
  // 600-bar one, and an index join silently correlates one name's Tuesday with
  // another's March. The grid is the deepest series' bar times.
  const deepest = series.reduce((a, b) => (b.times.length > a.times.length ? b : a));
  const depths = series.map((s) => s.times.length).sort((a, b) => a - b);

  /** A name is scorable at time T only if its own history is contiguous there. */
  const idxAt = (s: Series, T: number, back: number, fwd: number): number | null => {
    const i = s.idxByTime.get(T);
    if (i === undefined) return null;
    if (i - back < 0 || i + fwd >= s.times.length) return null;
    if (s.times[i - back] !== T - back * INTERVAL_MS) return null;
    if (fwd > 0 && s.times[i + fwd] !== T + fwd * INTERVAL_MS) return null;
    return i;
  };

  const evalTimes: number[] = [];
  for (let i = NEED_BACK; i + BARS_PER_DAY < deepest.times.length; i += BARS_PER_DAY) {
    evalTimes.push(deepest.times[i]);
  }

  // Every window is scored on the SAME names on any given day — the set with a
  // full `maxWindow` + embargo of contiguous history plus a forward day.
  const panel = evalTimes
    .map((T) => ({ T, names: series.filter((s) => idxAt(s, T, NEED_BACK, BARS_PER_DAY) !== null) }))
    .filter((d) => d.names.length >= MIN_NAMES_PER_DAY);

  // The balanced subset: names scorable on EVERY evaluation day, so composition
  // cannot drift with time and manufacture a correlation.
  const alwaysPresent = series.filter((s) => panel.every((d) => idxAt(s, d.T, NEED_BACK, BARS_PER_DAY) !== null));

  if (!JSON_OUT) {
    console.log(
      `\nLiquid: ${liquidDepth.length} names. Depth: min ${depths[0]}, median ` +
        `${depths[depths.length >> 1]}, max ${depths[depths.length - 1]} bars.\n` +
        `Scorable: ${series.length}. Evaluation days: ${panel.length} ` +
        `(${(panel.length / 30).toFixed(1)} months), embargo ${EMBARGO_BARS} bars.\n` +
        `Names per day: ${panel.length ? panel[0].names.length : 0} (oldest) → ` +
        `${panel.length ? panel[panel.length - 1].names.length : 0} (newest); ` +
        `balanced panel: ${alwaysPresent.length}.\n`,
    );
  }

  /** Per-day reversal IC over a chosen name set. */
  const icSeries = (pick: (d: { T: number; names: Series[] }) => Series[]): number[] =>
    panel.map((d) => {
      const rev: number[] = [];
      const fwd: number[] = [];
      for (const s of pick(d)) {
        const i = s.idxByTime.get(d.T)!;
        const prior = s.closes[i - BARS_PER_DAY];
        const now = s.closes[i];
        const ahead = s.closes[i + BARS_PER_DAY];
        if (!(prior > 0) || !(now > 0)) continue;
        rev.push(-(100 * (now - prior)) / prior);
        fwd.push((100 * (ahead - now)) / now);
      }
      return spearman(rev, fwd);
    });

  const ics = icSeries((d) => d.names);
  const icsBalanced = icSeries(() => alwaysPresent);
  const icSummary = summarizeIc(ics);

  /** Per-day median xrw for a window, ending `offset` bars before t. */
  const xrwSeries = (w: number, offset: number, names?: Series[]): number[] => {
    const null_ = randomWalkEr(w);
    return panel.map((d) => {
      const ers: number[] = [];
      for (const s of names ?? d.names) {
        const i = s.idxByTime.get(d.T);
        if (i === undefined) continue;
        const er = erAt(s.closes, s.prefix, w, i - offset);
        if (er !== null && Number.isFinite(er)) ers.push(er);
      }
      return median(ers) / null_;
    });
  };

  // One set of permuted IC series, reused by every regressor so the family-wise
  // null and the per-window nulls come from the same draws.
  const rand = rng(SEED);
  const perms = Array.from({ length: PERM_DRAWS }, () => circularBlockShuffle(ics, PERM_BLOCK_DAYS, rand));
  const permsBalanced = (() => {
    const r2 = rng(SEED + 1);
    return Array.from({ length: PERM_DRAWS }, () => circularBlockShuffle(icsBalanced, PERM_BLOCK_DAYS, r2));
  })();

  const embargoed = new Map<number, number[]>();
  const contemporaneous = new Map<number, number[]>();
  for (const w of WINDOWS) {
    embargoed.set(w, xrwSeries(w, EMBARGO_BARS));
    contemporaneous.set(w, xrwSeries(w, 0));
  }

  const primary = WINDOWS.map((w) => ({ w, a: analyse(embargoed.get(w)!, ics, perms) }));
  const naive = WINDOWS.map((w) => ({ w, a: analyse(contemporaneous.get(w)!, ics, perms) }));
  const balanced = WINDOWS.map((w) => ({
    w,
    a: analyse(xrwSeries(w, EMBARGO_BARS, alwaysPresent), icsBalanced, permsBalanced),
  }));

  // Family-wise null for "the best of five windows", the statistic actually
  // being selected on when a winner is reported.
  const observedMax = Math.max(...primary.map((r) => Math.abs(r.a.corr)));
  let geFamily = 0;
  for (const yp of perms) {
    const m = Math.max(...WINDOWS.map((w) => Math.abs(pearson(embargoed.get(w)!, yp))));
    if (m >= observedMax) geFamily++;
  }
  const pFamily = (geFamily + 1) / (perms.length + 1);

  // Horse race: does anything simpler do the same job, on the same footing?
  const dispersion = panel.map((d) => {
    const rs: number[] = [];
    for (const s of d.names) {
      const i = s.idxByTime.get(d.T)!;
      const b = i - EMBARGO_BARS;
      const a = b - BARS_PER_DAY;
      if (a < 0 || !(s.closes[a] > 0)) continue;
      rs.push((100 * (s.closes[b] - s.closes[a])) / s.closes[a]);
    }
    return stdev(rs);
  });
  const realizedVol = panel.map((d) => {
    const vs: number[] = [];
    for (const s of d.names) {
      const i = s.idxByTime.get(d.T)!;
      const rs = dailyReturns(s.closes, i - EMBARGO_BARS, 7);
      if (rs.length >= 5) vs.push(stdev(rs));
    }
    return median(vs);
  });

  const race = [
    { name: `ER ${label(42)}`, a: analyse(embargoed.get(42)!, ics, perms) },
    { name: `ER ${label(180)}`, a: analyse(embargoed.get(180)!, ics, perms) },
    { name: "dispersion", a: analyse(dispersion, ics, perms) },
    { name: "realized vol", a: analyse(realizedVol, ics, perms) },
  ];

  if (JSON_OUT) {
    console.log(
      JSON.stringify(
        { ic: icSummary, days: panel.length, names: series.length, pFamily, primary, naive, balanced, race },
        null,
        2,
      ),
    );
    return;
  }

  console.log(
    `Reversal ranking, unconditional: mean IC ${icSummary.meanIc.toFixed(4)} ` +
      `t=${icSummary.tStat.toFixed(2)} hit ${icSummary.hitRate.toFixed(0)}% over ${icSummary.n} days\n`,
  );

  const table = (title: string, rows: { w: number; a: Analysis }[]) => {
    console.log(`  ${title}`);
    const hdr =
      `  ${"window".padEnd(7)} ${"corr".padStart(7)} ${"pBlock".padStart(7)} ${"1st½".padStart(7)} ` +
      `${"2nd½".padStart(7)}  ${"IC calm".padStart(8)} ${"IC dir".padStart(8)} ${"spread".padStart(8)}  ` +
      `${"p33".padStart(5)} ${"p67".padStart(5)}`;
    console.log(hdr);
    console.log(`  ${"-".repeat(hdr.length)}`);
    for (const { w, a } of rows) {
      console.log(
        `  ${label(w).padEnd(7)} ${a.corr.toFixed(3).padStart(7)} ${a.pBlock.toFixed(3).padStart(7)} ` +
          `${a.corrFirstHalf.toFixed(3).padStart(7)} ${a.corrSecondHalf.toFixed(3).padStart(7)}  ` +
          `${a.icCalm.toFixed(4).padStart(8)} ${a.icDirectional.toFixed(4).padStart(8)} ` +
          `${a.spread.toFixed(4).padStart(8)}  ${a.p33.toFixed(2).padStart(5)} ${a.p67.toFixed(2).padStart(5)}`,
      );
    }
    console.log("");
  };

  table(`PRIMARY — ER embargoed ${EMBARGO_BARS} bars (strictly before rev6 forms)`, primary);
  table("CONTAMINATED — ER ending at t, overlapping rev6. For comparison only.", naive);
  table(`BALANCED PANEL — ${alwaysPresent.length} names present every day, embargoed`, balanced);

  console.log(`  HORSE RACE — all embargoed, same days`);
  const rhdr =
    `  ${"measure".padEnd(13)} ${"corr".padStart(7)} ${"pBlock".padStart(7)} ${"1st½".padStart(7)} ` +
    `${"2nd½".padStart(7)}  ${"spread".padStart(8)}`;
  console.log(rhdr);
  console.log(`  ${"-".repeat(rhdr.length)}`);
  for (const { name, a } of race) {
    console.log(
      `  ${name.padEnd(13)} ${a.corr.toFixed(3).padStart(7)} ${a.pBlock.toFixed(3).padStart(7)} ` +
        `${a.corrFirstHalf.toFixed(3).padStart(7)} ${a.corrSecondHalf.toFixed(3).padStart(7)}  ` +
        `${a.spread.toFixed(4).padStart(8)}`,
    );
  }

  console.log(
    `\n  Family-wise p for "best of ${WINDOWS.length} windows" (max |corr| = ` +
      `${observedMax.toFixed(3)}): ${pFamily.toFixed(3)}\n`,
  );

  // Coverage. A window is only available to a group if the group's names carry
  // enough history to fill it — and the tradfi book is the young cohort, so the
  // longer windows quietly stop reporting the sectors they cannot reach.
  const groups = Array.from(new Set(liquidDepth.map((d) => d.group))).sort();
  const covHdr = `  ${"group".padEnd(14)} ${"liquid".padStart(6)} ` + WINDOWS.map((w) => label(w).padStart(6)).join(" ");
  console.log(`  Names with enough history to fill each window:\n`);
  console.log(covHdr);
  console.log(`  ${"-".repeat(covHdr.length)}`);
  for (const g of groups) {
    const rows = liquidDepth.filter((d) => d.group === g);
    const cells = WINDOWS.map((w) => {
      const n = rows.filter((d) => d.bars >= w + 1).length;
      return `${n}${n >= REGIME_CONFIG.minGroupN ? " " : "*"}`.padStart(6);
    });
    console.log(`  ${g.padEnd(14)} ${String(rows.length).padStart(6)} ${cells.join(" ")}`);
  }
  console.log(`  ${"-".repeat(covHdr.length)}`);
  console.log(`  * below the ${REGIME_CONFIG.minGroupN}-name floor, so the group gets no line at that window.`);

  console.log(
    `\n  corr    = Pearson between that regressor and the day's reversal IC. NEGATIVE is the sign\n` +
      `            that vindicates the regime block: directional tape ⇒ reversal works less.\n` +
      `  pBlock  = ${PERM_DRAWS} circular block permutations of the IC series, ${PERM_BLOCK_DAYS}-day blocks,\n` +
      `            two-sided on |corr|. Seed ${SEED}, so the number is reproducible.\n` +
      `  1st/2nd = the same correlation on each half of the sample. A sign flip is a warning.\n` +
      `  IC calm = mean reversal IC on the third of days with the LOWEST reading; IC dir = highest\n` +
      `            third. "spread" is what a reader would actually be handed by the block.\n` +
      `  p33/p67 = tercile cut points, the thresholds a three-state display would use.`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
