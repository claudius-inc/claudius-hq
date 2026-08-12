/**
 * Objectives, combination scoring, and the null models that decide whether any
 * of it means anything.
 *
 * THREE OBJECTIVES, BECAUSE "ALPHA" IS AMBIGUOUS AND THEY DISAGREE
 * ---------------------------------------------------------------
 *   ic       — is the ORDERING right? Per-timestamp rank correlation between
 *              the combined score and excess return.
 *   capture  — did the shortlist CONTAIN the movers? The product-fit metric:
 *              the Telegram message is a list a human reads, so recall of the
 *              names that moved matters more than the ordering of the rest.
 *   basket   — did it MAKE MONEY? Top-N mean excess, and separately the mean
 *              absolute net return against a buy-everything baseline.
 *
 * `basket`'s absolute leg is the headline for any short-horizon winner, because
 * every excess-based number here is GROSS OF FEES BY CONSTRUCTION: a
 * cross-sectionally constant round-trip fee is removed exactly by demeaning, so
 * only funding survives into `excess`. A reversal signal at a one-day horizon
 * turns over constantly and selects the names that just gapped — the widest
 * spreads in the cross-section at the moment of entry. Reporting its excess as
 * "net" would be true of the funding term and false of everything else.
 *
 * MAGNITUDE SIGNALS GATE, THEY DO NOT ADD
 * ---------------------------------------
 * A magnitude signal predicts a big move of unknown sign. Rank-averaging it
 * with a directional one does not "supply the sign" — it tilts the ranking
 * symmetrically toward high-|move| names, which is not a position. So a
 * combination applies its magnitude components as a GATE (keep the top `q` of
 * the cross-section by magnitude) and ranks directionally inside the survivors.
 *
 * `MAGNITUDE_GATE_Q` is fixed a priori at 0.30 and never searched. A gate width
 * chosen after seeing results is an unaccounted extra dimension of the search.
 *
 * EXCESS IS RE-DEMEANED INSIDE THE GATE
 * -------------------------------------
 * Gating changes the tradable population, so the benchmark has to change with
 * it. Left alone, a gated strategy would be measured against a cross-section it
 * cannot trade, and the gate would score well purely for what it excluded.
 *
 * THE CAPTURE NULL IS NOT 1.0x
 * ----------------------------
 * "Movers" are the top decile of |forward return|. Volatility is strongly
 * persistent while returns are not, so ANY volatility or volume signal posts a
 * lift above 1.0 trivially — benchmarking against 1.0 would "discover" that
 * volatility predicts volatility. The null for a magnitude signal is the lift
 * achieved by trailing realized volatility itself, taken as the MAX over the
 * volatility family so the comparison cannot be won by picking a weak benchmark.
 */
import { spearman, summarizeIc, type IcSummary } from "@/lib/markets/backtest";
import {
  rowsByTimestamp,
  type Panel,
} from "@/lib/markets/perp-panel";
import { SIGNAL_BY_NAME, type Polarity } from "@/lib/markets/perp-signals";

/** Fixed a priori. Never searched — see the module docstring. */
export const MAGNITUDE_GATE_Q = 0.3;

/** Share of the cross-section a shortlist may flag, held equal for every candidate. */
export const FLAGGED_SHARE = 0.1;

/** Top decile of |move| defines a "mover". */
export const MOVER_PCTL = 0.9;

/** Basket size for the money objective. */
export const BASKET_N = 10;

export type ObjectiveName = "ic" | "capture" | "basket";

export interface ComboResult {
  names: string[];
  /** Timestamps that contributed an observation. */
  nTimestamps: number;
  ic: IcSummary;
  /** Mean per-timestamp capture lift, and its t across timestamps. */
  captureLift: number;
  captureT: number;
  /** Top-N basket mean excess, % — selection skill, GROSS OF FEES. */
  basketExcess: number;
  basketExcessT: number;
  /** Top-N basket mean absolute net return, %. Fees and funding charged. */
  basketAbs: number;
  /** Buy-everything absolute net return over the same rows, %. */
  baselineAbs: number;
  /** Share of rebalance timestamps the basket beat its pool. */
  dateWin: number;
}

