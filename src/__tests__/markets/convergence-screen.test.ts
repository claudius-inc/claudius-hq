import { describe, it, expect } from "vitest";
import {
  scoreSymbol,
  rankPicks,
  allocateByCategory,
  splitBudget,
  assignLiquidityPercentiles,
  assignComboScores,
  CONVERGENCE_CONFIG,
  type ConvergencePick,
} from "@/lib/markets/convergence-screen";
import { MCD_WARMUP } from "@/lib/markets/mcd";
import type { PerpBar, PerpSymbol } from "@/lib/markets/perp-venues";

const SYM: PerpSymbol = {
  venue: "binance",
  symbol: "TESTUSDT",
  base: "TEST",
  quote: "USDT",
  category: "crypto",
};

/** Deterministic bars with a controllable trend and traded value. */
function bars(n: number, opts: { drift?: number; quoteVol?: number } = {}): PerpBar[] {
  const { drift = 0.05, quoteVol = 1_000_000 } = opts;
  let s = 7;
  const rand = () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
  const out: PerpBar[] = [];
  let price = 100;
  for (let i = 0; i < n; i++) {
    const open = price;
    const close = Math.max(1, price + drift + (rand() - 0.5));
    out.push({
      t: i * 4 * 3600 * 1000,
      tClose: (i + 1) * 4 * 3600 * 1000 - 1,
      o: open,
      h: Math.max(open, close) + rand() * 0.3,
      l: Math.min(open, close) - rand() * 0.3,
      c: close,
      v: 1000,
      q: quoteVol,
    });
    price = close;
  }
  return out;
}

describe("scoreSymbol", () => {
  it("returns null when history is shorter than the MCD warmup", () => {
    expect(scoreSymbol(SYM, bars(MCD_WARMUP - 1))).toBeNull();
  });

  it("scores both directions once there is enough history", () => {
    const r = scoreSymbol(SYM, bars(MCD_WARMUP + 60));
    expect(r).not.toBeNull();
    expect(r!.long.side).toBe("long");
    expect(r!.short.side).toBe("short");
    expect(r!.long.score).toBeGreaterThanOrEqual(0);
    expect(r!.long.score).toBeLessThanOrEqual(5);
  });

  it("reports each side's opposing score, so a contested name is detectable", () => {
    const r = scoreSymbol(SYM, bars(MCD_WARMUP + 60))!;
    expect(r.long.opposingScore).toBe(r.short.score);
    expect(r.short.opposingScore).toBe(r.long.score);
  });

  it("averages traded value in QUOTE terms, not base units", () => {
    // Base volume is identical here; only quote volume differs. A screen that
    // filtered on `v` would rate these two names equally tradable.
    const rich = scoreSymbol(SYM, bars(MCD_WARMUP + 60, { quoteVol: 5_000_000 }))!;
    const thin = scoreSymbol(SYM, bars(MCD_WARMUP + 60, { quoteVol: 1_000 }))!;
    expect(rich.avgQuoteVol).toBeCloseTo(5_000_000, 6);
    expect(thin.avgQuoteVol).toBeCloseTo(1_000, 6);
    expect(thin.avgQuoteVol).toBeLessThan(CONVERGENCE_CONFIG.minAvgQuoteVol);
    expect(rich.avgQuoteVol).toBeGreaterThan(CONVERGENCE_CONFIG.minAvgQuoteVol);
  });

  it("anchors price to the last scored bar's close", () => {
    const b = bars(MCD_WARMUP + 60);
    const r = scoreSymbol(SYM, b)!;
    expect(r.long.price).toBe(b[b.length - 1].c);
    expect(r.short.price).toBe(b[b.length - 1].c);
  });

  it("measures the trailing change over the configured window", () => {
    const b = bars(MCD_WARMUP + 60);
    const r = scoreSymbol(SYM, b)!;
    const first = b[b.length - CONVERGENCE_CONFIG.liquidityBars].c;
    const expected = (100 * (b[b.length - 1].c - first)) / first;
    expect(r.long.changePct).toBeCloseTo(expected, 9);
  });
});

