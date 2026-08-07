/**
 * Backtest harness for the scanner's scoring functions.
 *
 * WHY IC RATHER THAN WIN RATE
 * ---------------------------
 * The live report was evaluated by the 5-day win rate of its top 10. That
 * throws away everything except a binary outcome on ten names, so
 * distinguishing a 55% win rate from a coin flip needs ~780 independent
 * observations — roughly a year of live picks, and longer once you account for
 * the fact that consecutive days share names and a regime.
 *
 * Information coefficient uses the entire cross-section instead: on each date,
 * rank every scorable ticker by score and correlate that ranking against
 * forward return. One date yields one observation built from ~400 names rather
 * than 10, so the same statistical power arrives in weeks of history rather
 * than a year of waiting.
 *
 * RETURNS ARE UNIVERSE-RELATIVE
 * -----------------------------
 * Every return here is excess over the equal-weight mean of the scorable
 * universe on that date. The prior live measurement used absolute returns,
 * which cannot distinguish "the screen works" from "the market went up" — and
 * this universe spans several currencies and regions, so no single index is a
 * fair benchmark. Its own cross-sectional mean is.
 *
 * NON-OVERLAPPING SAMPLING
 * ------------------------
 * Dates are sampled `horizon` trading days apart so forward windows never
 * overlap. Overlapping windows are strongly autocorrelated and inflate the
 * t-statistic; sampling at the horizon keeps the observations independent and
 * the significance test honest.
 */
import { computeIndicators } from "@/lib/scanner/watchlist-indicators";
import { scoreMomentum, scoreTechnical, type ScoringInputs } from "@/lib/scanner/watchlist";
import { computeSignals } from "@/lib/markets/signals";
import type { OHLCV } from "@/lib/scanner/indicators";

export interface Bar {
  d: string; // YYYY-MM-DD
  o: number;
  h: number;
  l: number;
  c: number; // raw close
  a: number; // adjusted close
  v: number;
}

/** Indicators need at most 253 bars (return12mEx1m); anything older is dead weight. */
export const WARMUP_BARS = 260;

export interface ScoredRow {
  ticker: string;
  momentum: number;
  technical: number;
  /** Day-over-day change in momentum score — the ORIGINAL ranking key, kept so
   *  the shipped change can be judged against what it replaced rather than
   *  against nothing. */
  momentumDelta: number;
  /** Continuous, point-in-time signals (see signals.ts). Null where the window
   *  was too short — callers must drop rather than coerce to zero. */
  signals: Record<string, number | null>;
  /** 20-day average traded value in the LISTING currency. Not comparable across
   *  currencies, so only split on it within a single-currency subsample. */
  advLocal: number | null;
  fwd: number; // absolute forward return, %
  excess: number; // forward return minus universe mean, %
}

export interface DateSlice {
  date: string;
  rows: ScoredRow[];
  universeMean: number;
}

/**
 * Spearman rank correlation.
 *
 * Ties are averaged, which matters a great deal here: both scores are small
 * integers (0-100 from a handful of tiered components), so ties are the norm
 * rather than the exception. Naive ordinal ranking would manufacture spurious
 * ordering inside a tie group and bias the correlation.
 */
export function spearman(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n < 3 || ys.length !== n) return NaN;

  const rank = (vals: number[]): number[] => {
    const idx = vals.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
    const out = new Array<number>(n);
    let i = 0;
    while (i < n) {
      let j = i;
      while (j + 1 < n && idx[j + 1].v === idx[i].v) j++;
      const avg = (i + j) / 2 + 1; // average rank over the tie group, 1-based
      for (let k = i; k <= j; k++) out[idx[k].i] = avg;
      i = j + 1;
    }
    return out;
  };

  const rx = rank(xs);
  const ry = rank(ys);
  const mx = rx.reduce((a, b) => a + b, 0) / n;
  const my = ry.reduce((a, b) => a + b, 0) / n;

  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) {
    const a = rx[i] - mx;
    const b = ry[i] - my;
    num += a * b;
    dx += a * a;
    dy += b * b;
  }
  const den = Math.sqrt(dx * dy);
  return den === 0 ? NaN : num / den;
}

