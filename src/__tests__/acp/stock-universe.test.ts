import { describe, it, expect } from "vitest";
import {
  US_TICKERS,
  HK_TICKERS,
  JP_TICKERS,
  getTickersForMarket,
  formatHKTicker,
  getBenchmarkIndex,
  getMarketCapTier,
  getCurrency,
  MARKET_SUFFIXES,
} from "@/app/api/acp/_lib/stock-universe";

describe("Ticker Lists", () => {
  it("US_TICKERS contains S&P 100 constituents", () => {
    expect(US_TICKERS.length).toBeGreaterThanOrEqual(100);
    expect(US_TICKERS).toContain("AAPL");
    expect(US_TICKERS).toContain("MSFT");
    expect(US_TICKERS).toContain("NVDA");
    expect(US_TICKERS).toContain("GOOGL");
  });

  it("HK_TICKERS are formatted with .HK suffix", () => {
    expect(HK_TICKERS.length).toBeGreaterThan(50);
    expect(HK_TICKERS.every(t => t.endsWith(".HK"))).toBe(true);
    expect(HK_TICKERS).toContain("9988.HK");
    expect(HK_TICKERS).toContain("0700.HK");
  });

  it("JP_TICKERS are formatted with .T suffix", () => {
    expect(JP_TICKERS.length).toBeGreaterThanOrEqual(50);
    expect(JP_TICKERS.every(t => t.endsWith(".T"))).toBe(true);
    expect(JP_TICKERS).toContain("7203.T"); // Toyota
  });
});

describe("getTickersForMarket", () => {
  it("returns US tickers for US market", () => {
    const tickers = getTickersForMarket("US");
    expect(tickers).toBe(US_TICKERS);
    expect(tickers).toContain("AAPL");
  });

  it("returns HK tickers for HK market", () => {
    const tickers = getTickersForMarket("HK");
    expect(tickers).toBe(HK_TICKERS);
    expect(tickers.every(t => t.endsWith(".HK"))).toBe(true);
  });

  it("returns JP tickers for JP market", () => {
    const tickers = getTickersForMarket("JP");
    expect(tickers).toBe(JP_TICKERS);
    expect(tickers.every(t => t.endsWith(".T"))).toBe(true);
  });

  it("throws for unknown market", () => {
    expect(() => getTickersForMarket("XX" as "US")).toThrow("Unknown market");
  });
});

describe("formatHKTicker", () => {
  it("pads single digit numbers", () => {
    expect(formatHKTicker(1)).toBe("0001.HK");
  });

  it("pads two digit numbers", () => {
    expect(formatHKTicker(27)).toBe("0027.HK");
  });

  it("pads three digit numbers", () => {
    expect(formatHKTicker(700)).toBe("0700.HK");
  });

  it("handles four digit numbers", () => {
    expect(formatHKTicker(9988)).toBe("9988.HK");
  });

  it("handles string input", () => {
    expect(formatHKTicker("5")).toBe("0005.HK");
    expect(formatHKTicker("700")).toBe("0700.HK");
  });
});

describe("getBenchmarkIndex", () => {
  it("returns S&P 500 for US", () => {
    expect(getBenchmarkIndex("US")).toBe("^GSPC");
  });

  it("returns HSI for HK", () => {
    expect(getBenchmarkIndex("HK")).toBe("^HSI");
  });

  it("returns Nikkei 225 for JP", () => {
    expect(getBenchmarkIndex("JP")).toBe("^N225");
  });
});

describe("getMarketCapTier", () => {
  it("returns mega for $200B+", () => {
    expect(getMarketCapTier(200_000_000_001)).toBe("mega");
    expect(getMarketCapTier(3_000_000_000_000)).toBe("mega");
  });

  it("returns large for $10B-$200B", () => {
    expect(getMarketCapTier(10_000_000_001)).toBe("large");
    expect(getMarketCapTier(199_999_999_999)).toBe("large");
  });

  it("returns mid for $2B-$10B", () => {
    expect(getMarketCapTier(2_000_000_001)).toBe("mid");
    expect(getMarketCapTier(9_999_999_999)).toBe("mid");
  });

  it("returns small for < $2B", () => {
    expect(getMarketCapTier(1_999_999_999)).toBe("small");
    expect(getMarketCapTier(500_000_000)).toBe("small");
  });
});

describe("getCurrency", () => {
  it("returns USD for US market", () => {
    expect(getCurrency("US")).toBe("USD");
  });

  it("returns HKD for HK market", () => {
    expect(getCurrency("HK")).toBe("HKD");
  });

  it("returns JPY for JP market", () => {
    expect(getCurrency("JP")).toBe("JPY");
  });
});

describe("MARKET_SUFFIXES", () => {
  it("has no suffix for US", () => {
    expect(MARKET_SUFFIXES.US).toBe("");
  });

  it("has .HK suffix for HK", () => {
    expect(MARKET_SUFFIXES.HK).toBe(".HK");
  });

  it("has .T suffix for JP", () => {
    expect(MARKET_SUFFIXES.JP).toBe(".T");
  });
});