/** Minimal pick, only the fields the ranking logic reads. */
function pick(over: Partial<ConvergencePick> & { base: string }): ConvergencePick {
  return {
    venue: "binance",
    symbol: `${over.base}USDT`,
    category: "crypto",
    side: "long",
    score: 3,
    maxScore: 5,
    factors: { trend: true, pullback: false, support: true, proximity: false, vsa: true },
    opposingScore: 1,
    price: 100,
    rsi: 55,
    changePct: 1,
    avgQuoteVol: 1_000_000,
    liquidityPctl: 0,
    freshFlag: false,
    contested: false,
    // Explicit nulls, not omissions. `rankPicks` decides whether to use the
    // composite path with `comboScore !== null`, and an omitted field is
    // `undefined`, which passes that check and silently routes every test
    // through the composite branch.
    rvol: null,
    volSurge: null,
    rangeExpansion: null,
    rev6: null,
    fundingAbs: null,
    comboScore: null,
    comboGated: false,
    ...over,
  } as ConvergencePick;
}

describe("assignLiquidityPercentiles", () => {
  it("ranks each name against its OWN category, not the whole field", () => {
    // The equity is the thinnest name overall but the top of its own category;
    // ranking on raw volume is what handed the report to the tradfi book.
    const picks = [
      pick({ base: "BTC", category: "crypto", avgQuoteVol: 100_000_000 }),
      pick({ base: "ETH", category: "crypto", avgQuoteVol: 50_000_000 }),
      pick({ base: "DOGE", category: "crypto", avgQuoteVol: 1_000_000 }),
      pick({ base: "AAPL", category: "equity", avgQuoteVol: 5_000_000 }),
      pick({ base: "META", category: "equity", avgQuoteVol: 2_000_000 }),
    ];
    assignLiquidityPercentiles(picks);

    const by = Object.fromEntries(picks.map((p) => [p.base, p.liquidityPctl]));
    expect(by.BTC).toBe(100);
    expect(by.DOGE).toBe(0);
    expect(by.AAPL).toBe(100); // top of equities despite being 4th overall
    expect(by.META).toBe(0);
  });

  it("puts a lone category member at the top of its own group", () => {
    const picks = [pick({ base: "GOLD", category: "commodity", avgQuoteVol: 1 })];
    assignLiquidityPercentiles(picks);
    expect(picks[0].liquidityPctl).toBe(100);
  });
});

describe("rankPicks", () => {
  it("sorts by score first, then within-category liquidity percentile", () => {
    const picks = [
      pick({ base: "LOW", score: 3, liquidityPctl: 90 }),
      pick({ base: "HIGH", score: 4, liquidityPctl: 10 }),
      pick({ base: "MID", score: 3, liquidityPctl: 95 }),
    ];
    expect(rankPicks(picks).map((p) => p.base)).toEqual(["HIGH", "MID", "LOW"]);
  });

  it("ignores freshFlag — it is a 1-in-6 sampling artifact, not evidence", () => {
    const picks = [
      pick({ base: "STALE", score: 3, liquidityPctl: 99, freshFlag: false }),
      pick({ base: "FRESH", score: 3, liquidityPctl: 10, freshFlag: true }),
    ];
    expect(rankPicks(picks)[0].base).toBe("STALE");
  });

  it("is deterministic when score and liquidity are identical", () => {
    const picks = [pick({ base: "ZZZ" }), pick({ base: "AAA" })];
    expect(rankPicks(picks).map((p) => p.base)).toEqual(["AAA", "ZZZ"]);
  });

  // The composite is the live ranking key; the score-first ordering above is
  // the documented fallback for when funding and volume are unavailable.
  it("ranks by composite score once one exists, ahead of the score", () => {
    const picks = [
      pick({ base: "STRONGSCORE", score: 5, comboScore: -0.9, comboGated: true }),
      pick({ base: "STRONGCOMBO", score: 3, comboScore: 0.9, comboGated: true }),
    ];
    expect(rankPicks(picks)[0].base).toBe("STRONGCOMBO");
  });

  it("puts every gated name above every ungated one", () => {
    const picks = [
      pick({ base: "UNGATED", score: 5, comboScore: 0.99, comboGated: false }),
      pick({ base: "GATED", score: 3, comboScore: -0.99, comboGated: true }),
    ];
    expect(rankPicks(picks).map((p) => p.base)).toEqual(["GATED", "UNGATED"]);
  });

  it("stays deterministic when both picks lack a composite score", () => {
    // Regression: the comparator subtracted two -Infinity sentinels, and
    // `-Infinity - -Infinity` is NaN. `NaN !== 0` is true, so it returned NaN
    // and handed `sort` undefined behaviour for any such pair.
    const picks = [
      pick({ base: "ZZZ", comboScore: null, comboGated: true }),
      pick({ base: "AAA", comboScore: null, comboGated: true }),
      pick({ base: "MMM", comboScore: 0.5, comboGated: true }),
    ];
    expect(rankPicks(picks).map((p) => p.base)).toEqual(["MMM", "AAA", "ZZZ"]);
  });
});

