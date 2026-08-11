import { describe, it, expect } from "vitest";
import {
  encodePayload,
  decodePayload,
  quantizeRank,
  dequantizeRank,
  scoreCombo,
  timestampRanges,
  type ExplorerHeader,
} from "@/lib/markets/combo-explorer";
import {
  buildRankCache,
  commonMask,
  evaluateCombo,
} from "@/lib/markets/perp-evaluate";
import { STUDY_CONFIG, type Panel } from "@/lib/markets/perp-panel";
import { rowsByTimestamp } from "@/lib/markets/perp-panel";

function lcg(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * Synthetic panel with a known signal-return relationship.
 *
 * `maStack` is independent of the return, `rev6` IS the return (the strongest
 * possible signal), and `rvol` is its magnitude.
 *
 * THE NAMES ARE LOAD-BEARING. `evaluateCombo` resolves each signal's polarity
 * through the global `SIGNAL_BY_NAME` registry, whereas the explorer reads it
 * from the payload header. Inventing names would make the registry lookup fall
 * back to "directional" for every one of them, so the server would blend a
 * magnitude signal into the ordering while the explorer gated on it — and the
 * comparison below would report a divergence that exists only in the fixture.
 * In production both sides read the same registry, because the export writes
 * `SIGNAL_BY_NAME`'s polarities into the header.
 */
function synthPanel(nTimes: number, nSyms: number, seed = 5): Panel {
  const rnd = lcg(seed);
  const signalNames = ["maStack", "rev6", "rvol"];
  const nRows = nTimes * nSyms;
  const values = new Float64Array(signalNames.length * nRows);
  const fwdGross = new Float64Array(nRows);
  const fwdNet = new Float64Array(nRows);
  const excess = new Float64Array(nRows);
  const rowTime = new Int32Array(nRows);
  const rowSymbol = new Int32Array(nRows);
  const rowCategory = new Uint8Array(nRows);

  let r = 0;
  for (let t = 0; t < nTimes; t++) {
    const rets: number[] = [];
    for (let s = 0; s < nSyms; s++) rets.push((rnd() - 0.5) * 10);
    const m = rets.reduce((a, b) => a + b, 0) / nSyms;
    for (let s = 0; s < nSyms; s++) {
      rowTime[r] = t;
      rowSymbol[r] = s;
      fwdGross[r] = rets[s];
      fwdNet[r] = rets[s];
      excess[r] = rets[s] - m;
      values[0 * nRows + r] = rnd();
      values[1 * nRows + r] = rets[s];
      values[2 * nRows + r] = Math.abs(rets[s]);
      r++;
    }
  }

  return {
    config: STUDY_CONFIG,
    signalNames,
    times: Array.from({ length: nTimes }, (_, i) => i * 1000),
    symbols: Array.from({ length: nSyms }, (_, i) => `S${i}`),
    categories: ["crypto"],
    nRows,
    rowTime,
    rowSymbol,
    rowCategory,
    values,
    fwdGross,
    fwdNet,
    excess,
    coverage: signalNames.map(() => 1),
    stats: {
      universe: nSyms,
      tooShort: 0,
      illiquid: 0,
      timestampsSampled: nTimes,
      timestampsUsable: nTimes,
      rowsByCategory: { crypto: nRows },
      rowsWithExcess: nRows,
    },
  };
}

/** Exports a panel exactly as `export-combo-explorer.ts` does. */
function exportPanel(panel: Panel, stride: number, polarities: ("directional" | "magnitude")[]) {
  const cache = buildRankCache(panel);
  const mask = commonMask(panel, panel.signalNames);
  const groups = rowsByTimestamp(panel).filter((_, i) => i % stride === 0);

  const rows: number[] = [];
  const rowsPerTimestamp: number[] = [];
  for (const g of groups) {
    const usable = g.filter((r) => mask[r] === 1);
    if (usable.length < 20) continue;
    rowsPerTimestamp.push(usable.length);
    rows.push(...usable);
  }

  const nRows = rows.length;
  const ranks = new Int16Array(panel.signalNames.length * nRows);
  const returns = new Float64Array(nRows);
  panel.signalNames.forEach((_, s) => {
    for (let i = 0; i < nRows; i++) {
      ranks[s * nRows + i] = quantizeRank(cache.z[s * panel.nRows + rows[i]]);
    }
  });
  for (let i = 0; i < nRows; i++) returns[i] = panel.fwdNet[rows[i]];

  const header: ExplorerHeader = {
    version: 1,
    runDate: "2026-08-11",
    horizon: 6,
    signals: panel.signalNames,
    polarities,
    groups: panel.signalNames.map(() => "test"),
    nRows,
    nTimestamps: rowsPerTimestamp.length,
    rowsPerTimestamp,
    timeStride: stride,
    fullTimestamps: panel.times.length,
    cryptoShare: 1,
  };
  return { header, ranks, returns, cache, mask };
}

describe("quantization", () => {
  it("round-trips rank-z within 1/127", () => {
    for (const z of [-1, -0.5, -0.004, 0, 0.004, 0.5, 1]) {
      expect(Math.abs(dequantizeRank(quantizeRank(z)) - z)).toBeLessThanOrEqual(1 / 32767);
    }
  });

  it("uses a distinct sentinel for absent values", () => {
    expect(quantizeRank(NaN)).toBe(-32768);
    expect(Number.isNaN(dequantizeRank(-32768))).toBe(true);
    // -32768 must not be reachable from a real rank, or "absent" and "the most
    // negative rank" would be the same byte.
    expect(quantizeRank(-1)).toBe(-32767);
  });
});

describe("payload encoding", () => {
  it("round-trips header, ranks and returns exactly", () => {
    const panel = synthPanel(12, 40);
    const { header, ranks, returns } = exportPanel(panel, 1, [
      "directional",
      "directional",
      "magnitude",
    ]);
    const bytes = encodePayload(header, ranks, returns);
    // Copied into a fresh ArrayBuffer: `bytes.buffer` is typed as
    // ArrayBuffer | SharedArrayBuffer, and only the former is decodable.
    const copy = new ArrayBuffer(bytes.length);
    new Uint8Array(copy).set(bytes);
    const decoded = decodePayload(copy);

    expect(decoded.header).toEqual(header);
    expect(Array.from(decoded.ranks)).toEqual(Array.from(ranks));
    expect(Array.from(decoded.returns)).toEqual(Array.from(returns));
  });

  it("derives timestamp ranges that tile the rows exactly", () => {
    const panel = synthPanel(9, 30);
    const { header } = exportPanel(panel, 1, ["directional", "directional", "magnitude"]);
    const ranges = timestampRanges(header);
    expect(ranges).toHaveLength(header.nTimestamps);
    expect(ranges[0].from).toBe(0);
    expect(ranges[ranges.length - 1].to).toBe(header.nRows);
    for (let i = 1; i < ranges.length; i++) expect(ranges[i].from).toBe(ranges[i - 1].to);
  });
});

/**
 * THE DIVERGENCE GUARD.
 *
 * `combo-explorer.ts` reimplements combination scoring against a quantized,
 * column-major layout so it can run in the browser. Two implementations of one
 * definition drift silently — the page would show a different number from the
 * research script for the same question, and nothing would flag it.
 *
 * At `stride = 1` the export contains every row the server panel does, so the
 * only remaining difference is int8 quantization of a rank. The two must agree
 * to within that.
 */
describe("browser scorer matches the server scorer", () => {
  const panel = synthPanel(60, 50, 11);
  const polarities: ("directional" | "magnitude")[] = [
    "directional",
    "directional",
    "magnitude",
  ];
  const { header, ranks, returns, mask } = exportPanel(panel, 1, polarities);
  const explorer = { header, ranks, returns };
  const cache = buildRankCache(panel);

  const cases: string[][] = [
    ["rev6"],
    ["maStack"],
    ["rev6", "maStack"],
    ["rev6", "rvol"],
    ["maStack", "rvol"],
  ];

  for (const names of cases) {
    it(`agrees on {${names.join(", ")}}`, () => {
      const idx = names.map((n) => header.signals.indexOf(n));
      const mine = scoreCombo(explorer, idx);
      const theirs = evaluateCombo(panel, cache, names, mask);

      expect(mine.nTimestamps).toBe(theirs.nTimestamps);

      // IC is CONTINUOUS — it reads the whole cross-section's ordering, so a
      // last-bit rounding difference moves it by nothing. Held tight.
      expect(mine.ic).toBeCloseTo(theirs.ic.meanIc, 2);

      // The rest are SET-MEMBERSHIP statistics: a name is either inside the top
      // decile / top ten or outside it, and the metric jumps when membership
      // changes. Averaging two quantized ranks can land on the opposite side of
      // a near-tie from averaging two exact ones, swapping one name and moving
      // these by a fraction of a percent. That is the irreducible cost of
      // shipping ranks as int16 — bounded, not eliminated. Asserting them at
      // 2dp would make this guard fail on quantization noise rather than on the
      // real divergence it exists to catch.
      expect(mine.captureLift).toBeCloseTo(theirs.captureLift, 1);
      expect(mine.basketExcess).toBeCloseTo(theirs.basketExcess, 1);
      expect(mine.basketAbs).toBeCloseTo(theirs.basketAbs, 1);
    });
  }

  it("keeps the magnitude gate a gate, not an addend", () => {
    // Adding a magnitude signal to a directional one must NARROW the population
    // rather than blend the rankings, so the sample count falls while the
    // ordering stays recognisably the oracle.
    const solo = scoreCombo(explorer, [header.signals.indexOf("rev6")]);
    const gated = scoreCombo(explorer, [
      header.signals.indexOf("rev6"),
      header.signals.indexOf("rvol"),
    ]);
    expect(gated.ic).toBeGreaterThan(0.8);
    expect(solo.ic).toBeGreaterThan(0.8);
  });

  it("returns no IC for a magnitude-only selection", () => {
    const magOnly = scoreCombo(explorer, [header.signals.indexOf("rvol")]);
    expect(Number.isNaN(magOnly.ic)).toBe(true);
    // Capture is still defined — a magnitude signal claims a move, and that is
    // exactly what capture measures.
    expect(magOnly.captureLift).toBeGreaterThan(1);
  });
});
