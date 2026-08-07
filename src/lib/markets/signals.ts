/**
 * Continuous, point-in-time signals for the backtest harness.
 *
 * WHY THIS EXISTS
 * ---------------
 * The production scorers quantize everything before ranking. score12mEx1m maps
 * a continuous return onto {0, 8, 16, 28, 40}; scoreRsi onto {0, 10, 18, 25};
 * scoreMaStack onto {0, 10, 20, 30}. Across ~440 names that produces enormous
 * tie groups — the rank correlation in the harness needs tie-averaging because
 * ties are the rule, not the exception. Most of the cross-sectional information
 * is destroyed before the ranking step ever happens.
 *
 * These are the SAME underlying quantities, left continuous, plus a short-term
 * reversal family. Nothing here needs data the repo does not already have.
 *
 * A note on RSI: the tiered scorer is deliberately NON-monotone (50-70 scores
 * best, both extremes score badly), so "de-quantizing" it as raw RSI changes
 * its meaning. Both readings are provided — `rsiRaw` for direction and
 * `rsiSweet` for distance from the tiered sweet spot — because assuming which
 * one the tiers were approximating would beg the question the backtest is
 * supposed to answer.
 *
 * Every function takes a window of bars ENDING at the as-of date. No function
 * may look beyond the end of its input.
 */

export interface SignalWindow {
  /** Adjusted closes, oldest first, ending at the as-of bar. */
  closes: number[];
  /** Volumes aligned with `closes`. */
  volumes: number[];
  sma20: number | null;
  sma50: number | null;
  sma200: number | null;
  rsi14: number | null;
  macdLine: number | null;
  macdSignal: number | null;
  avgVol20d: number | null;
  avgVol60d: number | null;
  adx14: number | null;
}

const last = (xs: number[]) => xs[xs.length - 1];

/** Simple return over `n` bars, in percent. Null if the window is too short. */
export function retOver(closes: number[], n: number): number | null {
  if (closes.length < n + 1) return null;
  const a = closes[closes.length - 1 - n];
  const b = last(closes);
  if (!a || a === 0) return null;
  return (100 * (b - a)) / a;
}

/** Annualized realized volatility from daily log returns over `n` bars, %. */
export function realizedVol(closes: number[], n: number): number | null {
  if (closes.length < n + 1) return null;
  const rets: number[] = [];
  for (let i = closes.length - n; i < closes.length; i++) {
    const p0 = closes[i - 1];
    const p1 = closes[i];
    if (!p0 || !p1 || p0 <= 0 || p1 <= 0) continue;
    rets.push(Math.log(p1 / p0));
  }
  if (rets.length < 2) return null;
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const varc = rets.reduce((a, b) => a + (b - mean) ** 2, 0) / (rets.length - 1);
  return Math.sqrt(varc) * Math.sqrt(252) * 100;
}

/**
 * 12-month return excluding the most recent month, in percent.
 *
 * Mirrors production's calcReturn12mEx1m (closes[n-1-21] / closes[n-1-252]) but
 * returns the continuous value rather than a 5-level tier.
 */
export function ret12mEx1m(closes: number[]): number | null {
  if (closes.length < 253) return null;
  const a = closes[closes.length - 1 - 252];
  const b = closes[closes.length - 1 - 21];
  if (!a || !b || a === 0) return null;
  return (100 * (b - a)) / a;
}

/** Position within the trailing 52-week range, 0..1. Continuous analogue of
 *  score52wPosition, which rounds to 26 discrete levels. */
export function pos52w(closes: number[]): number | null {
  if (closes.length < 252) return null;
  const w = closes.slice(-252);
  const hi = Math.max(...w);
  const lo = Math.min(...w);
  if (hi <= lo) return null;
  return (last(closes) - lo) / (hi - lo);
}

/** Share of the last 60 closes above their own 20-day SMA, 0..1. Continuous
 *  analogue of scoreTrendPersistence, which rounds to 21 levels. */
export function trendPersistence(closes: number[], lookback = 60): number | null {
  if (closes.length < lookback + 20) return null;
  let count = 0;
  let total = 0;
  for (let i = closes.length - lookback; i < closes.length; i++) {
    let sum = 0;
    for (let j = i - 19; j <= i; j++) sum += closes[j];
    const sma = sum / 20;
    total++;
    if (closes[i] > sma) count++;
  }
  return total > 0 ? count / total : null;
}

/** (price - SMA200) / SMA200, uncapped. Production caps at +50% and maps to 16
 *  levels, discarding everything above. */
export function distAbove200(price: number | null, sma200: number | null): number | null {
  if (price === null || sma200 === null || sma200 === 0) return null;
  return (price - sma200) / sma200;
}

/**
 * Continuous MA stack: the sum of log ratios across the ladder.
 *
 * Production counts how many of (price>SMA20, SMA20>SMA50, SMA50>SMA200) hold
 * and maps {0,1,2,3} to {0,10,20,30} — so a stack that is barely ordered and
 * one that is emphatically ordered score identically.
 */
