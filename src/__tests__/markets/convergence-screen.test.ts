import { describe, it, expect } from "vitest";
import {
  scoreSymbol,
  rankPicks,
  allocateByCategory,
  assignLiquidityPercentiles,
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
