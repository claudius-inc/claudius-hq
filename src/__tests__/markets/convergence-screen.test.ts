import { describe, it, expect } from "vitest";
import { scoreSymbol, CONVERGENCE_CONFIG } from "@/lib/markets/convergence-screen";
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
