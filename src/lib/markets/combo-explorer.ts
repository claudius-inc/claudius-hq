/**
 * The combination explorer: a quantized panel the BROWSER can score against.
 *
 * WHY THIS CAN EXIST
 * ------------------
 * Scoring a combination never touches raw indicator values. It averages the
 * CROSS-SECTIONAL RANK-Z of each component, sorts, and measures. Rank-z lives in
 * [-1, 1], so a single signed byte carries it at a resolution of 1/127 — far
 * finer than a ranking built from ~340 names per timestamp is meaningful at.
 * That single observation is the difference between a 35 MB payload and a 1 MB
 * one, and therefore between "precomputed results you can browse" and "tick a
 * signal, see the answer".
 *
 * WHAT IS LOST, AND WHY THAT IS ACCEPTABLE
 * ----------------------------------------
 * The export is DOWNSAMPLED in time (every `timeStride`-th timestamp), so its
 * numbers are indicative rather than authoritative. It is an instrument for
 * FINDING candidates, not for confirming them: a set that looks good here goes
 * to `run-perp-combo-search.ts`, which runs the full panel, the sealed holdout
 * and the bootstrap null. The page states this; it is not a footnote.
 *
 * Downsampling in TIME rather than in symbols is deliberate. Dropping symbols
 * would shrink each cross-section, which changes what a rank-z means — the
 * quantity the whole export is built on. Dropping whole timestamps leaves every
 * surviving cross-section exactly as it was.
 *
 * THE DIVERGENCE GUARD
 * --------------------
 * This module reimplements scoring against a different data layout from
 * `perp-evaluate.ts`, which is a standing invitation for the two to drift apart
 * silently. `combo-explorer.test.ts` exports a panel at `timeStride = 1` and
 * asserts the explorer's IC matches `evaluateCombo` on the same combinations. A
 * drift fails the suite rather than producing two different numbers for the same
 * question.
 *
 * This file must stay free of Node built-ins: it is imported by a client
 * component.
 */
import { spearman } from "@/lib/markets/backtest";

/** Fixed a priori, mirroring `perp-evaluate.ts`. Never searched. */
export const MAGNITUDE_GATE_Q = 0.3;
export const FLAGGED_SHARE = 0.1;
export const MOVER_PCTL = 0.9;
export const BASKET_N = 10;

/** Describes one exported payload. Small enough to fetch on its own. */
export interface ExplorerHeader {
  version: 1;
  runDate: string;
  horizon: number;
  /** Signal names, in column order. */
  signals: string[];
  /** "directional" | "magnitude", aligned with `signals`. */
  polarities: ("directional" | "magnitude")[];
  /** Group per signal, aligned with `signals`. */
  groups: string[];
  nRows: number;
  nTimestamps: number;
  /** Row counts per timestamp, in order; the row array is grouped by timestamp. */
  rowsPerTimestamp: number[];
  /** Every Nth timestamp was kept. 1 means no downsampling. */
  timeStride: number;
  /** Timestamps in the FULL panel, for honesty about what was dropped. */
  fullTimestamps: number;
  /** Share of rows that are crypto, so the reader knows what they are looking at. */
  cryptoShare: number;
}

/**
 * The decoded payload.
 *
 * `ranks` is column-major int16: ranks[s * nRows + r]. `returns` is the
 * net-of-cost forward return per row, Float64.
 */
export interface ExplorerPanel {
  header: ExplorerHeader;
  ranks: Int16Array;
  returns: Float64Array;
}

/**
 * Rank-z is in [-1, 1]; int16 carries it at 1/32767.
 *
 * INT8 IS NOT ENOUGH, AND THE REASON IS SPECIFIC. A cross-section here holds
 * ~340 names, so adjacent rank-z values differ by 2/339 = 0.0059 — finer than
 * int8's 1/127 = 0.0079. Quantizing to a byte would MERGE adjacent ranks,
 * silently turning distinct names into ties and changing which rows land in a
 * top-decile cut. Int16 resolves 0.00003, two orders finer than any
 * cross-section this panel will ever carry, so quantization stops being a
 * source of disagreement with the server at all.
 *
 * The cost is one extra byte per cell, and it is a REAL cost. Measured: the
 * stride-4 payload is 2.34 MB raw and 2.12 MB gzipped — compression finds
 * almost nothing, because ranks are stored in row order rather than sorted
 * order, so each column is effectively a random permutation. (An earlier note
 * here claimed these were "near-monotone ramps that compress heavily"; they are
 * not.) `--stride` is the lever if the payload needs to be smaller: it trades
 * cross-sections for bytes linearly.
 */