export interface IcSummary {
  n: number;
  meanIc: number;
  stdIc: number;
  tStat: number;
  hitRate: number; // share of dates with IC > 0
}

/** Summarize a series of per-date ICs. t = mean/std * sqrt(n), valid because
 *  the dates are sampled non-overlapping. */
export function summarizeIc(ics: number[]): IcSummary {
  const v = ics.filter((x) => Number.isFinite(x));
  const n = v.length;
  if (n === 0) return { n: 0, meanIc: NaN, stdIc: NaN, tStat: NaN, hitRate: NaN };

  const mean = v.reduce((a, b) => a + b, 0) / n;
  const variance = n > 1 ? v.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1) : 0;
  const std = Math.sqrt(variance);
  return {
    n,
    meanIc: mean,
    stdIc: std,
    tStat: std === 0 ? NaN : (mean / std) * Math.sqrt(n),
    hitRate: (100 * v.filter((x) => x > 0).length) / n,
  };
}

/**
 * Mean excess return of the top and bottom quantile by `score`, and the spread.
 * IC says "is the ranking directionally right"; the spread says "is it worth
 * anything", which are not the same question — a real but tiny IC can still
 * produce a spread that transaction costs erase.
 */
export function quantileSpread(
  rows: ScoredRow[],
  score: (r: ScoredRow) => number,
  buckets = 5,
): { top: number; bottom: number; spread: number; nPerBucket: number } {
  const sorted = [...rows].sort((a, b) => score(a) - score(b));
  const size = Math.floor(sorted.length / buckets);
  if (size === 0) return { top: NaN, bottom: NaN, spread: NaN, nPerBucket: 0 };

  const mean = (xs: ScoredRow[]) => xs.reduce((a, b) => a + b.excess, 0) / xs.length;
  const bottom = mean(sorted.slice(0, size));
  const top = mean(sorted.slice(sorted.length - size));
  return { top, bottom, spread: top - bottom, nPerBucket: size };
}

/** Point-in-time ScoringInputs from bars ending at (and including) the as-of bar.
 *
 *  The 52-week high/low are computed from the trailing window rather than read
 *  from a quote summary. Production takes them from Yahoo's
 *  summaryDetail.fiftyTwoWeekHigh, which is as-of-today — using that in a
 *  replay would leak the future into every historical date. */
export function inputsAsOf(bars: Bar[]): ScoringInputs | null {
  if (bars.length < 253) return null;

  const window = bars.slice(-WARMUP_BARS);
  const ohlcv: OHLCV[] = window.map((b) => ({
    date: new Date(b.d),
    open: b.o,
    high: b.h,
    low: b.l,
    close: b.a, // adjusted — raw close makes a split look like a -90% day
    volume: b.v,
  }));

  const ind = computeIndicators(ohlcv);
  const last252 = window.slice(-252);
  const closes = last252.map((b) => b.a);

  return {
    price: ind.price,
    return12mEx1m: ind.return12mEx1m,
    fiftyTwoWeekHigh: Math.max(...closes),
    fiftyTwoWeekLow: Math.min(...closes),
    closesAbove20SmaPct60d: ind.closesAbove20SmaPct60d,
    sma200: ind.sma200,
    sma50: ind.sma50,
    sma20: ind.sma20,
    rsi14: ind.rsi14,
    macdLine: ind.macdLine,
    macdSignal: ind.macdSignal,
    avgVol20d: ind.avgVol20d,
    avgVol60d: ind.avgVol60d,
    adx14: ind.adx14,
  };
}

export interface ReplayOptions {
  horizon: number; // forward return window, in trading days
  step?: number; // date sampling interval; defaults to horizon (non-overlapping)
  minNames?: number; // skip dates with a thin cross-section
  maxDates?: number;
  /**
   * Reconstruct the day-over-day momentum delta by re-scoring one bar earlier.
   * Doubles the indicator work, so the strategy search — which does not use it —
   * turns it off. Defaults to true.
   */
  computeDelta?: boolean;
}

