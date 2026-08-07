import { describe, it, expect } from "vitest";
import {
  retOver,
  realizedVol,
  ret12mEx1m,
  pos52w,
  trendPersistence,
  distAbove200,
  maStackContinuous,
  macdHistNorm,
  volumeTrend,
  computeSignals,
  rankZ,
  SIGNAL_NAMES,
  type SignalWindow,
} from "@/lib/markets/signals";

const ramp = (n: number, from: number, to: number) =>
  Array.from({ length: n }, (_, i) => from + ((to - from) * i) / (n - 1));

const flat = (n: number, v = 100) => new Array(n).fill(v);

function window(over: Partial<SignalWindow> = {}): SignalWindow {
  const closes = ramp(300, 100, 150);
  return {
    closes,
    volumes: flat(300, 1_000_000),
    sma20: 148,
    sma50: 145,
    sma200: 130,
    rsi14: 60,
    macdLine: 1.2,
    macdSignal: 0.8,
    avgVol20d: 1_200_000,
    avgVol60d: 1_000_000,
    adx14: 30,
    ...over,
  };
}

describe("retOver", () => {
  it("computes a simple percent return over n bars", () => {
    expect(retOver([100, 110], 1)).toBeCloseTo(10, 10);
    expect(retOver([100, 105, 110, 90], 3)).toBeCloseTo(-10, 10);
  });

  it("returns null when the window is too short", () => {
    expect(retOver([100], 5)).toBeNull();
  });
});

describe("realizedVol", () => {
  it("is zero for a perfectly flat series", () => {
    expect(realizedVol(flat(100), 60)).toBeCloseTo(0, 8);
  });

  it("increases with dispersion", () => {
    const calm = Array.from({ length: 100 }, (_, i) => 100 + (i % 2));
    const wild = Array.from({ length: 100 }, (_, i) => 100 + (i % 2) * 20);
    expect(realizedVol(wild, 60)!).toBeGreaterThan(realizedVol(calm, 60)!);
  });

  it("returns null below the lookback", () => {
    expect(realizedVol(flat(10), 60)).toBeNull();
  });
});

describe("ret12mEx1m", () => {
  it("mirrors production's anchors: bar n-1-252 to bar n-1-21", () => {
    const closes = flat(300, 100);
    closes[300 - 1 - 252] = 100;
    closes[300 - 1 - 21] = 130;
    expect(ret12mEx1m(closes)).toBeCloseTo(30, 6);
  });

  it("ignores the most recent 21 bars entirely", () => {
    const a = ramp(300, 100, 150);
    const b = [...a];
    for (let i = b.length - 21; i < b.length; i++) b[i] = 9999;
    expect(ret12mEx1m(b)).toBeCloseTo(ret12mEx1m(a)!, 10);
  });

  it("returns null below 253 bars", () => {
    expect(ret12mEx1m(flat(252))).toBeNull();
  });
});

describe("pos52w", () => {
  it("is 1 at the top of the trailing range and 0 at the bottom", () => {
    expect(pos52w(ramp(260, 100, 200))).toBeCloseTo(1, 6);
    expect(pos52w(ramp(260, 200, 100))).toBeCloseTo(0, 6);
  });

  it("is continuous rather than snapped to production's 26 levels", () => {
    // Two nearby-but-distinct positions must produce distinct values; the
    // tiered scorer would collapse both to the same integer.
    const a = pos52w([...ramp(259, 100, 200), 150.0])!;
    const b = pos52w([...ramp(259, 100, 200), 150.4])!;
    expect(a).not.toBe(b);
  });

  it("uses only the trailing 252 bars", () => {
    const closes = [...flat(100, 10_000), ...ramp(260, 100, 200)];
    expect(pos52w(closes)).toBeCloseTo(1, 6); // the old spike must not set the high
  });
});

describe("trendPersistence", () => {
  it("is 1 for a steady uptrend and 0 for a steady downtrend", () => {
    expect(trendPersistence(ramp(200, 100, 200))).toBeCloseTo(1, 6);
    expect(trendPersistence(ramp(200, 200, 100))).toBeCloseTo(0, 6);
  });

  it("returns null without lookback + 20 bars", () => {
    expect(trendPersistence(flat(50))).toBeNull();
  });
});

