/**
 * TypeScript port of the Multi-Convergence/Divergence [MCD] signal engine.
 *
 * Source of truth: claudius-inc/tradingview-indicators `mcd.pine`. Only the
 * SIGNAL ENGINE is ported — the drawing code (RSI polylines, gradient fills,
 * badges) has no meaning off-chart. The five factors and their defaults are
 * reproduced exactly so a name flagged here is a name the chart would flag.
 *
 * THE SCORE IS A SIMPLE COUNT
 * ---------------------------
 * Each factor contributes 1 when it agrees, giving 0-5 for each direction.
 * No weighting. That is deliberate: a weighted blend has five more free
 * parameters than there is evidence to fit, and the count is the thing the
 * indicator itself displays ("3/5"). Weighting is a later question, and only if
 * the backtest says the factors differ in quality.
 *
 * WHY SERIES RATHER THAN A SINGLE AS-OF CALL
 * ------------------------------------------
 * `computeMcdSeries` returns a score for EVERY bar in one pass. Every indicator
 * below is causal — bar i reads only bars <= i — so the value at index i is
 * identical to what a point-in-time call with `bars.slice(0, i+1)` would return,
 * but the whole history costs one pass instead of one pass per bar. The
 * backtest replays thousands of bars per symbol and would be O(n^2) otherwise.
 */

export interface McdBar {
  h: number;
  l: number;
  c: number;
  o: number;
  v: number;
}

/** Defaults mirror the Pine inputs one-for-one. */
export const MCD_CONFIG = {
  smma1: 39,
  smma2: 100,
  smma3: 200,
  ema1: 12,
  ema2: 25,
  rsiLen: 14,
  atrLen: 14,
  swingLen: 50, // sig_swing_len
  proxAtr: 0.75, // sig_prox_atr — fib/MA support tolerance, in ATRs
  hiProxPct: 3.0, // sig_hi_prox — proximity to swing extreme, %
  pbWindow: 5, // sig_pb_window
  vsaWindow: 5, // sig_vsa_window
  useVsa: true, // sig_use_vsa
  vsaVolAvgLen: 20,
  vsaAtrLen: 14,
  vsaLookback: 20,
  vsaSpringBars: 3,
  minScore: 3, // sig_min
} as const;

export type McdConfig = typeof MCD_CONFIG;

/**
 * Bars needed before a score is trustworthy.
 *
 * SMMA-200 is the binding constraint. It is an RMA, which is seeded with a
 * 200-bar SMA and then converges geometrically — reading it at bar 201 gives a
 * number that is still mostly seed. 300 leaves ~100 bars of convergence, and
 * every Binance perp has at least 414 4h bars, so nothing tradable is excluded
 * by this floor.
 */
export const MCD_WARMUP = 300;

// ── primitives ────────────────────────────────────────────────────────────
// Each returns a full series aligned to the input, with null before the point
// the indicator is defined. Null (not 0) so callers cannot silently treat an
// undefined indicator as a real reading of zero.

/** Wilder's smoothed MA (Pine `smma`/`ta.rma`), seeded with an SMA at bar len-1. */
export function smmaSeries(src: number[], len: number): (number | null)[] {
  const out = new Array<number | null>(src.length).fill(null);
  if (src.length < len) return out;
  let sum = 0;
  for (let i = 0; i < len; i++) sum += src[i];
  let prev = sum / len;
  out[len - 1] = prev;
  for (let i = len; i < src.length; i++) {
    prev = (prev * (len - 1) + src[i]) / len;
    out[i] = prev;
  }
  return out;
}

