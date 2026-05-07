import { describe, it, expect } from "vitest";
import {
  normalizeMarketCode,
  normalizeTickerForMarket,
  detectMarketFromYahoo,
} from "@/lib/scanner/ticker-normalize";

describe("normalizeMarketCode", () => {
  it("maps LSE/LON/UK/LONDON to LSE", () => {
    expect(normalizeMarketCode("LSE")).toBe("LSE");
    expect(normalizeMarketCode("LON")).toBe("LSE");
    expect(normalizeMarketCode("UK")).toBe("LSE");
    expect(normalizeMarketCode("LONDON")).toBe("LSE");
  });

  it("is case- and whitespace-insensitive for LSE inputs", () => {
    expect(normalizeMarketCode("  london  ")).toBe("LSE");
    expect(normalizeMarketCode("lse")).toBe("LSE");
  });

  it("maps HKEX to HK (sanity)", () => {
    expect(normalizeMarketCode("HKEX")).toBe("HK");
  });
});

describe("normalizeTickerForMarket", () => {
  it("appends .L for LSE tickers", () => {
    expect(normalizeTickerForMarket("RIO", "LSE")).toBe("RIO.L");
  });

  it("appends .L for LON market alias", () => {
    expect(normalizeTickerForMarket("BARC", "LON")).toBe("BARC.L");
  });

  it("passes through already-suffixed LSE tickers", () => {
    expect(normalizeTickerForMarket("RIO.L", "LSE")).toBe("RIO.L");
  });

  it("normalizes HK tickers with 4-digit padding (sanity)", () => {
    expect(normalizeTickerForMarket("0700", "HK")).toBe("0700.HK");
  });
});

describe("detectMarketFromYahoo", () => {
  it("detects LSE from .L symbol suffix", () => {
    expect(detectMarketFromYahoo({ symbol: "RIO.L" })).toBe("LSE");
  });

  it("detects LSE from exchange code", () => {
    expect(detectMarketFromYahoo({ exchange: "LSE" })).toBe("LSE");
  });

  it("detects LSE from fullExchangeName", () => {
    expect(detectMarketFromYahoo({ fullExchangeName: "London Stock Exchange" })).toBe(
      "LSE",
    );
  });

  it("detects HK from .HK symbol suffix (sanity)", () => {
    expect(detectMarketFromYahoo({ symbol: "0700.HK" })).toBe("HK");
  });

  it("returns null when no hints are present", () => {
    expect(detectMarketFromYahoo({})).toBeNull();
  });
});