describe("assignComboScores", () => {
  it("gates on volume and funding, then orders by reversal within each side", () => {
    // rev6 is the NEGATED return, so a higher rev6 means the name fell harder.
    const picks = [
      pick({ base: "BUSYFALL", rvol: 5, rev6: 8, side: "long" }),
      pick({ base: "BUSYRISE", rvol: 4, rev6: -8, side: "long" }),
      pick({ base: "QUIET1", rvol: 0.2, rev6: 9, side: "long" }),
      pick({ base: "QUIET2", rvol: 0.1, rev6: 7, side: "long" }),
    ];
    const funding = new Map([
      ["BUSYFALLUSDT", 0.01],
      ["BUSYRISEUSDT", 0.008],
      ["QUIET1USDT", 0.00001],
      ["QUIET2USDT", 0.00002],
    ]);
    assignComboScores(picks, funding);

    const by = Object.fromEntries(picks.map((p) => [p.base, p]));
    expect(by.BUSYFALL.fundingAbs).toBeCloseTo(0.01, 9);
    // The two busy, funding-stressed names clear the 30% gate; the quiet ones
    // do not, however hard they fell.
    expect(by.BUSYFALL.comboGated).toBe(true);
    expect(by.QUIET1.comboGated).toBe(false);
    // Within the long side, the bigger faller ranks higher.
    expect(by.BUSYFALL.comboScore).toBeGreaterThan(by.BUSYRISE.comboScore as number);
  });

  it("flips the reversal sign for shorts", () => {
    // For a short, the best candidate is the name that ROSE hardest, which is
    // the most NEGATIVE rev6.
    const picks = [
      pick({ base: "ROSE", side: "short", rvol: 2, rev6: -9 }),
      pick({ base: "FLAT", side: "short", rvol: 2, rev6: 0 }),
      pick({ base: "FELL", side: "short", rvol: 2, rev6: 9 }),
    ];
    assignComboScores(picks, new Map());
    const by = Object.fromEntries(picks.map((p) => [p.base, p]));
    expect(by.ROSE.comboScore).toBeGreaterThan(by.FELL.comboScore as number);
  });

  it("averages all four magnitude legs into the gate", () => {
    // A name that is unremarkable on relative volume but extreme on the other
    // three must still clear the gate — otherwise the extra legs the k=5 set
    // added are decorative.
    const picks = [
      pick({ base: "SURGE", rvol: 1, volSurge: 9, rangeExpansion: 9, rev6: 1 }),
      pick({ base: "LOUDBAR", rvol: 9, volSurge: 1, rangeExpansion: 1, rev6: 2 }),
      pick({ base: "DEAD1", rvol: 0.5, volSurge: 0.5, rangeExpansion: 0.5, rev6: 3 }),
      pick({ base: "DEAD2", rvol: 0.4, volSurge: 0.4, rangeExpansion: 0.4, rev6: 4 }),
      pick({ base: "DEAD3", rvol: 0.3, volSurge: 0.3, rangeExpansion: 0.3, rev6: 5 }),
    ];
    const funding = new Map([
      ["SURGEUSDT", 0.02],
      ["LOUDBARUSDT", 0.0001],
      ["DEAD1USDT", 0.00001],
      ["DEAD2USDT", 0.00001],
      ["DEAD3USDT", 0.00001],
    ]);
    assignComboScores(picks, funding);
    const by = Object.fromEntries(picks.map((p) => [p.base, p]));
    expect(by.SURGE.comboGated).toBe(true);
    expect(by.DEAD3.comboGated).toBe(false);
  });

  it("degrades to the available legs when some are unavailable", () => {
    const picks = [
      pick({ base: "BUSY", rvol: 9, rev6: 1 }),
      pick({ base: "MID", rvol: 5, rev6: 2 }),
      pick({ base: "QUIET", rvol: 0.1, rev6: 3 }),
    ];
    assignComboScores(picks, new Map());
    const by = Object.fromEntries(picks.map((p) => [p.base, p]));
    expect(by.BUSY.comboGated).toBe(true);
    expect(by.QUIET.comboGated).toBe(false);
    expect(by.BUSY.fundingAbs).toBeNull();
  });
});