/**
 * Cross-sectional rank z-score within one timestamp's rows.
 *
 * Ranks rather than raw values, because return-derived signals are fat-tailed
 * and one name up 400% would otherwise dominate any composite. Ties share an
 * average rank. Rows with no value get null and are excluded by the caller.
 */
function rankZWithin(vals: Float64Array, rows: number[]): Map<number, number> {
  const present: { v: number; r: number }[] = [];
  for (const r of rows) {
    const v = vals[r];
    if (Number.isFinite(v)) present.push({ v, r });
  }
  const out = new Map<number, number>();
  const n = present.length;
  if (n < 3) return out;

  present.sort((a, b) => a.v - b.v);
  let i = 0;
  while (i < n) {
    let j = i;
    while (j + 1 < n && present[j + 1].v === present[i].v) j++;
    const avgRank = (i + j) / 2;
    // Written as (2r - (n-1)) / (n-1), NOT (r/(n-1))*2 - 1.
    //
    // The two are equal in exact arithmetic and differ by one ULP in floating
    // point, because r/(n-1) and (n-1-r)/(n-1) do not sum to exactly 1. That
    // makes the rank-z set very slightly ASYMMETRIC, so the |z| values of a
    // name and its mirror — which should tie exactly — differ in the last bit.
    // Capture flags directional signals on |score|, so a meaningless last-bit
    // difference silently decided which of two equally extreme names entered
    // the top decile. Measured: it changed the flagged set on ~10% of
    // timestamps. This form keeps the numerators exact integer negations, so
    // the mirror pair ties exactly and the tie is broken by position instead.
    const z = (2 * avgRank - (n - 1)) / (n - 1);
    for (let k = i; k <= j; k++) out.set(present[k].r, z);
    i = j + 1;
  }
  return out;
}

/**
 * Per-timestamp rank-z for every signal, computed ONCE.
 *
 * The permutation nulls shuffle RETURNS, never signals, so this matrix is
 * invariant across every repetition. Precomputing it is what makes a
 * thousand-repetition procedure-level null feasible at all — without it each
 * repetition would re-rank every column at every timestamp.
 */
export interface RankCache {
  /** Column-major, same shape as `panel.values`. NaN where absent. */
  z: Float64Array;
  groups: number[][];
}

export function buildRankCache(panel: Panel): RankCache {
  const groups = rowsByTimestamp(panel);
  const z = new Float64Array(panel.values.length).fill(NaN);
  for (let s = 0; s < panel.signalNames.length; s++) {
    const colv = panel.values.subarray(s * panel.nRows, (s + 1) * panel.nRows);
    for (const rows of groups) {
      const ranked = rankZWithin(colv, rows);
      for (const [r, v] of Array.from(ranked.entries())) z[s * panel.nRows + r] = v;
    }
  }
  return { z, groups };
}

/**
 * Rows usable by every named signal — the common mask.
 *
 * Every combination in a search is scored on the SAME rows. Letting each
 * combination drop its own missing rows would score an open-interest
 * combination on a 30-day recent subset while its rivals get 500 days, then
 * print both in one table as though comparable.
 */
export function commonMask(panel: Panel, names: string[]): Uint8Array {
  const mask = new Uint8Array(panel.nRows).fill(1);
  for (const name of names) {
    const s = panel.signalNames.indexOf(name);
    if (s < 0) throw new Error(`Unknown signal "${name}"`);
    const off = s * panel.nRows;
    for (let r = 0; r < panel.nRows; r++) {
      if (!Number.isFinite(panel.values[off + r])) mask[r] = 0;
    }
  }
  for (let r = 0; r < panel.nRows; r++) {
    if (!Number.isFinite(panel.excess[r])) mask[r] = 0;
  }
  return mask;
}

function polarityOf(name: string): Polarity {
  return SIGNAL_BY_NAME.get(name)?.polarity ?? "directional";
}

const meanOf = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);

function tStat(xs: number[]): number {
  const n = xs.length;
  if (n < 2) return NaN;
  const m = meanOf(xs);
  const v = xs.reduce((a, b) => a + (b - m) ** 2, 0) / (n - 1);
  const se = Math.sqrt(v / n);
  return se === 0 ? NaN : m / se;
}