const QUANT = 32767;
/** Distinct from every representable rank, so "absent" is unambiguous. */
const ABSENT = -32768;

/**
 * Rounding is SYMMETRIC about zero, and that is not a detail.
 *
 * A cross-sectional rank-z set is exactly symmetric: the i-th value from the
 * bottom is the exact negation of the i-th from the top, and IEEE-754 negation
 * is exact, so `|z_i| === |z_j|` holds bit-for-bit. Capture flags directional
 * signals on `|score|`, so those pairs are genuine ties broken by array order.
 *
 * `Math.round` rounds half toward +infinity — `round(2.5) = 3` but
 * `round(-2.5) = -2` — which quantizes a symmetric pair to magnitudes differing
 * by one step. The tie disappears, the sort orders by value instead of by
 * position, and a different name lands in the top decile. Measured, that shifted
 * the explorer's capture lift away from the server's on ~10% of timestamps.
 *
 * Rounding the magnitude and re-applying the sign keeps the pairs tied.
 */
export function quantizeRank(z: number): number {
  if (!Number.isFinite(z)) return ABSENT;
  const q = Math.sign(z) * Math.round(Math.abs(z) * QUANT);
  return Math.max(-QUANT, Math.min(QUANT, q));
}

export function dequantizeRank(q: number): number {
  return q === ABSENT ? NaN : q / QUANT;
}

/** Binary layout: [header length][header JSON][ranks int16][returns f64]. */
export function encodePayload(
  header: ExplorerHeader,
  ranks: Int16Array,
  returns: Float64Array,
): Uint8Array {
  const json = new TextEncoder().encode(JSON.stringify(header));
  // Header padded so the int16 and float64 sections start 8-byte aligned; an
  // unaligned typed-array view throws rather than merely being slow.
  const pad = (8 - ((4 + json.length) % 8)) % 8;
  const headerBytes = 4 + json.length + pad;
  const total = headerBytes + ranks.length * 2 + returns.length * 8;

  const out = new Uint8Array(total);
  new DataView(out.buffer).setUint32(0, json.length + pad, true);
  out.set(json, 4);
  // Copied through fresh arrays so a source byteOffset cannot read neighbours.
  out.set(new Uint8Array(new Int16Array(ranks).buffer), headerBytes);
  out.set(new Uint8Array(new Float64Array(returns).buffer), headerBytes + ranks.length * 2);
  return out;
}

export function decodePayload(buf: ArrayBuffer): ExplorerPanel {
  const jsonLen = new DataView(buf).getUint32(0, true);
  const raw = new TextDecoder().decode(new Uint8Array(buf, 4, jsonLen));
  // Trailing NULs from the alignment padding are not valid JSON.
  const header = JSON.parse(raw.replace(/\0+$/, "")) as ExplorerHeader;

  const headerBytes = 4 + jsonLen;
  const nSig = header.signals.length;
  const rankBytes = nSig * header.nRows * 2;
  // `slice` copies, which also guarantees the alignment a raw view on an
  // arbitrary offset would not have.
  const ranks = new Int16Array(buf.slice(headerBytes, headerBytes + rankBytes));
  const returns = new Float64Array(
    buf.slice(headerBytes + rankBytes, headerBytes + rankBytes + header.nRows * 8),
  );
  return { header, ranks, returns };
}

/** Row index ranges per timestamp, derived from `rowsPerTimestamp`. */
export function timestampRanges(header: ExplorerHeader): { from: number; to: number }[] {
  const out: { from: number; to: number }[] = [];
  let cursor = 0;
  for (const n of header.rowsPerTimestamp) {
    out.push({ from: cursor, to: cursor + n });
    cursor += n;
  }
  return out;
}

