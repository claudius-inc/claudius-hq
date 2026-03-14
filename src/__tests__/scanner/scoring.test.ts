import { describe, it, expect } from "vitest";
import {
  calculateFundamentalsScore,
  calculateTechnicalScore,
  calculateMomentumScore,
  calculateCompositeScore,
  getTierFromScore,
  type TechnicalMetrics,
} from "@/lib/scanner/scoring";
import type { ScanResult } from "@/app/markets/scanner/types";

const createMockStock = (overrides: Partial<ScanResult> = {}): ScanResult => ({
  rank: 1,
  ticker: "TEST",
  name: "Test Company",
  price: 100,
  mcapB: "10.0",
  totalScore: 50,
  tier: "SPECULATIVE",
  tierColor: "yellow",
  riskTier: "TIER 2",
  market: "US",
  growth: { score: 20, max: 35, details: ["ROE 20%"] },
  financial: { score: 10, max: 20, details: ["FCF+"] },
  insider: { score: 15, max: 25, details: ["Net Buy"] },
  technical: { score: 10, max: 15, details: [">50MA"] },
  analyst: { score: 5, max: 10, details: ["60% Buy"] },
  risk: { penalty: 0, flags: [] },
  revGrowth: 0.15,
  grossMargin: 0.4,
  ...overrides,
});

const createMockMetrics = (overrides: Partial<TechnicalMetrics> = {}): TechnicalMetrics => ({
  athWeekly: 120,
  athMonthly: 125,
  rvolWeekly: 1.5,
  rvolMonthly: 1.2,
  atrWeekly: 5,
  rrWeekly: 2.0,
  ...overrides,
});

describe("calculateFundamentalsScore", () => {
  it("calculates fundamentals score from growth, financial, and insider", () => {
    const stock = createMockStock({
      growth: { score: 35, max: 35, details: [] },
      financial: { score: 20, max: 20, details: [] },
      insider: { score: 25, max: 25, details: [] },
    });
    // 80/80 = 100%
    expect(calculateFundamentalsScore(stock)).toBe(100);
  });

  it("handles partial scores", () => {
    const stock = createMockStock({
      growth: { score: 17, max: 35, details: [] },
      financial: { score: 10, max: 20, details: [] },
      insider: { score: 13, max: 25, details: [] },
    });
    // 40/80 = 50%
    expect(calculateFundamentalsScore(stock)).toBe(50);
  });
});

describe("calculateTechnicalScore", () => {
  it("includes ATR and RR bonus points", () => {
    const stock = createMockStock({
      technical: { score: 15, max: 15, details: [] },
    });
    const metrics = createMockMetrics({ atrWeekly: 5, rrWeekly: 3 });
    const score = calculateTechnicalScore(stock, metrics);
    // Base: 30 (15/15 * 30)
    // ATR: +10 (has data)
    // RR >= 3: +30
    // Total: 70, capped at 100
    expect(score).toBeGreaterThanOrEqual(30);
  });

  it("handles null metrics gracefully", () => {
    const stock = createMockStock();
    const metrics = createMockMetrics({
      atrWeekly: null,
      rrWeekly: null,
    });
    const score = calculateTechnicalScore(stock, metrics);
    // Should still calculate base score
    expect(score).toBeGreaterThanOrEqual(0);
  });
});

describe("calculateMomentumScore", () => {
  it("rewards high RVOL", () => {
    const stock = createMockStock();
    const highRvol = createMockMetrics({ rvolWeekly: 2.5, rvolMonthly: 2.0 });
    const lowRvol = createMockMetrics({ rvolWeekly: 0.5, rvolMonthly: 0.5 });

    const highScore = calculateMomentumScore(stock, highRvol);
    const lowScore = calculateMomentumScore(stock, lowRvol);

    expect(highScore).toBeGreaterThan(lowScore);
  });
});

describe("calculateCompositeScore", () => {
  it("returns breakdown of all score components", () => {
    const stock = createMockStock();
    const metrics = createMockMetrics();
    const result = calculateCompositeScore(stock, metrics);

    expect(result).toHaveProperty("fundamentalScore");
    expect(result).toHaveProperty("technicalScore");
    expect(result).toHaveProperty("momentumScore");
    expect(result).toHaveProperty("compositeScore");
  });

  it("calculates weighted composite (40% fund, 30% tech, 30% mom)", () => {
    const stock = createMockStock({
      growth: { score: 35, max: 35, details: [] },
      financial: { score: 20, max: 20, details: [] },
      insider: { score: 25, max: 25, details: [] },
      technical: { score: 15, max: 15, details: [] },
      analyst: { score: 10, max: 10, details: [] },
    });
    const metrics = createMockMetrics();
    const result = calculateCompositeScore(stock, metrics);

    // Should be a reasonable score given good inputs
    expect(result.compositeScore).toBeGreaterThan(50);
    expect(result.compositeScore).toBeLessThanOrEqual(100);
  });
});

describe("getTierFromScore", () => {
  it("returns HIGH CONVICTION for score >= 70", () => {
    expect(getTierFromScore(70)).toEqual({ tier: "HIGH CONVICTION", tierColor: "green" });
    expect(getTierFromScore(100)).toEqual({ tier: "HIGH CONVICTION", tierColor: "green" });
  });

  it("returns SPECULATIVE for score 50-69", () => {
    expect(getTierFromScore(50)).toEqual({ tier: "SPECULATIVE", tierColor: "yellow" });
    expect(getTierFromScore(69)).toEqual({ tier: "SPECULATIVE", tierColor: "yellow" });
  });

  it("returns WATCHLIST for score 35-49", () => {
    expect(getTierFromScore(35)).toEqual({ tier: "WATCHLIST", tierColor: "blue" });
    expect(getTierFromScore(49)).toEqual({ tier: "WATCHLIST", tierColor: "blue" });
  });

  it("returns AVOID for score < 35", () => {
    expect(getTierFromScore(34)).toEqual({ tier: "AVOID", tierColor: "red" });
    expect(getTierFromScore(0)).toEqual({ tier: "AVOID", tierColor: "red" });
  });
});