/**
 * Scores one combination over one timestamp's rows.
 *
 * Returns the surviving rows, their combined directional score, and the excess
 * RE-DEMEANED within the gated population.
 */
function scoreTimestamp(
  panel: Panel,
  cache: RankCache,
  rows: number[],
  mask: Uint8Array,
  directional: number[],
  magnitude: number[],
  returns: Float64Array,
): { rows: number[]; score: number[]; magScore: number[]; excess: number[] } | null {
  // The return array is a PARAMETER, because the null models swap in permuted
  // returns — and a permuted draw leaves NaN wherever a symbol is absent from
  // the donor timestamp. Filtering here is not defensive tidiness: without it a
  // single NaN makes the timestamp's mean NaN, every excess NaN, the objective
  // -Infinity, and every null draw degenerate. The p-value then collapses to
  // 1/(reps+1) — a number that looks like strong significance and is actually
  // the arithmetic of an empty comparison. That is exactly what the first run
  // of this file printed: "null median = —, p = 0.010".
  let pool = rows.filter((r) => mask[r] === 1 && Number.isFinite(returns[r]));
  if (pool.length < 20) return null;

  const magOf = (r: number) => {
    let sum = 0;
    for (const s of magnitude) sum += cache.z[s * panel.nRows + r];
    return sum / magnitude.length;
  };

  // Magnitude components GATE rather than add — but only when there is a
  // direction for them to gate. A magnitude-only combination has nothing to
  // narrow; it IS the ranking, and gating first would apply it twice.
  if (magnitude.length && directional.length) {
    const gated = pool.map((r) => ({ r, v: magOf(r) })).sort((a, b) => b.v - a.v);
    const keep = Math.max(20, Math.floor(pool.length * MAGNITUDE_GATE_Q));
    pool = gated.slice(0, keep).map((x) => x.r);
  }
  if (pool.length < 20) return null;

  // Re-demean inside the surviving population: the benchmark must be what the
  // strategy can actually trade.
  const m = meanOf(pool.map((r) => returns[r]));
  const excess = pool.map((r) => returns[r] - m);

  const score = pool.map((r) => {
    if (!directional.length) return 0;
    let sum = 0;
    for (const s of directional) sum += cache.z[s * panel.nRows + r];
    return sum / directional.length;
  });
  const magScore = pool.map((r) => (magnitude.length ? magOf(r) : 0));

  return { rows: pool, score, magScore, excess };
}

/**
 * Full evaluation of one combination.
 *
 * `returns` is passed separately from the panel so the null models can swap in
 * permuted returns without rebuilding anything else.
 */
