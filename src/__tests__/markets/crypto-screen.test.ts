import { describe, it, expect } from "vitest";
import {
  sparkStats,
  spikey,
  p30ex7,
  isStableish,
  floatRatio,
  quantile,
  pctlOf,
  normalizeCoins,
  screenCoins,
  SCREEN_CONFIG,
  type Coin,
} from "@/lib/markets/crypto-screen";

/** Minimal Coin with sane defaults; override only what a test cares about. */
function coin(over: Partial<Coin> = {}): Coin {
  return {
    rank: 50,
    id: "test-coin",
    sym: "TEST",
    name: "Test Coin",
    price: 1,
    vol: 50_000_000,
    mcap: 500_000_000,
    fdv: 500_000_000,
    athc: -20,
    p24: 5,
    p7: 15,
    p30: 30,
    spark: { last24Share: 0.3, ddFromHigh: -0.02, risingFrac: 0.8 },
    ...over,
  };
}

/** Hourly series of `n` points rising linearly from `from` to `to`. */
function ramp(from: number, to: number, n = 168): number[] {
  return Array.from({ length: n }, (_, i) => from + ((to - from) * i) / (n - 1));
}

describe("sparkStats", () => {
  it("returns null below 48 bars", () => {
    expect(sparkStats(ramp(1, 2, 47))).toBeNull();
    expect(sparkStats(undefined)).toBeNull();
  });

  it("computes share of the week's gain that happened in the last 24h", () => {
    const s = sparkStats(ramp(100, 200))!;
    // A linear ramp puts ~24/167 of the move in the last 24 bars.
    expect(s.last24Share).toBeGreaterThan(0.1);
    expect(s.last24Share).toBeLessThan(0.2);
    expect(s.risingFrac).toBe(1);
    expect(s.ddFromHigh).toBeCloseTo(0, 5);
  });

  it("treats a DOWN week as share=1 instead of flipping sign", () => {
    // Regression: the old expression `gain24h / gain7d` went NEGATIVE when the
    // week was down, which silently passed every `last24Share > MAX` guard —
    // exactly the post-spike-decay profile the screen should reject.
    const px = [...ramp(200, 100, 144), ...ramp(100, 110, 24)];
    const s = sparkStats(px)!;
    expect(s.last24Share).toBe(1);
    expect(s.last24Share).toBeGreaterThan(SCREEN_CONFIG.max24Share);
  });

  it("treats a flat week as share=1 rather than dividing by ~zero", () => {
    const s = sparkStats(new Array(168).fill(100))!;
    expect(s.last24Share).toBe(1);
    expect(Number.isFinite(s.last24Share)).toBe(true);
  });

  it("reports drawdown from the 7d high", () => {
    const px = [...ramp(100, 200, 100), ...ramp(200, 180, 68)];
    const s = sparkStats(px)!;
    expect(s.ddFromHigh).toBeCloseTo(-0.1, 2);
  });
});

describe("spikey", () => {
  it("flags an absolute daily pop", () => {
    expect(spikey(coin({ p24: 13 }))).toBe(true);
    expect(spikey(coin({ p24: 11 }))).toBe(false);
  });

  it("flags a week whose move is mostly today", () => {
    expect(spikey(coin({ spark: { last24Share: 0.7, ddFromHigh: -0.01, risingFrac: 0.9 } }))).toBe(true);
  });

  it("flags a coin already fading off its 7d high", () => {
    // Regression: the OLD clause was `!(p24>0 && p7>0 && p24 > 0.6*p7)`, which
    // (given p7>0 was required upstream) could never fire when p24 <= 0 — so a
    // coin that popped mid-week and is bleeding today always passed.
    const fading = coin({ p24: -9, spark: { last24Share: 0.1, ddFromHigh: -0.15, risingFrac: 0.4 } });
    expect(spikey(fading)).toBe(true);
  });

  it("does not flag a steady climber", () => {
    expect(spikey(coin())).toBe(false);
  });
});

describe("p30ex7", () => {
  it("strips the last week out of the month return", () => {
    // +30% month that is entirely this week's +30% => flat before the week.
    expect(p30ex7(coin({ p30: 30, p7: 30 }))).toBeCloseTo(0, 6);
  });

  it("goes negative for a bounce inside a downtrend", () => {
    // Down 20% on the month but up 25% this week => the prior 3 weeks were bad.
    expect(p30ex7(coin({ p30: -20, p7: 25 }))).toBeLessThan(0);
  });

  it("stays positive when the month was already rising", () => {
    expect(p30ex7(coin({ p30: 50, p7: 10 }))).toBeGreaterThan(0);
  });
});

