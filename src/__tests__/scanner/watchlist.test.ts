import { describe, it, expect } from "vitest";
import { scoreMomentum, scoreTechnical, type ScoringInputs } from "@/lib/scanner/watchlist";

const baseInputs: ScoringInputs = {
  price: 100,
  return12mEx1m: 0,
  fiftyTwoWeekHigh: 100,
  fiftyTwoWeekLow: 50,
  closesAbove20SmaPct60d: 0.5,
  sma200: 90,
  sma50: 95,
  sma20: 98,
  rsi14: 50,
  macdLine: 1,
  macdSignal: 0.5,
  avgVol20d: 1_000_000,
  avgVol60d: 1_000_000,
  adx14: 20,
};

describe("scoreMomentum", () => {
  it("scores 100 when every factor is at its top tier", () => {
    const s = scoreMomentum({
      ...baseInputs,
      return12mEx1m: 0.40,           // ≥30% → 40
      price: 100,
      fiftyTwoWeekHigh: 100,
      fiftyTwoWeekLow: 50,           // position = 1.0 → 25
      closesAbove20SmaPct60d: 1.0,   // → 20
      sma200: 50,                    // (100-50)/50 = 1.0, capped at 0.5 → 15
    });
    expect(s).toBe(100);
  });

  it("scores 0 when 12-1M return is the worst tier and price is at the 52w low", () => {
    const s = scoreMomentum({
      ...baseInputs,
      return12mEx1m: -0.20,          // < -10% → 0
      price: 50,
      fiftyTwoWeekHigh: 100,
      fiftyTwoWeekLow: 50,           // position = 0 → 0
      closesAbove20SmaPct60d: 0,     // → 0
      sma200: 100,                   // (50-100)/100 = -0.5 → 0
    });
    expect(s).toBe(0);
  });

  it("contributes 0 for missing factors and marks score < 100 (no renorm)", () => {
    const s = scoreMomentum({
      ...baseInputs,
      return12mEx1m: null,
      price: 100,
      fiftyTwoWeekHigh: 100,
      fiftyTwoWeekLow: 50,           // 25 from 52w-position
      closesAbove20SmaPct60d: null,
      sma200: null,
    });
    expect(s).toBe(25);
  });

  it("uses tiered mapping for 12-1M return", () => {
    expect(
      scoreMomentum({ ...baseInputs, return12mEx1m: 0.16 })
    ).toBeGreaterThanOrEqual(28);
    expect(
      scoreMomentum({ ...baseInputs, return12mEx1m: 0.05 })
    ).toBeGreaterThanOrEqual(16);
  });
});

describe("scoreTechnical", () => {
  it("scores 100 when every factor is at its top tier", () => {
    const s = scoreTechnical({
      ...baseInputs,
      price: 100,
      sma20: 98,
      sma50: 95,
      sma200: 90,                    // full stack → 30
      rsi14: 60,                     // 50–70 → 25
      macdLine: 1,
      macdSignal: 0.5,               // > signal & > 0 → 20
      avgVol20d: 1_400_000,
      avgVol60d: 1_000_000,          // +40% → 15
      adx14: 45,                     // ≥40 → 10
    });
    expect(s).toBe(100);
  });

  it("penalizes overbought RSI", () => {
    const high = scoreTechnical({ ...baseInputs, rsi14: 60 });
    const overbought = scoreTechnical({ ...baseInputs, rsi14: 85 });
    expect(overbought).toBeLessThan(high);
  });

  it("MA stack: 0 points when fully inverted", () => {
    const s = scoreTechnical({
      ...baseInputs,
      price: 80,
      sma20: 90,
      sma50: 95,
      sma200: 100,
    });
    // MA stack contributes 0; other factors at neutral baseInputs values
    // (RSI 50 → 25, MACD 1>0.5>0 → 20, vol equal → 6, ADX 20 → 3)
    expect(s).toBe(0 + 25 + 20 + 6 + 3);
  });

  it("contributes 0 for missing factors", () => {
    const s = scoreTechnical({
      ...baseInputs,
      sma20: null,
      sma50: null,
      sma200: null,
      rsi14: null,
      macdLine: null,
      macdSignal: null,
      avgVol20d: null,
      avgVol60d: null,
      adx14: null,
    });
    expect(s).toBe(0);
  });
});
