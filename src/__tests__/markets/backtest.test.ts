import { describe, it, expect } from "vitest";
import {
  spearman,
  summarizeIc,
  quantileSpread,
  inputsAsOf,
  replay,
  type Bar,
  type ScoredRow,
} from "@/lib/markets/backtest";

/** Deterministic pseudo-random so fixtures are reproducible without a seed lib. */
function lcg(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

/** `n` daily bars trending at `driftPctPerBar`, with mild noise. */
function series(n: number, start = 100, driftPctPerBar = 0.05, seed = 1): Bar[] {
  const rnd = lcg(seed);
  const out: Bar[] = [];
  let px = start;
  const base = new Date("2020-01-01").getTime();
  for (let i = 0; i < n; i++) {
    px = px * (1 + driftPctPerBar / 100 + (rnd() - 0.5) / 100);
    const d = new Date(base + i * 86400000).toISOString().slice(0, 10);
    out.push({ d, o: px, h: px * 1.01, l: px * 0.99, c: px, a: px, v: 1_000_000 });
  }
  return out;
}

describe("spearman", () => {
  it("returns 1 for a perfectly concordant ranking", () => {
    expect(spearman([1, 2, 3, 4, 5], [10, 20, 30, 40, 50])).toBeCloseTo(1, 10);
  });

  it("returns -1 for a perfectly discordant ranking", () => {
    expect(spearman([1, 2, 3, 4, 5], [50, 40, 30, 20, 10])).toBeCloseTo(-1, 10);
  });

  it("is invariant to monotone transforms of either input", () => {
    const xs = [3, 1, 4, 1, 5, 9, 2, 6];
    const ys = [2, 7, 1, 8, 2, 8, 1, 8];
    expect(spearman(xs, ys)).toBeCloseTo(
      spearman(xs.map((x) => Math.exp(x)), ys),
      10,
    );
  });

  it("averages ranks within tie groups", () => {
    // Both scores are small integers in practice, so ties are the norm. Naive
    // ordinal ranking would invent ordering inside a tie group.
    // xs = [5,5,5,5] is constant => zero variance => undefined correlation.
    expect(Number.isNaN(spearman([5, 5, 5, 5], [1, 2, 3, 4]))).toBe(true);
    // A partial tie is well-defined and must not depend on input order.
    const a = spearman([1, 1, 2, 3], [10, 20, 30, 40]);
    const b = spearman([1, 1, 2, 3].reverse(), [10, 20, 30, 40].reverse());
    expect(a).toBeCloseTo(b, 10);
  });

  it("returns NaN below three points", () => {
    expect(Number.isNaN(spearman([1, 2], [3, 4]))).toBe(true);
  });
});

describe("summarizeIc", () => {
  it("computes mean, t-stat and hit rate", () => {
    const s = summarizeIc([0.1, 0.2, 0.0, -0.1, 0.3]);
    expect(s.n).toBe(5);
    expect(s.meanIc).toBeCloseTo(0.1, 10);
    expect(s.hitRate).toBeCloseTo(60, 10); // 3 of 5 strictly > 0
    expect(s.tStat).toBeGreaterThan(0);
  });

  it("drops non-finite ICs rather than poisoning the mean", () => {
    const s = summarizeIc([0.1, NaN, 0.3]);
    expect(s.n).toBe(2);
    expect(s.meanIc).toBeCloseTo(0.2, 10);
  });

  it("reports a larger t-stat for the same mean over more dates", () => {
    const few = summarizeIc([0.05, 0.15]);
    const many = summarizeIc([0.05, 0.15, 0.05, 0.15, 0.05, 0.15, 0.05, 0.15]);
    expect(many.tStat).toBeGreaterThan(few.tStat);
  });

  it("handles an empty series without throwing", () => {
    expect(summarizeIc([]).n).toBe(0);
  });
});

describe("quantileSpread", () => {
  const rows: ScoredRow[] = Array.from({ length: 50 }, (_, i) => ({
    ticker: `T${i}`,
    momentum: i,
    technical: 50 - i,
    momentumDelta: 0,
    signals: {},
    advLocal: null,
    fwd: i,
    excess: i - 24.5,
  }));

  it("puts high scorers in the top bucket and reports a positive spread", () => {
    const q = quantileSpread(rows, (r) => r.momentum, 5);
    expect(q.nPerBucket).toBe(10);
    expect(q.top).toBeGreaterThan(q.bottom);
    expect(q.spread).toBeCloseTo(q.top - q.bottom, 10);
  });

  it("flips sign for a score that ranks inversely to the outcome", () => {
    const q = quantileSpread(rows, (r) => r.technical, 5);
    expect(q.spread).toBeLessThan(0);
  });

  it("degrades gracefully when there are fewer rows than buckets", () => {
    expect(quantileSpread(rows.slice(0, 3), (r) => r.momentum, 5).nPerBucket).toBe(0);
  });
});

describe("inputsAsOf", () => {
  it("returns null without enough warmup for return12mEx1m", () => {
    expect(inputsAsOf(series(252))).toBeNull();
  });

  it("produces scorable inputs once warmed up", () => {
    const inputs = inputsAsOf(series(400))!;
    expect(inputs).not.toBeNull();
    expect(inputs.price).toBeGreaterThan(0);
    expect(inputs.sma200).toBeGreaterThan(0);
    expect(inputs.return12mEx1m).not.toBeNull();
  });

  it("derives the 52w high/low from the trailing window, not the whole history", () => {
    // A spike 300 bars back must NOT set the 52-week high, or the replay is
    // reading data that a point-in-time observer could not have used.
    const bars = series(400);
    bars[50] = { ...bars[50], a: 100000, c: 100000, h: 100000 };
    const inputs = inputsAsOf(bars)!;
    expect(inputs.fiftyTwoWeekHigh).toBeLessThan(100000);
  });

  it("uses adjusted close, not raw close", () => {
    // Raw close carries split artifacts; the harness must ignore it entirely.
    const bars = series(400).map((b) => ({ ...b, c: b.a * 10 }));
    const fromAdj = inputsAsOf(series(400))!;
    const fromMangledRaw = inputsAsOf(bars)!;
    expect(fromMangledRaw.price).toBeCloseTo(fromAdj.price!, 6);
  });
});

describe("replay", () => {
  /** Two tickers on the same calendar, one trending up and one down. */
  function history(): Map<string, Bar[]> {
    const m = new Map<string, Bar[]>();
    for (let i = 0; i < 40; i++) {
      m.set(`UP${i}`, series(400, 100, 0.08, i + 1));
      m.set(`DN${i}`, series(400, 100, -0.05, i + 100));
    }
    return m;
  }

  it("produces slices whose excess returns are mean-zero by construction", () => {
    const slices = replay(history(), { horizon: 5, maxDates: 5 });
    expect(slices.length).toBeGreaterThan(0);
    for (const s of slices) {
      const mean = s.rows.reduce((a, b) => a + b.excess, 0) / s.rows.length;
      expect(mean).toBeCloseTo(0, 8);
    }
  });

  it("never scores a date without a full forward window (no lookahead)", () => {
    // Every row must have `horizon` bars available after its as-of date. If the
    // replay ever scored the tail of the series it would silently truncate the
    // forward return and bias results.
    const h = history();
    const slices = replay(h, { horizon: 20 });
    const lastDate = Array.from(h.values())[0].at(-1)!.d;
    for (const s of slices) {
      expect(s.date < lastDate).toBe(true);
    }
  });

  it("samples dates non-overlapping at the horizon by default", () => {
    const h = history();
    const slices = replay(h, { horizon: 10 });
    const allDates = Array.from(
      new Set(Array.from(h.values()).flatMap((b) => b.map((x) => x.d))),
    ).sort();
    const idx = slices.map((s) => allDates.indexOf(s.date));
    for (let i = 1; i < idx.length; i++) {
      expect(idx[i] - idx[i - 1]).toBe(10);
    }
  });

  it("skips dates with too thin a cross-section", () => {
    const thin = new Map<string, Bar[]>([["ONLY", series(400)]]);
    expect(replay(thin, { horizon: 5, minNames: 30 })).toHaveLength(0);
  });

  it("ranks a persistent uptrend above a persistent downtrend", () => {
    // End-to-end sanity: the production scorers, driven by the harness, must
    // put trending-up names above trending-down ones. If this fails the wiring
    // is wrong, whatever the IC says.
    const slices = replay(history(), { horizon: 5, maxDates: 3 });
    for (const s of slices) {
      const up = s.rows.filter((r) => r.ticker.startsWith("UP"));
      const dn = s.rows.filter((r) => r.ticker.startsWith("DN"));
      const meanOf = (xs: ScoredRow[]) => xs.reduce((a, b) => a + b.momentum, 0) / xs.length;
      expect(meanOf(up)).toBeGreaterThan(meanOf(dn));
    }
  });
});
