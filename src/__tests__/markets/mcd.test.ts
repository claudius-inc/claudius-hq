import { describe, it, expect } from "vitest";
import {
  smmaSeries,
  emaSeries,
  smaSeries,
  rsiSeries,
  atrSeries,
  highestSeries,
  lowestSeries,
  barsSinceSeries,
  computeMcdSeries,
  MCD_WARMUP,
  type McdBar,
} from "@/lib/markets/mcd";

/** Deterministic pseudo-random walk — no Math.random, so failures reproduce. */
function synthBars(n: number, seed = 42): McdBar[] {
  let s = seed;
  const rand = () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
  const bars: McdBar[] = [];
  let price = 100;
  for (let i = 0; i < n; i++) {
    const drift = (rand() - 0.48) * 2;
    const open = price;
    const close = Math.max(1, price + drift);
    const high = Math.max(open, close) + rand() * 0.8;
    const low = Math.min(open, close) - rand() * 0.8;
    bars.push({ o: open, h: high, l: low, c: close, v: 1000 + rand() * 4000 });
    price = close;
  }
  return bars;
}

describe("MA primitives", () => {
  it("smma seeds with an SMA then applies Wilder smoothing", () => {
    const src = [1, 2, 3, 4, 5];
    const out = smmaSeries(src, 3);
    expect(out.slice(0, 2)).toEqual([null, null]);
    expect(out[2]).toBeCloseTo(2, 10); // SMA(1,2,3)
    expect(out[3]).toBeCloseTo((2 * 2 + 4) / 3, 10);
    expect(out[4]).toBeCloseTo(((2 * 2 + 4) / 3) * (2 / 3) + 5 / 3, 10);
  });

  it("ema seeds with an SMA then applies the 2/(n+1) factor", () => {
    const src = [1, 2, 3, 4];
    const out = emaSeries(src, 3);
    expect(out[2]).toBeCloseTo(2, 10);
    expect(out[3]).toBeCloseTo(4 * 0.5 + 2 * 0.5, 10);
  });

  it("sma is a true rolling window", () => {
    expect(smaSeries([1, 2, 3, 4, 5], 2)).toEqual([null, 1.5, 2.5, 3.5, 4.5]);
  });

  it("returns all nulls when the window exceeds the input", () => {
    expect(smmaSeries([1, 2], 5).every((v) => v === null)).toBe(true);
    expect(emaSeries([1, 2], 5).every((v) => v === null)).toBe(true);
  });
});

describe("rsiSeries", () => {
  it("returns 100 on a monotonically rising series", () => {
    const closes = Array.from({ length: 30 }, (_, i) => 100 + i);
    const out = rsiSeries(closes, 14);
    expect(out[29]).toBe(100);
  });

  it("returns 0 on a monotonically falling series", () => {
    const closes = Array.from({ length: 30 }, (_, i) => 100 - i);
    const out = rsiSeries(closes, 14);
    expect(out[29]).toBeCloseTo(0, 10);
  });

  it("stays within 0..100 and is undefined before the seed bar", () => {
    const closes = synthBars(200).map((b) => b.c);
    const out = rsiSeries(closes, 14);
    expect(out.slice(0, 14).every((v) => v === null)).toBe(true);
    for (const v of out.slice(14)) {
      expect(v).not.toBeNull();
      expect(v as number).toBeGreaterThanOrEqual(0);
      expect(v as number).toBeLessThanOrEqual(100);
    }
  });
});

describe("range and event primitives", () => {
  it("highest/lowest read a trailing window ending at the bar", () => {
    expect(highestSeries([1, 5, 3, 2], 2)).toEqual([null, 5, 5, 3]);
    expect(lowestSeries([1, 5, 3, 2], 2)).toEqual([null, 1, 3, 2]);
  });

  it("barsSince counts from the most recent true, and is null before any", () => {
    expect(barsSinceSeries([false, true, false, false, true])).toEqual([null, 0, 1, 2, 0]);
  });

  it("atr is positive once seeded", () => {
    const bars = synthBars(100);
    const out = atrSeries(bars, 14);
    expect(out[13]).not.toBeNull();
    expect(out[99] as number).toBeGreaterThan(0);
  });
});

describe("computeMcdSeries", () => {
  const bars = synthBars(600);
  const series = computeMcdSeries(bars);

  it("scores every bar within 0..5 for both directions", () => {
    expect(series).toHaveLength(bars.length);
    for (const r of series) {
      expect(r.longScore).toBeGreaterThanOrEqual(0);
      expect(r.longScore).toBeLessThanOrEqual(5);
      expect(r.shortScore).toBeGreaterThanOrEqual(0);
      expect(r.shortScore).toBeLessThanOrEqual(5);
    }
  });

  it("never scores both directions at a perfect 5 on the same bar", () => {
    // Trend and proximity are mutually exclusive by construction; a bar that
    // scored 5/5 both ways would mean a sign error somewhere in the port.
    for (const r of series) {
      expect(Math.min(r.longScore, r.shortScore)).toBeLessThan(5);
    }
  });

  it("produces a non-degenerate score distribution", () => {
    // A port that silently nulls out an indicator shows up here as every bar
    // scoring the same value.
    const distinct = new Set(series.slice(MCD_WARMUP).map((r) => r.longScore));
    expect(distinct.size).toBeGreaterThan(2);
  });

  /**
   * THE critical property for a backtest. `computeMcdSeries` runs once over the
   * full array for speed; that is only legitimate if bar i's reading depends on
   * nothing after bar i. Re-scoring truncated histories must reproduce it
   * exactly. If this fails, every backtest number is contaminated by lookahead.
   */
  it("is causal — a truncated history reproduces the same reading", () => {
    for (const i of [350, 420, 500, 599]) {
      const truncated = computeMcdSeries(bars.slice(0, i + 1));
      const asOf = truncated[truncated.length - 1];
      expect(asOf.longScore).toBe(series[i].longScore);
      expect(asOf.shortScore).toBe(series[i].shortScore);
      expect(asOf.longFactors).toEqual(series[i].longFactors);
      expect(asOf.shortFactors).toEqual(series[i].shortFactors);
      expect(asOf.rsi).toBeCloseTo(series[i].rsi as number, 9);
    }
  });

  it("flags only on the bar the threshold is first crossed", () => {
    for (let i = 1; i < series.length; i++) {
      if (series[i].longFlag) {
        expect(series[i].longScore).toBeGreaterThanOrEqual(3);
        expect(series[i - 1].longScore).toBeLessThan(3);
      }
    }
  });
});