describe("allocateByCategory", () => {
  it("keeps a dominant category from taking every slot", () => {
    // 16 equities and 4 crypto: a pure score sort gives equities all 8 seats.
    const ranked = [
      ...Array.from({ length: 16 }, (_, i) =>
        pick({ base: `EQ${i}`, category: "equity", liquidityPctl: 100 - i }),
      ),
      ...Array.from({ length: 4 }, (_, i) =>
        pick({ base: `CR${i}`, category: "crypto", liquidityPctl: 100 - i }),
      ),
    ];
    const out = allocateByCategory(ranked, 8);

    expect(out).toHaveLength(8);
    const equities = out.filter((p) => p.category === "equity").length;
    const crypto = out.filter((p) => p.category === "crypto").length;
    expect(crypto).toBeGreaterThanOrEqual(1);
    // 16/20 of qualifiers are equities, so ~6 of 8 seats, not 8 of 8.
    expect(equities).toBeLessThan(8);
    expect(equities + crypto).toBe(8);
  });

  it("returns everything when supply is at or below the cut", () => {
    const ranked = [pick({ base: "A" }), pick({ base: "B" })];
    expect(allocateByCategory(ranked, 8)).toHaveLength(2);
  });

  it("fills the cut exactly even when rounding undershoots", () => {
    const ranked = Array.from({ length: 30 }, (_, i) =>
      pick({ base: `X${i}`, category: i % 3 === 0 ? "equity" : "crypto" }),
    );
    expect(allocateByCategory(ranked, 8)).toHaveLength(8);
  });
});

describe("splitBudget", () => {
  it("leans toward the side with more gated action", () => {
    // 12 gated shorts vs 4 gated longs, ample supply — short-heavy, still summing.
    const s = splitBudget(4, 12, 50, 50, 16, 3, 11);
    expect(s.longSlots + s.shortSlots).toBe(16);
    expect(s.shortSlots).toBeGreaterThan(s.longSlots);
    expect(s.shortSlots).toBeLessThanOrEqual(11);
    expect(s.longSlots).toBeGreaterThanOrEqual(3);
  });

  it("caps the dominant side and fills the rest from the other", () => {
    // Short wants everything but is capped at 11; the other 5 go to long, so the
    // full 16-slot budget is still used rather than sending only 11 names.
    const s = splitBudget(0, 100, 50, 50, 16, 3, 11);
    expect(s.shortSlots).toBe(11);
    expect(s.longSlots).toBe(5);
    expect(s.longSlots + s.shortSlots).toBe(16);
  });

  it("restores an even split when min is half the budget", () => {
    const s = splitBudget(2, 30, 50, 50, 16, 8, 8);
    expect(s).toEqual({ longSlots: 8, shortSlots: 8 });
  });

  it("respects thin supply on one side", () => {
    // Longs win the weight but only 2 long qualifiers exist.
    const s = splitBudget(20, 5, 2, 50, 16, 3, 11);
    expect(s.longSlots).toBe(2);
    expect(s.shortSlots).toBeLessThanOrEqual(11);
  });

  it("falls back to even when neither side has gated names", () => {
    const s = splitBudget(0, 0, 50, 50, 16, 3, 11);
    expect(s.longSlots).toBe(8);
    expect(s.shortSlots).toBe(8);
  });
});