export function maStackContinuous(
  price: number | null,
  s20: number | null,
  s50: number | null,
  s200: number | null,
): number | null {
  if (price === null || s20 === null || s50 === null || s200 === null) return null;
  if (price <= 0 || s20 <= 0 || s50 <= 0 || s200 <= 0) return null;
  return Math.log(price / s20) + Math.log(s20 / s50) + Math.log(s50 / s200);
}

/** MACD histogram normalized by price, so it is comparable across names.
 *  Production maps it to 4 levels and ignores magnitude entirely. */
export function macdHistNorm(
  line: number | null,
  signal: number | null,
  price: number | null,
): number | null {
  if (line === null || signal === null || price === null || price === 0) return null;
  return (line - signal) / price;
}

/** avg20/avg60 - 1. Continuous analogue of scoreVolumeTrend's 4 tiers. */
export function volumeTrend(v20: number | null, v60: number | null): number | null {
  if (v20 === null || v60 === null || v60 === 0) return null;
  return v20 / v60 - 1;
}

/** All signals for one name as of the end of `w`. Nulls are propagated so the
 *  caller can drop names rather than silently scoring them as zero — the
 *  null-to-zero coercion in the production scorers is what let data flaps
 *  manufacture large deltas. */
export function computeSignals(w: SignalWindow): Record<string, number | null> {
  const { closes } = w;
  const price = closes.length ? last(closes) : null;

  const r12 = ret12mEx1m(closes);
  const vol60 = realizedVol(closes, 60);
  const ret5 = retOver(closes, 5);
  const ret21 = retOver(closes, 21);

  return {
    // ---- de-quantized versions of the production components ----
    ret12mEx1m: r12,
    pos52w: pos52w(closes),
    trendPersistence: trendPersistence(closes),
    distAbove200: distAbove200(price, w.sma200),
    maStack: maStackContinuous(price, w.sma20, w.sma50, w.sma200),
    rsiRaw: w.rsi14,
    // Distance from the middle of production's favoured 50-70 RSI band. Higher
    // is closer to the sweet spot, so the sign convention matches every other
    // signal here (more is better).
    rsiSweet: w.rsi14 === null ? null : -Math.abs(w.rsi14 - 60),
    macdHist: macdHistNorm(w.macdLine, w.macdSignal, price),
    volumeTrend: volumeTrend(w.avgVol20d, w.avgVol60d),
    adx: w.adx14,

    // ---- short-term reversal ----
    // Sign flipped so that "more is better" holds: a big recent LOSS scores
    // high. This is the direct challenge to the screen's premise, which ranks
    // recent strength highest.
    rev1w: ret5 === null ? null : -ret5,
    rev1m: ret21 === null ? null : -ret21,
    // Reversal scaled by volatility, so a -10% week in a quiet name counts for
    // more than the same move in a habitually wild one.
    rev1wVolAdj: ret5 === null || !vol60 ? null : -ret5 / vol60,

    // ---- cheap extras that need no new data ----
    // Volatility-scaled momentum: same 12-1 signal per unit of risk.
    mom12VolAdj: r12 === null || !vol60 ? null : r12 / vol60,
    // Low-volatility anomaly: less volatile names have historically earned more
    // per unit of risk. Sign flipped for the "more is better" convention.
    lowVol: vol60 === null ? null : -vol60,
  };
}

export const SIGNAL_NAMES = [
  "ret12mEx1m",
  "pos52w",
  "trendPersistence",
  "distAbove200",
  "maStack",
  "rsiRaw",
  "rsiSweet",
  "macdHist",
  "volumeTrend",
  "adx",
  "rev1w",
  "rev1m",
  "rev1wVolAdj",
  "mom12VolAdj",
  "lowVol",
] as const;

export type SignalName = (typeof SIGNAL_NAMES)[number];

/**
 * Cross-sectional z-score, computed on RANKS rather than raw values.
 *
 * Raw z-scoring is dominated by outliers in return data — one name up 400%
 * would swamp a composite. Rank-based standardization keeps each component
 * contributing on the same scale regardless of its tail behaviour.
 */
export function rankZ(values: (number | null)[]): (number | null)[] {
  const present: { v: number; i: number }[] = [];
  values.forEach((v, i) => {
    if (v !== null && Number.isFinite(v)) present.push({ v, i });
  });
  const n = present.length;
  const out = new Array<number | null>(values.length).fill(null);
  if (n < 3) return out;

  present.sort((a, b) => a.v - b.v);
  let i = 0;
  while (i < n) {
    let j = i;
    while (j + 1 < n && present[j + 1].v === present[i].v) j++;
    const avgRank = (i + j) / 2;
    for (let k = i; k <= j; k++) {
      // Map average rank to roughly [-1, 1], then scale to unit-ish variance.
      out[present[k].i] = (avgRank / (n - 1)) * 2 - 1;
    }
    i = j + 1;
  }
  return out;
}