describe("distAbove200 / maStack / macdHist / volumeTrend", () => {
  it("distAbove200 is a signed fraction and is NOT capped at +50%", () => {
    // Production caps at 0.50 before tiering, so everything above is identical.
    expect(distAbove200(300, 100)).toBeCloseTo(2, 10);
    expect(distAbove200(90, 100)).toBeCloseTo(-0.1, 10);
    expect(distAbove200(100, null)).toBeNull();
  });

  it("maStack rewards a wider spread, not just correct ordering", () => {
    const tight = maStackContinuous(101, 100.5, 100.2, 100)!;
    const wide = maStackContinuous(140, 130, 120, 100)!;
    expect(wide).toBeGreaterThan(tight);
    // Both are perfectly ordered, so production would score them identically.
    expect(tight).toBeGreaterThan(0);
  });

  it("maStack goes negative for an inverted ladder", () => {
    expect(maStackContinuous(100, 110, 120, 130)!).toBeLessThan(0);
  });

  it("macdHist is price-normalized so it compares across names", () => {
    const cheap = macdHistNorm(1, 0.5, 10)!;
    const dear = macdHistNorm(10, 5, 100)!;
    expect(cheap).toBeCloseTo(dear, 10);
  });

  it("volumeTrend is the raw ratio minus one", () => {
    expect(volumeTrend(130, 100)).toBeCloseTo(0.3, 10);
    expect(volumeTrend(100, 0)).toBeNull();
  });
});

describe("computeSignals", () => {
  it("emits every declared signal name", () => {
    const s = computeSignals(window());
    for (const name of SIGNAL_NAMES) expect(name in s).toBe(true);
  });

  it("sign-flips reversal so that a recent LOSS scores high", () => {
    const falling = [...ramp(295, 100, 150), ...ramp(5, 150, 120)];
    const rising = [...ramp(295, 100, 150), ...ramp(5, 150, 180)];
    const loser = computeSignals(window({ closes: falling })).rev1w!;
    const winner = computeSignals(window({ closes: rising })).rev1w!;
    expect(loser).toBeGreaterThan(winner);
    expect(loser).toBeGreaterThan(0);
  });

  it("sign-flips lowVol so that a calm name scores high", () => {
    const calm = Array.from({ length: 300 }, (_, i) => 100 + (i % 2) * 0.1);
    const wild = Array.from({ length: 300 }, (_, i) => 100 + (i % 2) * 20);
    expect(computeSignals(window({ closes: calm })).lowVol!).toBeGreaterThan(
      computeSignals(window({ closes: wild })).lowVol!,
    );
  });

  it("scores rsiSweet highest at the middle of production's favoured band", () => {
    const at60 = computeSignals(window({ rsi14: 60 })).rsiSweet!;
    const at40 = computeSignals(window({ rsi14: 40 })).rsiSweet!;
    const at85 = computeSignals(window({ rsi14: 85 })).rsiSweet!;
    expect(at60).toBeGreaterThan(at40);
    expect(at60).toBeGreaterThan(at85);
  });

  it("keeps rsiRaw and rsiSweet distinct — they encode different claims", () => {
    const s = computeSignals(window({ rsi14: 85 }));
    expect(s.rsiRaw).toBe(85);
    expect(s.rsiSweet).toBeLessThan(0);
  });

  it("propagates null rather than coercing a missing input to zero", () => {
    // Null-to-zero coercion in the production scorers is what let data flaps
    // manufacture large deltas; the harness must not repeat it.
    const s = computeSignals(window({ sma200: null, rsi14: null, adx14: null }));
    expect(s.distAbove200).toBeNull();
    expect(s.rsiRaw).toBeNull();
    expect(s.rsiSweet).toBeNull();
    expect(s.adx).toBeNull();
  });

  it("returns nulls for a short window instead of throwing", () => {
    const s = computeSignals(window({ closes: flat(30), volumes: flat(30) }));
    expect(s.ret12mEx1m).toBeNull();
    expect(s.pos52w).toBeNull();
  });
});

describe("rankZ", () => {
  it("maps ranks onto roughly [-1, 1]", () => {
    const z = rankZ([10, 20, 30, 40, 50]) as number[];
    expect(z[0]).toBeCloseTo(-1, 10);
    expect(z[4]).toBeCloseTo(1, 10);
    expect(z[2]).toBeCloseTo(0, 10);
  });

  it("is immune to outliers that would dominate a raw z-score", () => {
    const a = rankZ([1, 2, 3, 4, 5]) as number[];
    const b = rankZ([1, 2, 3, 4, 1e9]) as number[];
    expect(b).toEqual(a); // only the ordering matters
  });

  it("preserves null positions so callers can drop incomplete rows", () => {
    const z = rankZ([5, null, 15, 25]);
    expect(z[1]).toBeNull();
    expect(z.filter((v) => v !== null)).toHaveLength(3);
  });

  it("averages within tie groups", () => {
    const z = rankZ([7, 7, 9]) as number[];
    expect(z[0]).toBe(z[1]);
    expect(z[2]).toBeGreaterThan(z[0]);
  });

  it("returns all nulls below three usable values", () => {
    expect(rankZ([1, null]).every((v) => v === null)).toBe(true);
  });
});