export function evaluateCombo(
  panel: Panel,
  cache: RankCache,
  names: string[],
  mask: Uint8Array,
  returns: Float64Array = panel.fwdNet,
  timestampFilter?: (tIdx: number) => boolean,
): ComboResult {
  const directional: number[] = [];
  const magnitude: number[] = [];
  for (const n of names) {
    const s = panel.signalNames.indexOf(n);
    if (polarityOf(n) === "magnitude") magnitude.push(s);
    else directional.push(s);
  }

  const ics: number[] = [];
  const lifts: number[] = [];
  const basketEx: number[] = [];
  const basketAbsPer: number[] = [];
  const baselineAbsPer: number[] = [];
  let dateWins = 0;
  let dates = 0;

  for (const rows of cache.groups) {
    if (rows.length === 0) continue;
    const tIdx = panel.rowTime[rows[0]];
    if (timestampFilter && !timestampFilter(tIdx)) continue;

    const scored = scoreTimestamp(panel, cache, rows, mask, directional, magnitude, returns);
    if (!scored) continue;
    dates++;

    // ---- capture: did the flagged slice contain the movers? ----
    const abs = scored.rows.map((r) => Math.abs(returns[r]));
    const sortedAbs = [...abs].sort((a, b) => a - b);
    const threshold = sortedAbs[Math.floor(MOVER_PCTL * (sortedAbs.length - 1))];
    const movers = new Set<number>();
    scored.rows.forEach((r, i) => {
      if (abs[i] >= threshold) movers.add(r);
    });

    // The flagged share is FIXED, so a selective candidate cannot post a bigger
    // lift than a broad one at identical skill.
    //
    // The flagging key is the SIGNAL, never the outcome. Ranking by |forward
    // return| here would be look-ahead of the purest kind — it flags the movers
    // by definition and every magnitude signal would post an identical, huge
    // lift. (It did, in the first run of this file: 8.87x for all eleven of
    // them, which is what exposed the bug.)
    //
    // Directional signals are flagged on |score|, not score: the shipped
    // message has a LONG section and a SHORT section, so the question "did the
    // shortlist contain the movers" spans both tails.
    const nFlag = Math.max(1, Math.round(scored.rows.length * FLAGGED_SHARE));
    const order = scored.rows
      .map((r, i) => ({
        r,
        s: directional.length ? Math.abs(scored.score[i]) : scored.magScore[i],
      }))
      .sort((a, b) => b.s - a.s);
    const flagged = order.slice(0, nFlag).map((x) => x.r);
    const hit = flagged.filter((r) => movers.has(r)).length;
    const recall = movers.size ? hit / movers.size : NaN;
    const share = nFlag / scored.rows.length;
    if (Number.isFinite(recall) && share > 0) lifts.push(recall / share);

    if (directional.length) {
      ics.push(spearman(scored.score, scored.excess));

      const ranked = scored.rows
        .map((r, i) => ({ r, s: scored.score[i], e: scored.excess[i] }))
        .sort((a, b) => b.s - a.s);
      const basket = ranked.slice(0, Math.min(BASKET_N, ranked.length));
      const bEx = meanOf(basket.map((x) => x.e));
      const bAbs = meanOf(basket.map((x) => returns[x.r]));
      basketEx.push(bEx);
      basketAbsPer.push(bAbs);
      baselineAbsPer.push(meanOf(scored.rows.map((r) => returns[r])));
      if (bEx > 0) dateWins++;
    }
  }

  return {
    names,
    nTimestamps: dates,
    ic: summarizeIc(ics),
    captureLift: meanOf(lifts),
    captureT: tStat(lifts.map((x) => x - 1)),
    basketExcess: meanOf(basketEx),
    basketExcessT: tStat(basketEx),
    basketAbs: meanOf(basketAbsPer),
    baselineAbs: meanOf(baselineAbsPer),
    dateWin: dates ? (100 * dateWins) / dates : NaN,
  };
}

/** The number a search maximises, for a given objective. */
export function objectiveValue(r: ComboResult, obj: ObjectiveName): number {
  if (obj === "ic") return Number.isFinite(r.ic.meanIc) ? r.ic.meanIc : -Infinity;
  if (obj === "capture") return Number.isFinite(r.captureLift) ? r.captureLift : -Infinity;
  return Number.isFinite(r.basketExcess) ? r.basketExcess : -Infinity;
}

// ── redundancy ────────────────────────────────────────────────────────────

/**
 * Pairwise Spearman between signal columns, pooled over masked rows.
 *
 * `stride` SUBSAMPLES the rows, and the default is not a shortcut — it is what
 * makes this callable in a loop. Each Spearman sorts its inputs, so a k-signal
 * matrix costs k^2 sorts of the full column; over ~140,000 rows and a few
 * hundred combinations that is billions of operations and does not finish.
 * (Measured: the first version of `persistResults` ran for 13 minutes on 250
 * rows without completing.)
 *
 * Correlation converges far faster than that precision implies: at stride 20
 * the estimate still rests on ~7,000 pairs, whose standard error is about
 * 0.012. This value only feeds `effectiveRank`, a redundancy diagnostic printed
 * to two decimals, so the sampling error is an order below what is displayed.
 * Pass `stride = 1` when an exact figure is genuinely wanted.
 */