export interface ExplorerScore {
  /** Mean per-timestamp Spearman IC, and its t across timestamps. */
  ic: number;
  icT: number;
  /** Mean per-timestamp capture lift, fixed flagged share. */
  captureLift: number;
  /** Top-N basket mean excess, %. GROSS OF FEES — see perp-evaluate.ts. */
  basketExcess: number;
  basketExcessT: number;
  /** Same basket's absolute return, and the buy-everything baseline. */
  basketAbs: number;
  baselineAbs: number;
  /** Share of timestamps the basket beat its pool. */
  dateWin: number;
  nTimestamps: number;
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
 * Scores one combination.
 *
 * Mirrors `evaluateCombo` exactly, including the three rules that matter:
 *   - magnitude components GATE (top `MAGNITUDE_GATE_Q`), they do not add
 *   - excess is RE-DEMEANED inside the gated set, because that is the only
 *     population the combination can actually trade
 *   - the flagged set for capture is ranked by the SIGNAL, never the outcome,
 *     and directional signals are flagged on |score| so both tails count
 */
export function scoreCombo(
  panel: ExplorerPanel,
  signalIdx: number[],
): ExplorerScore {
  const { header, ranks, returns } = panel;
  const n = header.nRows;

  const directional: number[] = [];
  const magnitude: number[] = [];
  for (const s of signalIdx) {
    if (header.polarities[s] === "magnitude") magnitude.push(s);
    else directional.push(s);
  }

  const ics: number[] = [];
  const lifts: number[] = [];
  const basketEx: number[] = [];
  const basketAbsPer: number[] = [];
  const baselineAbsPer: number[] = [];
  let dateWins = 0;
  let dates = 0;

  for (const range of timestampRanges(header)) {
    let pool: number[] = [];
    for (let r = range.from; r < range.to; r++) {
      let ok = Number.isFinite(returns[r]);
      if (ok) {
        for (const s of signalIdx) {
          if (ranks[s * n + r] === -32768) {
            ok = false;
            break;
          }
        }
      }
      if (ok) pool.push(r);
    }
    if (pool.length < 20) continue;

    const magOf = (r: number) => {
      let sum = 0;
      for (const s of magnitude) sum += dequantizeRank(ranks[s * n + r]);
      return sum / magnitude.length;
    };

    if (magnitude.length && directional.length) {
      const gated = pool.map((r) => ({ r, v: magOf(r) })).sort((a, b) => b.v - a.v);
      const keep = Math.max(20, Math.floor(pool.length * MAGNITUDE_GATE_Q));
      pool = gated.slice(0, keep).map((x) => x.r);
    }
    if (pool.length < 20) continue;

    const m = meanOf(pool.map((r) => returns[r]));
    const excess = pool.map((r) => returns[r] - m);

    const score = pool.map((r) => {
      if (!directional.length) return 0;
      let sum = 0;
      for (const s of directional) sum += dequantizeRank(ranks[s * n + r]);
      return sum / directional.length;
    });
    const magScore = pool.map((r) => (magnitude.length ? magOf(r) : 0));

    dates++;

    const abs = pool.map((r) => Math.abs(returns[r]));
    const sortedAbs = [...abs].sort((a, b) => a - b);
    const threshold = sortedAbs[Math.floor(MOVER_PCTL * (sortedAbs.length - 1))];
    const movers = new Set<number>();
    pool.forEach((r, i) => {
      if (abs[i] >= threshold) movers.add(r);
    });

    const nFlag = Math.max(1, Math.round(pool.length * FLAGGED_SHARE));
    const order = pool
      .map((r, i) => ({ r, s: directional.length ? Math.abs(score[i]) : magScore[i] }))
      .sort((a, b) => b.s - a.s);
    const hit = order.slice(0, nFlag).filter((x) => movers.has(x.r)).length;
    const recall = movers.size ? hit / movers.size : NaN;
    const share = nFlag / pool.length;
    if (Number.isFinite(recall) && share > 0) lifts.push(recall / share);

    if (directional.length) {
      ics.push(spearman(score, excess));
      const ranked = pool
        .map((r, i) => ({ r, s: score[i], e: excess[i] }))
        .sort((a, b) => b.s - a.s);
      const basket = ranked.slice(0, Math.min(BASKET_N, ranked.length));
      const bEx = meanOf(basket.map((x) => x.e));
      basketEx.push(bEx);
      basketAbsPer.push(meanOf(basket.map((x) => returns[x.r])));
      baselineAbsPer.push(meanOf(pool.map((r) => returns[r])));
      if (bEx > 0) dateWins++;
    }
  }

  const finiteIcs = ics.filter((x) => Number.isFinite(x));
  return {
    ic: meanOf(finiteIcs),
    icT: tStat(finiteIcs),
    captureLift: meanOf(lifts),
    basketExcess: meanOf(basketEx),
    basketExcessT: tStat(basketEx),
    basketAbs: meanOf(basketAbsPer),
    baselineAbs: meanOf(baselineAbsPer),
    dateWin: dates ? (100 * dateWins) / dates : NaN,
    nTimestamps: dates,
  };
}