describe("isStableish", () => {
  it("catches USD stablecoins by symbol", () => {
    expect(isStableish(coin({ sym: "USDT" }))).toBe(true);
  });

  it("catches non-USD pegs and tokenized commodities", () => {
    // These clear the |p30|>=2 test on a dollar slide or gold rally and would
    // otherwise pass the momentum lens as genuine movers.
    expect(isStableish(coin({ sym: "EURC" }))).toBe(true);
    expect(isStableish(coin({ sym: "PAXG" }))).toBe(true);
  });

  it("catches wrapped/staked/bridged by name", () => {
    expect(isStableish(coin({ sym: "WBTC", name: "Wrapped Bitcoin" }))).toBe(true);
    expect(isStableish(coin({ sym: "RETH", name: "Rocket Pool ETH (bridged)" }))).toBe(true);
  });

  it("catches anything effectively pegged by price action", () => {
    expect(isStableish(coin({ sym: "XYZ", name: "Some Coin", p30: 1, p7: 0.4 }))).toBe(true);
  });

  it("leaves a real mover alone", () => {
    expect(isStableish(coin())).toBe(false);
  });
});

describe("floatRatio", () => {
  it("computes mcap/FDV", () => {
    expect(floatRatio(coin({ mcap: 250, fdv: 1000 }))).toBe(0.25);
  });

  it("passes (1.0) when FDV is missing rather than silently excluding", () => {
    expect(floatRatio(coin({ fdv: null }))).toBe(1);
  });
});

describe("quantile / pctlOf", () => {
  const sorted = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

  it("picks the quantile value", () => {
    expect(quantile(sorted, 0)).toBe(0);
    expect(quantile(sorted, 1)).toBe(9);
    expect(quantile(sorted, 0.5)).toBe(4);
  });

  it("returns -Infinity for an empty array so gates never accidentally bind", () => {
    expect(quantile([], 0.5)).toBe(-Infinity);
  });

  it("computes percentile rank by binary search", () => {
    expect(pctlOf(sorted, -1)).toBe(0);
    expect(pctlOf(sorted, 9)).toBe(100);
    expect(pctlOf(sorted, 4)).toBe(50);
  });
});

describe("normalizeCoins", () => {
  it("keeps the CoinGecko id (symbols collide across the top 1000)", () => {
    const [c] = normalizeCoins([{ id: "real-id", symbol: "dup", name: "A" }]);
    expect(c.id).toBe("real-id");
    expect(c.sym).toBe("DUP");
  });

  it("assigns rank by market-cap order position", () => {
    const out = normalizeCoins([{ id: "a" }, { id: "b" }, { id: "c" }]);
    expect(out.map((c) => c.rank)).toEqual([1, 2, 3]);
  });

  it("leaves missing price changes null rather than coercing to 0", () => {
    const [c] = normalizeCoins([{ id: "new-listing" }]);
    expect(c.p24).toBeNull();
    expect(c.p30).toBeNull();
  });
});

