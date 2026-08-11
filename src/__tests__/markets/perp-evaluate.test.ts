import { describe, it, expect } from "vitest";
import {
  buildRankCache,
  commonMask,
  evaluateCombo,
  effectiveRank,
  rankCorrMatrix,
  blockBootstrapReturns,
} from "@/lib/markets/perp-evaluate";
import type { Panel, PanelConfig } from "@/lib/markets/perp-panel";
import { STUDY_CONFIG } from "@/lib/markets/perp-panel";

function lcg(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * A synthetic panel with a KNOWN relationship between signals and returns.
 *
 * `noise` is independent of the return. `oracle` equals the forward return, so
 * it is the strongest possible signal. `vol` scales with |return| but carries
 * no sign. Having all three lets each objective be checked against an answer
 * that is known in advance rather than merely plausible.
 */
function synthPanel(
  nTimes: number,
  nSyms: number,
  seed = 3,
  cfg: PanelConfig = STUDY_CONFIG,
): Panel {
  const rnd = lcg(seed);
  const signalNames = ["noise", "oracle", "vol"];
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
      rowCategory[r] = 0;
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
    config: cfg,
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

describe("evaluateCombo does not read the outcome", () => {
  const panel = synthPanel(120, 80);
  const cache = buildRankCache(panel);

  /**
   * THE REGRESSION TEST FOR A REAL BUG.
   *
   * The first version of `evaluateCombo` ranked the flagged set by
   * |forward return| whenever a combination had no directional component. That
   * flags the movers by definition, and the first live run duly printed an
   * identical 8.87x lift for all eleven magnitude signals — a look-ahead in the
   * EVALUATOR, where the per-signal causality suite cannot see it.
   *
   * A signal independent of the return must post a lift near 1.0. Anything much
   * above it means the outcome is leaking into the flagging key again.
   */
  it("a signal independent of the return gets a capture lift near 1", () => {
    const r = evaluateCombo(panel, cache, ["noise"], commonMask(panel, ["noise"]));
    expect(r.captureLift).toBeGreaterThan(0.6);
    expect(r.captureLift).toBeLessThan(1.5);
  });

  it("independent signals have no IC and no basket edge", () => {
    const r = evaluateCombo(panel, cache, ["noise"], commonMask(panel, ["noise"]));
    expect(Math.abs(r.ic.meanIc)).toBeLessThan(0.1);
    expect(Math.abs(r.basketExcess)).toBeLessThan(0.6);
  });

  it("a magnitude signal is scored on itself, not on the outcome", () => {
    // `vol` genuinely predicts |return| here (it IS |return|), so its lift is
    // legitimately high — but it must not be the same number `noise` gets, and
    // the two must be distinguishable at all.
    const noise = evaluateCombo(panel, cache, ["noise"], commonMask(panel, ["noise"]));
    const vol = evaluateCombo(panel, cache, ["vol"], commonMask(panel, ["vol"]));
    expect(vol.captureLift).toBeGreaterThan(noise.captureLift + 1);
  });

  it("the oracle signal produces a strongly positive IC", () => {
    const r = evaluateCombo(panel, cache, ["oracle"], commonMask(panel, ["oracle"]));
    expect(r.ic.meanIc).toBeGreaterThan(0.9);
    expect(r.basketExcess).toBeGreaterThan(1);
  });
});

describe("the null model destroys the signal-return link", () => {
  const panel = synthPanel(150, 60, 9);
  const cache = buildRankCache(panel);

  it("block bootstrap removes the oracle's edge", () => {
    const mask = commonMask(panel, ["oracle"]);
    const real = evaluateCombo(panel, cache, ["oracle"], mask);
    expect(real.ic.meanIc).toBeGreaterThan(0.9);

    const permuted = blockBootstrapReturns(panel, cache, 42);
    const nullRun = evaluateCombo(panel, cache, ["oracle"], mask, permuted);
    expect(Math.abs(nullRun.ic.meanIc)).toBeLessThan(0.2);
  });

  it("keeps each donor timestamp's return vector intact", () => {
    // Cross-sectional dependence is preserved only if a whole vector moves
    // together. Every permuted value must exist somewhere in the real returns.
    const permuted = blockBootstrapReturns(panel, cache, 7);
    const real = new Set(Array.from(panel.fwdNet));
    let checked = 0;
    for (let r = 0; r < panel.nRows; r += 37) {
      if (!Number.isFinite(permuted[r])) continue;
      expect(real.has(permuted[r])).toBe(true);
      checked++;
    }
    expect(checked).toBeGreaterThan(10);
  });
});

describe("effectiveRank measures independent bets", () => {
  it("is 1 for a perfectly correlated pair and 2 for an orthogonal one", () => {
    expect(effectiveRank([[1, 1], [1, 1]])).toBeCloseTo(1, 6);
    expect(effectiveRank([[1, 0], [0, 1]])).toBeCloseTo(2, 6);
  });

  it("counts a highly correlated pair as barely more than one bet", () => {
    // Eigenvalues of [[1, r], [1, r]] are 1+r and 1-r, so at r = 0.9 they are
    // 1.9 and 0.1 and the effective rank is 2^2 / (1.9^2 + 0.1^2) = 1.1050.
    // Two signals, barely more than one independent bet — which is the whole
    // reason the parsimony axis is this rather than the raw count.
    expect(effectiveRank([[1, 0.9], [0.9, 1]])).toBeCloseTo(1.105, 3);
  });

  it("scales to three signals", () => {
    expect(effectiveRank([[1, 0, 0], [0, 1, 0], [0, 0, 1]])).toBeCloseTo(3, 6);
  });
});

describe("commonMask keeps every combination on identical rows", () => {
  it("intersects coverage across the named signals", () => {
    const panel = synthPanel(20, 40);
    // Blank out one signal on a slice of rows.
    const s = panel.signalNames.indexOf("vol");
    for (let r = 0; r < 100; r++) panel.values[s * panel.nRows + r] = NaN;

    const maskA = commonMask(panel, ["noise"]);
    const maskB = commonMask(panel, ["noise", "vol"]);
    const countA = Array.from(maskA).filter((x) => x === 1).length;
    const countB = Array.from(maskB).filter((x) => x === 1).length;
    expect(countB).toBe(countA - 100);
  });
});

describe("rankCorrMatrix", () => {
  it("is symmetric with a unit diagonal", () => {
    const panel = synthPanel(30, 50);
    const names = ["noise", "oracle", "vol"];
    const m = rankCorrMatrix(panel, names, commonMask(panel, names));
    for (let i = 0; i < names.length; i++) {
      expect(m[i][i]).toBeCloseTo(1, 6);
      for (let j = 0; j < names.length; j++) expect(m[i][j]).toBeCloseTo(m[j][i], 9);
    }
  });
});