/**
 * Replays the production scorers across history.
 *
 * `history` maps ticker -> bars sorted ascending by date. Dates come from the
 * union of all tickers' calendars, so a ticker that did not trade on a given
 * date (holiday, different exchange) simply contributes no row that date rather
 * than distorting the cross-section.
 */
export function replay(
  history: Map<string, Bar[]>,
  opts: ReplayOptions,
): DateSlice[] {
  const { horizon, minNames = 30, maxDates, computeDelta = true } = opts;
  const step = opts.step ?? horizon;

  // Index each ticker's bars by date for O(1) as-of lookup.
  // Array.from rather than for-of/spread over the Map: tsconfig sets no
  // explicit `target`, so direct Map/Set iteration trips TS2802.
  const entries = Array.from(history.entries());
  const indexByTicker = new Map<string, Map<string, number>>();
  const allDates = new Set<string>();
  for (const [ticker, bars] of entries) {
    const idx = new Map<string, number>();
    for (let i = 0; i < bars.length; i++) {
      idx.set(bars[i].d, i);
      allDates.add(bars[i].d);
    }
    indexByTicker.set(ticker, idx);
  }

  const dates = Array.from(allDates).sort();
  const slices: DateSlice[] = [];

  for (let di = 0; di < dates.length; di += step) {
    const date = dates[di];
    const rows: Omit<ScoredRow, "excess">[] = [];

    for (const [ticker, bars] of entries) {
      const pos = indexByTicker.get(ticker)!.get(date);
      if (pos === undefined) continue; // did not trade this date
      if (pos + horizon >= bars.length) continue; // no full forward window
      if (pos + 1 < 253) continue; // insufficient warmup

      const inputs = inputsAsOf(bars.slice(0, pos + 1));
      if (!inputs) continue;

      const entry = bars[pos].a;
      const exit = bars[pos + horizon].a;
      if (!entry || !exit) continue;

      const momentum = scoreMomentum(inputs);

      // Re-score one bar earlier to reconstruct the delta the original report
      // ranked on. Doubles the indicator work, which is the price of being able
      // to compare the old key against the new one on identical data.
      const prevInputs = computeDelta && pos >= 253 ? inputsAsOf(bars.slice(0, pos)) : null;
      const momentumDelta = prevInputs ? momentum - scoreMomentum(prevInputs) : 0;

      // Continuous signals from the same point-in-time window. Reuses the
      // indicators already computed for the tiered scorers, so the only extra
      // cost is the pure-price signals (returns, vol, persistence).
      const window = bars.slice(Math.max(0, pos + 1 - WARMUP_BARS), pos + 1);
      const signals = computeSignals({
        closes: window.map((b) => b.a),
        volumes: window.map((b) => b.v),
        sma20: inputs.sma20,
        sma50: inputs.sma50,
        sma200: inputs.sma200,
        rsi14: inputs.rsi14,
        macdLine: inputs.macdLine,
        macdSignal: inputs.macdSignal,
        avgVol20d: inputs.avgVol20d,
        avgVol60d: inputs.avgVol60d,
        adx14: inputs.adx14,
      });

      rows.push({
        ticker,
        momentum,
        technical: scoreTechnical(inputs),
        momentumDelta,
        signals,
        advLocal:
          inputs.avgVol20d !== null && inputs.price !== null
            ? inputs.avgVol20d * inputs.price
            : null,
        fwd: (100 * (exit - entry)) / entry,
      });
    }

    if (rows.length < minNames) continue;

    const universeMean = rows.reduce((a, b) => a + b.fwd, 0) / rows.length;
    slices.push({
      date,
      universeMean,
      rows: rows.map((r) => ({ ...r, excess: r.fwd - universeMean })),
    });

    if (maxDates && slices.length >= maxDates) break;
  }

  return slices;
}