describe("screenCoins", () => {
  /**
   * A universe padded with filler that actually SURVIVES isStableish, so the
   * quantile gates have a real population.
   *
   * This is subtle and was wrong on the first pass: filler at p7 0.2 / p30 0.5
   * trips the pegged-price rule (|p30| < 2 && |p7| < 1), so every filler coin
   * was silently dropped and each "universe" contained only the coin under
   * test — making every cross-sectional gate a comparison against itself.
   * p7 ~ 2 / p30 ~ 4 clears the pegged rule while staying below every gate.
   */
  function universe(extra: Coin[]): Coin[] {
    const filler = Array.from({ length: 60 }, (_, i) =>
      coin({
        id: `filler-${i}`,
        sym: `F${i}`,
        name: `Filler ${i}`,
        rank: 100 + i,
        p24: 0.5,
        p7: 2 + i * 0.01,
        p30: 4 + i * 0.01,
      }),
    );
    // BTC must also survive isStableish or the relative-strength gates compare
    // against a coin that is not in the universe.
    const btc = coin({ id: "bitcoin", sym: "BTC", name: "Bitcoin", rank: 1, p24: 0.2, p7: 1.5, p30: 3 });
    return [btc, ...extra, ...filler];
  }

  it("filler universe survives isStableish (guards the fixture itself)", () => {
    const uni = screenCoins(universe([])).universe;
    // 60 filler + BTC — if this drops to ~0 the cross-sectional tests below are
    // vacuous and need re-tuning.
    expect(uni.length).toBeGreaterThanOrEqual(60);
  });

  it("excludes a brand-new listing with null price changes", () => {
    const fresh = coin({ id: "fresh", sym: "FRESH", name: "Fresh", p24: null, p7: null, p30: null });
    const out = screenCoins(universe([fresh]));
    expect(out.candidates.find((c) => c.id === "fresh")).toBeUndefined();
  });

  it("rejects a mildly-positive coin that loses the cross-sectional 7d gate", () => {
    // Clears every ABSOLUTE gate on the momentum lens (p7 >= min7M = 3, p30 > 0,
    // beats BTC) but sits below the 70th percentile of a hot peer group, so it
    // must still be rejected. This is the regime-normalization the refactor
    // added, and nothing else in the suite exercises it.
    const hot = Array.from({ length: 60 }, (_, i) =>
      coin({ id: `hot-${i}`, sym: `H${i}`, name: `Hot ${i}`, rank: 200 + i, p24: 3, p7: 20 + i * 0.1, p30: 40 }),
    );
    const mild = coin({ id: "mild", sym: "MILD", name: "Mild", rank: 50, p24: 1, p7: 4, p30: 9 });
    const btc = coin({ id: "bitcoin", sym: "BTC", name: "Bitcoin", rank: 1, p24: 0.2, p7: 1.5, p30: 3 });
    const out = screenCoins([btc, mild, ...hot]);
    expect(out.candidates.find((c) => c.id === "mild")).toBeUndefined();
  });

  it("admits a breakout from a FLAT base (p30 slightly below p7)", () => {
    // Regression: requiring p30ex7 >= 0 is algebraically p30 >= p7, which
    // rejected the canonical fresh breakout — three flat weeks then +12%.
    // The breakout lens now allows a small negative base drift.
    const base = coin({
      id: "base", sym: "BASE", name: "Base Breakout", rank: 300,
      p24: 4, p7: 12, p30: 9, // p30ex7 ~ -2.7
    });
    const out = screenCoins(universe([base]));
    expect(out.candidates.find((c) => c.id === "base")).toBeDefined();
  });

  it("still rejects a V-bounce inside a downtrend", () => {
    // p30 -20 / p7 +25 => p30ex7 ~ -36, far past the -5 tolerance.
    const v = coin({ id: "vbounce", sym: "VB", name: "V Bounce", rank: 300, p24: 4, p7: 25, p30: -20 });
    const out = screenCoins(universe([v]));
    expect(out.candidates.find((c) => c.id === "vbounce")).toBeUndefined();
  });

  it("rejects a top-200 coin with no sparkline instead of skipping shape checks", () => {
    // A missing sparkline used to mean spikey() returned false, so the coin
    // passed the momentum lens with zero shape screening.
    const noSpark = coin({ id: "nospark", sym: "NOSP", name: "No Spark", rank: 50, p24: 4, p7: 16, p30: 30, spark: null });
    const out = screenCoins(universe([noSpark]));
    expect(out.candidates.find((c) => c.id === "nospark")).toBeUndefined();
  });

  it("excludes a low-float coin from BOTH lenses", () => {
    const lowFloat = coin({
      id: "lowfloat", sym: "LOW", name: "Low Float",
      mcap: 200_000_000, fdv: 1_000_000_000, // float 0.2
    });
    const out = screenCoins(universe([lowFloat]));
    expect(out.candidates.find((c) => c.id === "lowfloat")).toBeUndefined();
  });

  it("excludes a bounce inside a downtrend via p30ex7", () => {
    const bounce = coin({ id: "bounce", sym: "BNC", name: "Bounce", p24: 4, p7: 25, p30: -20 });
    const out = screenCoins(universe([bounce]));
    expect(out.candidates.find((c) => c.id === "bounce")).toBeUndefined();
  });

  it("excludes a late-stage parabola over max30", () => {
    const parabola = coin({ id: "para", sym: "PARA", name: "Parabola", p24: 4, p7: 40, p30: 300 });
    const out = screenCoins(universe([parabola]));
    expect(out.candidates.find((c) => c.id === "para")).toBeUndefined();
  });

  it("excludes a post-spike fader that the old anti-spike clause let through", () => {
    const fader = coin({
      id: "fader", sym: "FADE", name: "Fader",
      p24: -8, p7: 20, p30: 35,
      spark: { last24Share: 0.1, ddFromHigh: -0.18, risingFrac: 0.35 },
    });
    const out = screenCoins(universe([fader]));
    expect(out.candidates.find((c) => c.id === "fader")).toBeUndefined();
  });

  it("admits a clean sustained uptrend and tags it as passing BOTH lenses", () => {
    const good = coin({ id: "good", sym: "GOOD", name: "Good Coin", rank: 40, p24: 4, p7: 16, p30: 30 });
    const out = screenCoins(universe([good]));
    const hit = out.candidates.find((c) => c.id === "good");
    expect(hit).toBeDefined();
    // Assert the specific tag: `expect([...]).toContain(hit.tag)` over the full
    // union is tautological, since that union IS the declared type of `tag`.
    expect(hit!.tag).toBe("both");
    expect(hit!.emoji).toBe("⭐");
  });

  it("ranks dual-flagged coins above single-lens coins even when scoring lower", () => {
    // Regression: the old CONF_BONUS=8 only floated ⭐ coins up while scores
    // happened to cluster within 8 points. The tier sort is unconditional.
    //
    // `single` is rank 300, so it fails passM on the rank<=200 check alone
    // while clearing passG, and its far stronger returns give it the higher
    // score. Tier must still win — no `if` wrappers, so this cannot go vacuous.
    const dual = coin({ id: "dual", sym: "DUAL", name: "Dual Lens", rank: 30, p24: 3, p7: 10, p30: 14 });
    const single = coin({ id: "single", sym: "SNGL", name: "Single Lens", rank: 300, p24: 12, p7: 45, p30: 60 });
    const out = screenCoins(universe([dual, single]));

    const di = out.candidates.findIndex((c) => c.id === "dual");
    const si = out.candidates.findIndex((c) => c.id === "single");
    expect(di).toBeGreaterThanOrEqual(0);
    expect(si).toBeGreaterThanOrEqual(0);
    expect(out.candidates[di].both).toBe(true);
    expect(out.candidates[si].both).toBe(false);
    expect(out.candidates[si].score).toBeGreaterThan(out.candidates[di].score);
    expect(di).toBeLessThan(si);
  });

  it("caps the reported list at topN while keeping every candidate", () => {
    const many = Array.from({ length: 40 }, (_, i) =>
      coin({ id: `m${i}`, sym: `M${i}`, name: `Mover ${i}`, rank: 10 + i, p24: 3 + i * 0.1, p7: 12 + i * 0.2, p30: 25 }),
    );
    const out = screenCoins(universe(many));
    expect(out.ranked.length).toBe(SCREEN_CONFIG.topN);
    // The candidate set is what gets persisted for evaluation, so it must NOT
    // be truncated to the reported list.
    expect(out.candidates.length).toBeGreaterThan(SCREEN_CONFIG.topN);
  });

  it("dedupes coins that appear on two pages of the paginated pull", () => {
    const dupes = normalizeCoins([
      { id: "dup", symbol: "dup", name: "Dup" },
      { id: "other", symbol: "oth", name: "Other" },
      { id: "dup", symbol: "dup", name: "Dup" },
    ]);
    expect(dupes.map((c) => c.id)).toEqual(["dup", "other"]);
  });

  it("binds relative-strength to Bitcoin by id, not by a colliding symbol", () => {
    const impostor = coin({ id: "fake-btc", sym: "BTC", name: "Fake BTC", rank: 5, p24: 50, p7: 90, p30: 140 });
    const real = coin({ id: "bitcoin", sym: "BTC", name: "Bitcoin", rank: 1, p24: 0.2, p7: 1.5, p30: 3 });
    const out = screenCoins([impostor, real, ...universe([]).slice(1)]);
    expect(out.btc.p7).toBe(1.5);
    expect(out.btcMissing).toBe(false);
  });

  it("flags btcMissing when Bitcoin is absent from the pull", () => {
    const noBtc = universe([]).filter((c) => c.id !== "bitcoin");
    expect(screenCoins(noBtc).btcMissing).toBe(true);
  });
});