/** Pine `ta.ema`, seeded with an SMA at bar len-1. */
export function emaSeries(src: number[], len: number): (number | null)[] {
  const out = new Array<number | null>(src.length).fill(null);
  if (src.length < len) return out;
  const k = 2 / (len + 1);
  let sum = 0;
  for (let i = 0; i < len; i++) sum += src[i];
  let prev = sum / len;
  out[len - 1] = prev;
  for (let i = len; i < src.length; i++) {
    prev = src[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

/** Pine `ta.sma`. */
export function smaSeries(src: number[], len: number): (number | null)[] {
  const out = new Array<number | null>(src.length).fill(null);
  let sum = 0;
  for (let i = 0; i < src.length; i++) {
    sum += src[i];
    if (i >= len) sum -= src[i - len];
    if (i >= len - 1) out[i] = sum / len;
  }
  return out;
}

/** Pine `ta.rsi` — Wilder smoothing of gains and losses. */
export function rsiSeries(closes: number[], len: number): (number | null)[] {
  const out = new Array<number | null>(closes.length).fill(null);
  if (closes.length <= len) return out;

  let gainSum = 0;
  let lossSum = 0;
  for (let i = 1; i <= len; i++) {
    const d = closes[i] - closes[i - 1];
    if (d > 0) gainSum += d;
    else lossSum -= d;
  }
  let avgGain = gainSum / len;
  let avgLoss = lossSum / len;
  // A zero average loss is a genuine 100 (nothing but up bars), not a divide
  // error — guarding it as 50 would mute the strongest readings there are.
  out[len] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);

  for (let i = len + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    avgGain = (avgGain * (len - 1) + Math.max(0, d)) / len;
    avgLoss = (avgLoss * (len - 1) + Math.max(0, -d)) / len;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

/** Pine `ta.atr` — RMA of true range. */
export function atrSeries(bars: McdBar[], len: number): (number | null)[] {
  const tr = new Array<number>(bars.length).fill(0);
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i];
    tr[i] =
      i === 0
        ? b.h - b.l
        : Math.max(b.h - b.l, Math.abs(b.h - bars[i - 1].c), Math.abs(b.l - bars[i - 1].c));
  }
  return smmaSeries(tr, len);
}

/** Pine `ta.highest` over a trailing window ending at each bar. */
export function highestSeries(src: number[], len: number): (number | null)[] {
  const out = new Array<number | null>(src.length).fill(null);
  for (let i = len - 1; i < src.length; i++) {
    let m = -Infinity;
    for (let j = i - len + 1; j <= i; j++) if (src[j] > m) m = src[j];
    out[i] = m;
  }
  return out;
}

/** Pine `ta.lowest` over a trailing window ending at each bar. */
export function lowestSeries(src: number[], len: number): (number | null)[] {
  const out = new Array<number | null>(src.length).fill(null);
  for (let i = len - 1; i < src.length; i++) {
    let m = Infinity;
    for (let j = i - len + 1; j <= i; j++) if (src[j] < m) m = src[j];
    out[i] = m;
  }
  return out;
}

/**
 * Pine `ta.barssince` — bars elapsed since `cond` was last true.
 * 0 when true on the current bar, null when it has never been true.
 */
export function barsSinceSeries(cond: boolean[]): (number | null)[] {
  const out = new Array<number | null>(cond.length).fill(null);
  let last = -1;
  for (let i = 0; i < cond.length; i++) {
    if (cond[i]) last = i;
    out[i] = last === -1 ? null : i - last;
  }
  return out;
}

/** Shift a series forward by `n` bars: result[i] = src[i-n] (Pine `x[n]`). */
function shift<T>(src: T[], n: number, fill: T): T[] {
  const out = new Array<T>(src.length).fill(fill);
  for (let i = n; i < src.length; i++) out[i] = src[i - n];
  return out;
}

// ── the engine ────────────────────────────────────────────────────────────

export interface McdFactors {
  trend: boolean; // F1 — EMA trend + RSI either side of 50
  pullback: boolean; // F2 — dip into the MA zone, then a reclaim bar
  support: boolean; // F3 — at a fib retracement or an MA
  proximity: boolean; // F4 — closing near the swing extreme
  vsa: boolean; // F5 — recent Wyckoff evidence
}

export interface McdReading {
  longScore: number;
  shortScore: number;
  maxScore: number;
  longFactors: McdFactors;
  shortFactors: McdFactors;
  /** True on the bar the score FIRST reaches the threshold — the chart's flag. */
  longFlag: boolean;
  shortFlag: boolean;
  rsi: number | null;
  atr: number | null;
  close: number;
}

const factorCount = (f: McdFactors): number =>
  Number(f.trend) + Number(f.pullback) + Number(f.support) + Number(f.proximity) + Number(f.vsa);

/**
 * Scores every bar. `out[i]` is the reading as of the close of bar i, using
 * only bars 0..i. Entries before `MCD_WARMUP` are present but should be ignored
 * by callers — they are computed from partially converged indicators.
 */
export function computeMcdSeries(bars: McdBar[], cfg: McdConfig = MCD_CONFIG): McdReading[] {
  const n = bars.length;
  const closes = bars.map((b) => b.c);
  const highs = bars.map((b) => b.h);
  const lows = bars.map((b) => b.l);
  const volumes = bars.map((b) => b.v);

  const ma1 = smmaSeries(closes, cfg.smma1);
  const ma2 = smmaSeries(closes, cfg.smma2);
  const ma3 = smmaSeries(closes, cfg.smma3);
  const e1 = emaSeries(closes, cfg.ema1);
  const e2 = emaSeries(closes, cfg.ema2);
  const rsi = rsiSeries(closes, cfg.rsiLen);
  const atr = atrSeries(bars, cfg.atrLen);

  const swingHi = highestSeries(highs, cfg.swingLen);
  const swingLo = lowestSeries(lows, cfg.swingLen);

  // ── Wyckoff VSA detections (Factor 5 inputs) ──
  const volAvg = smaSeries(volumes, cfg.vsaVolAvgLen);
  const vsaAtr = atrSeries(bars, cfg.vsaAtrLen);
  const recentHigh = highestSeries(highs, cfg.vsaLookback);
  const recentLow = lowestSeries(lows, cfg.vsaLookback);

  // `ta.lowest(low[1], n)` — the window ENDS at the previous bar, so the
  // current bar cannot be its own support level. Shifting after the rolling
  // extreme is what makes "broke below prior support" meaningful.
  const prevLow = shift(lowestSeries(lows, cfg.vsaLookback), 1, null);
  const prevHigh = shift(highestSeries(highs, cfg.vsaLookback), 1, null);

  const brokeSupport = new Array<boolean>(n).fill(false);
  const brokeResistance = new Array<boolean>(n).fill(false);
  const stoppingVol = new Array<boolean>(n).fill(false);
  const nearSupportVsa = new Array<boolean>(n).fill(false);
  const nearResistVsa = new Array<boolean>(n).fill(false);
  const noDemand = new Array<boolean>(n).fill(false);
  const noSupply = new Array<boolean>(n).fill(false);
  const recovered = new Array<boolean>(n).fill(false);
  const failed = new Array<boolean>(n).fill(false);

  for (let i = 0; i < n; i++) {
    const b = bars[i];
    const va = volAvg[i];
    const at = vsaAtr[i];
    if (va === null || at === null) continue;

    const spread = b.h - b.l;
    const narrow = spread < at * 0.5;
    const highVol = b.v > va * 1.5;
    const belowAvgVol = b.v < va;

    nearResistVsa[i] = recentHigh[i] !== null && b.h >= (recentHigh[i] as number) * 0.995;
    nearSupportVsa[i] = recentLow[i] !== null && b.l <= (recentLow[i] as number) * 1.005;

    stoppingVol[i] = highVol && narrow && (nearSupportVsa[i] || nearResistVsa[i]);
    noDemand[i] = b.c > b.o && belowAvgVol && narrow;
    noSupply[i] = b.c < b.o && belowAvgVol && narrow;

    if (prevLow[i] !== null) {
      brokeSupport[i] = b.l < (prevLow[i] as number);
      recovered[i] = b.c > (prevLow[i] as number);
    }
    if (prevHigh[i] !== null) {
      brokeResistance[i] = b.h > (prevHigh[i] as number);
      failed[i] = b.c < (prevHigh[i] as number);
    }
  }

  // Spring: broke support `springBars` ago AND has recovered by now.
  const brokeSupportLagged = shift(brokeSupport, cfg.vsaSpringBars, false);
  const brokeResistanceLagged = shift(brokeResistance, cfg.vsaSpringBars, false);

  const bullEvidence = new Array<boolean>(n).fill(false);
  const bearEvidence = new Array<boolean>(n).fill(false);
  for (let i = 0; i < n; i++) {
    const spring = brokeSupportLagged[i] && recovered[i];
    const upthrust = brokeResistanceLagged[i] && failed[i];
    bullEvidence[i] = spring || (stoppingVol[i] && nearSupportVsa[i]) || noSupply[i];
    bearEvidence[i] = upthrust || (stoppingVol[i] && nearResistVsa[i]) || noDemand[i];
  }
  const sinceBull = barsSinceSeries(bullEvidence);
  const sinceBear = barsSinceSeries(bearEvidence);

  // ── Factor 2 needs "bars since price dipped through MA2" ──
  const dipBullCond = new Array<boolean>(n).fill(false);
  const dipBearCond = new Array<boolean>(n).fill(false);
  for (let i = 0; i < n; i++) {
    if (ma2[i] === null) continue;
    dipBullCond[i] = lows[i] < (ma2[i] as number);
    dipBearCond[i] = highs[i] > (ma2[i] as number);
  }
  const sinceDipBull = barsSinceSeries(dipBullCond);
  const sinceDipBear = barsSinceSeries(dipBearCond);

  const readings: McdReading[] = [];
  let prevLongScore = 0;
  let prevShortScore = 0;

  for (let i = 0; i < n; i++) {
    const b = bars[i];
    const tol = atr[i] === null ? null : (atr[i] as number) * cfg.proxAtr;

    const nearSupport = (lvl: number | null): boolean => {
      if (lvl === null || tol === null) return false;
      return Math.abs(b.c - lvl) <= tol || (b.l <= lvl && b.c >= lvl);
    };
    const nearResist = (lvl: number | null): boolean => {
      if (lvl === null || tol === null) return false;
      return Math.abs(b.c - lvl) <= tol || (b.h >= lvl && b.c <= lvl);
    };

    // Fib retracements anchored on the swing range.
    let fib382: number | null = null;
    let fib500: number | null = null;
    let fib618: number | null = null;
    if (swingHi[i] !== null && swingLo[i] !== null) {
      const hi = swingHi[i] as number;
      const lo = swingLo[i] as number;
      const rng = hi - lo;
      fib382 = hi - rng * 0.382;
      fib500 = hi - rng * 0.5;
      fib618 = hi - rng * 0.618;
    }

    const trendBull = e1[i] !== null && e2[i] !== null && (e1[i] as number) > (e2[i] as number);
    const trendBear = e1[i] !== null && e2[i] !== null && (e1[i] as number) < (e2[i] as number);
    const r = rsi[i];

    const longFactors: McdFactors = {
      trend: trendBull && r !== null && r > 50,
      pullback:
        sinceDipBull[i] !== null &&
        (sinceDipBull[i] as number) > 0 &&
        (sinceDipBull[i] as number) <= cfg.pbWindow &&
        b.c > b.o &&
        ma1[i] !== null &&
        b.c > (ma1[i] as number),
      support:
        nearSupport(fib382) ||
        nearSupport(fib500) ||
        nearSupport(fib618) ||
        nearSupport(ma1[i]) ||
        nearSupport(ma2[i]) ||
        nearSupport(ma3[i]),
      proximity: swingHi[i] !== null && b.c >= (swingHi[i] as number) * (1 - cfg.hiProxPct / 100),
      vsa:
        cfg.useVsa && sinceBull[i] !== null && (sinceBull[i] as number) <= cfg.vsaWindow,
    };

    const shortFactors: McdFactors = {
      trend: trendBear && r !== null && r < 50,
      pullback:
        sinceDipBear[i] !== null &&
        (sinceDipBear[i] as number) > 0 &&
        (sinceDipBear[i] as number) <= cfg.pbWindow &&
        b.c < b.o &&
        ma1[i] !== null &&
        b.c < (ma1[i] as number),
      support:
        nearResist(fib382) ||
        nearResist(fib500) ||
        nearResist(fib618) ||
        nearResist(ma1[i]) ||
        nearResist(ma2[i]) ||
        nearResist(ma3[i]),
      proximity: swingLo[i] !== null && b.c <= (swingLo[i] as number) * (1 + cfg.hiProxPct / 100),
      vsa:
        cfg.useVsa && sinceBear[i] !== null && (sinceBear[i] as number) <= cfg.vsaWindow,
    };

    const longScore = factorCount(longFactors);
    const shortScore = factorCount(shortFactors);

    readings.push({
      longScore,
      shortScore,
      maxScore: cfg.useVsa ? 5 : 4,
      longFactors,
      shortFactors,
      longFlag: longScore >= cfg.minScore && prevLongScore < cfg.minScore,
      shortFlag: shortScore >= cfg.minScore && prevShortScore < cfg.minScore,
      rsi: r,
      atr: atr[i],
      close: b.c,
    });

    prevLongScore = longScore;
    prevShortScore = shortScore;
  }

  return readings;
}

/** Reading at the most recent closed bar, or null if history is too short. */
export function scoreLatest(bars: McdBar[], cfg: McdConfig = MCD_CONFIG): McdReading | null {
  if (bars.length < MCD_WARMUP) return null;
  const series = computeMcdSeries(bars, cfg);
  return series[series.length - 1] ?? null;
}