export function rankCorrMatrix(
  panel: Panel,
  names: string[],
  mask: Uint8Array,
  stride = 20,
): number[][] {
  const rows: number[] = [];
  for (let r = 0; r < panel.nRows; r += stride) {
    if (mask[r] === 1) rows.push(r);
  }
  const cols = names.map((n) => {
    const s = panel.signalNames.indexOf(n);
    const off = s * panel.nRows;
    return rows.map((r) => panel.values[off + r]);
  });
  return cols.map((a) => cols.map((b) => spearman(a, b)));
}

/**
 * Effective number of independent signals: (sum of eigenvalues)^2 / sum of
 * squares, on the rank-correlation matrix.
 *
 * "Minimum number of indicators" is really a question about independent bets —
 * two signals at 0.84 correlation are nominally k=2 but effectively ~1.02. This
 * is reported as a DIAGNOSTIC beside the count, not as the selection criterion:
 * two orthogonal but worthless signals would score a perfect 2.0.
 *
 * Eigenvalues by Jacobi rotation — the matrices here are at most 6x6.
 */
export function effectiveRank(corr: number[][]): number {
  const n = corr.length;
  if (n === 0) return 0;
  if (n === 1) return 1;
  const a = corr.map((row) => row.map((v) => (Number.isFinite(v) ? v : 0)));

  for (let sweep = 0; sweep < 100; sweep++) {
    let off = 0;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) off += a[i][j] ** 2;
    if (off < 1e-12) break;
    for (let p = 0; p < n; p++) {
      for (let q = p + 1; q < n; q++) {
        if (Math.abs(a[p][q]) < 1e-15) continue;
        const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]);
        const t =
          Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1);
        const s = t * c;
        for (let k = 0; k < n; k++) {
          const akp = a[k][p];
          const akq = a[k][q];
          a[k][p] = c * akp - s * akq;
          a[k][q] = s * akp + c * akq;
        }
        for (let k = 0; k < n; k++) {
          const apk = a[p][k];
          const aqk = a[q][k];
          a[p][k] = c * apk - s * aqk;
          a[q][k] = s * apk + c * aqk;
        }
      }
    }
  }

  const eig = Array.from({ length: n }, (_, i) => Math.max(0, a[i][i]));
  const sum = eig.reduce((x, y) => x + y, 0);
  const sumSq = eig.reduce((x, y) => x + y * y, 0);
  return sumSq > 0 ? (sum * sum) / sumSq : 0;
}

// ── null models ───────────────────────────────────────────────────────────

function lcg(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * Stationary block bootstrap over TIMESTAMPS — the primary null.
 *
 * Resamples contiguous blocks of whole timestamps, keeping each timestamp's
 * return VECTOR intact and reattaching it to a different timestamp's signals.
 * That is what makes it a valid null here:
 *
 *   - Keeping the vector intact preserves cross-sectional dependence exactly.
 *     Shuffling returns within a timestamp instead would make every name's
 *     return independent, when in reality one common shock moves a whole
 *     flagged basket together. The null's variance would then be far below the
 *     real sampling variance and every p-value would come out too small.
 *   - Contiguous blocks preserve local serial structure, so a null draw spans
 *     comparable volatility regimes rather than splicing a quiet period's
 *     signals onto a violent period's returns.
 *   - Unlike a circular rotation, it has unlimited distinct draws. A rotation
 *     offers only `nTimestamps` offsets — 500 at a one-day horizon, 167 at
 *     three days — so a 1000-repetition Monte Carlo CI computed from rotations
 *     would be reporting more precision than exists.
 *
 * Returns a `fwdNet`-shaped array with returns reassigned by timestamp.
 */
export function blockBootstrapReturns(
  panel: Panel,
  cache: RankCache,
  seed: number,
  meanBlock = 8,
): Float64Array {
  const rnd = lcg(seed);
  const nT = cache.groups.length;
  const out = new Float64Array(panel.nRows).fill(NaN);

  // Build the donor sequence: for each position, which timestamp's returns.
  const donors = new Array<number>(nT);
  let i = 0;
  while (i < nT) {
    let src = Math.floor(rnd() * nT);
    // Geometric block length gives the "stationary" property.
    while (i < nT) {
      donors[i++] = src % nT;
      src++;
      if (rnd() < 1 / meanBlock) break;
    }
  }

  // Map returns across by SYMBOL identity, so a name receives another date's
  // return for the same name where possible. Rows whose symbol is absent from
  // the donor timestamp stay NaN and drop out of that repetition.
  const bySymbolAt = cache.groups.map((rows) => {
    const m = new Map<number, number>();
    for (const r of rows) m.set(panel.rowSymbol[r], r);
    return m;
  });

  for (let t = 0; t < nT; t++) {
    const donor = bySymbolAt[donors[t]];
    for (const r of cache.groups[t]) {
      const dr = donor.get(panel.rowSymbol[r]);
      if (dr !== undefined) out[r] = panel.fwdNet[dr];
    }
  }
  return out;
}

/**
 * Circular rotation of the return panel — kept as a cross-check.
 *
 * Simpler and easier to reason about than the block bootstrap, but limited to
 * `nTimestamps` distinct draws and it splices the panel's end onto its
 * beginning, pairing one volatility regime's signals with another's returns.
 * Its resolution floor is reported wherever its p-value is.
 */
export function rotationReturns(
  panel: Panel,
  cache: RankCache,
  offset: number,
): Float64Array {
  const nT = cache.groups.length;
  const out = new Float64Array(panel.nRows).fill(NaN);
  const bySymbolAt = cache.groups.map((rows) => {
    const m = new Map<number, number>();
    for (const r of rows) m.set(panel.rowSymbol[r], r);
    return m;
  });

  for (let t = 0; t < nT; t++) {
    const donor = bySymbolAt[(t + offset) % nT];
    for (const r of cache.groups[t]) {
      const dr = donor.get(panel.rowSymbol[r]);
      if (dr !== undefined) out[r] = panel.fwdNet[dr];
    }
  }
  return out;
}

export interface NullResult {
  /** Best objective value the SEARCH achieved on each null repetition. */
  draws: number[];
  /** How many draws produced a finite value. A p-value from few of these is
   *  arithmetic, not evidence — see `procedureNull`. */
  usableDraws: number;
  /** Share of usable repetitions whose best matched or beat the real best. */
  pValue: number;
  /** Monte Carlo 95% CI half-width on that p-value. */
  mcCi: number;
  reps: number;
}

/**
 * Procedure-level p-value: re-runs the WHOLE search on each null draw.
 *
 * This is the distinction that matters. A per-combination p-value asks "could
 * this one combination have arisen by chance"; searching thousands of
 * combinations and reporting the winner's p-value answers a question nobody
 * asked. Re-running the search under the null gives the distribution of "best
 * result this exact procedure finds when there is no signal at all", which is
 * the only thing the winner can honestly be compared against.
 */
export function procedureNull(
  panel: Panel,
  cache: RankCache,
  candidates: string[][],
  masks: Map<string, Uint8Array>,
  objective: ObjectiveName,
  realBest: number,
  reps: number,
  timestampFilter?: (tIdx: number) => boolean,
  onProgress?: (done: number) => void,
): NullResult {
  const draws: number[] = [];
  for (let rep = 0; rep < reps; rep++) {
    const returns = blockBootstrapReturns(panel, cache, 1000 + rep);
    let best = -Infinity;
    for (const names of candidates) {
      const mask = masks.get(names.join("|"))!;
      const r = evaluateCombo(panel, cache, names, mask, returns, timestampFilter);
      const v = objectiveValue(r, objective);
      if (v > best) best = v;
    }
    draws.push(best);
    if (onProgress) onProgress(rep + 1);
  }
  // A degenerate null is worse than no null: it yields p = 1/(reps+1), which
  // reads as strong significance while meaning "nothing was actually compared".
  // Callers must be able to detect it, so the count of usable draws is returned
  // rather than silently folded into the p-value.
  const usable = draws.filter((d) => Number.isFinite(d));
  const atLeast = usable.filter((d) => d >= realBest).length;
  const p = (atLeast + 1) / (usable.length + 1);
  return {
    draws,
    usableDraws: usable.length,
    pValue: p,
    mcCi: usable.length ? 1.96 * Math.sqrt((p * (1 - p)) / usable.length) : NaN,
    reps,
  };
}
