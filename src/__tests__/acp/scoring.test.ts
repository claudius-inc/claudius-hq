import { describe, it, expect } from "vitest";
import {
  normalizeScore,
  percentileRank,
  calculateStockMomentumScore,
  calculateStockFundamentalsScore,
  calculateStockTechnicalsScore,
  calculateStockCompositeScore,
  calculateAltMomentumScore,
  calculateAltVolumeScore,
  calculateAltMarketRankScore,
  calculateAltCompositeScore,
  calculateSMA,
  calculateRSI,
  calculateMACDSignal,
  calculatePriceChange,
  getSMACrossoverSignal,
  type StockMetrics,
  type AltcoinMetrics,
} from "@/app/api/acp/_lib/scoring";

// ─── Utility Function Tests ──────────────────────────────────────────────────

describe("normalizeScore", () => {
  it("returns 0 when value equals min", () => {
    expect(normalizeScore(0, 0, 100)).toBe(0);
  });

  it("returns 10 when value equals max", () => {
    expect(normalizeScore(100, 0, 100)).toBe(10);
  });

  it("returns 5 for midpoint value", () => {
    expect(normalizeScore(50, 0, 100)).toBe(5);
  });

  it("clamps values outside range", () => {
    expect(normalizeScore(-50, 0, 100)).toBe(0);
    expect(normalizeScore(150, 0, 100)).toBe(10);
  });

  it("handles equal min and max", () => {
    expect(normalizeScore(50, 50, 50)).toBe(5);
  });
});

describe("percentileRank", () => {
  it("returns 0.5 for empty array", () => {
    expect(percentileRank(50, [])).toBe(0.5);
  });

  it("returns correct percentile for simple array", () => {
    const values = [10, 20, 30, 40, 50];
    expect(percentileRank(30, values)).toBe(0.4); // 2 values below / 5 total
    expect(percentileRank(50, values)).toBe(0.8); // 4 values below / 5 total
    expect(percentileRank(10, values)).toBe(0);   // 0 values below / 5 total
  });
});

describe("calculateSMA", () => {
  it("returns null for insufficient data", () => {
    expect(calculateSMA([1, 2], 5)).toBeNull();
  });

  it("calculates correct SMA", () => {
    const prices = [10, 20, 30, 40, 50];
    expect(calculateSMA(prices, 3)).toBe(40); // (30 + 40 + 50) / 3
    expect(calculateSMA(prices, 5)).toBe(30); // (10 + 20 + 30 + 40 + 50) / 5
  });
});

describe("calculateRSI", () => {
  it("returns null for insufficient data", () => {
    expect(calculateRSI([100, 101, 102], 14)).toBeNull();
  });

  it("returns 100 when only gains", () => {
    // Create increasing prices
    const prices = Array.from({ length: 20 }, (_, i) => 100 + i);
    const rsi = calculateRSI(prices, 14);
    expect(rsi).toBe(100);
  });

  it("returns value between 0-100 for mixed changes", () => {
    const prices = [
      100, 102, 101, 103, 102, 105, 104, 106, 105, 107,
      106, 108, 107, 109, 108, 110
    ];
    const rsi = calculateRSI(prices, 14);
    expect(rsi).toBeGreaterThan(0);
    expect(rsi).toBeLessThan(100);
  });
});

describe("calculateMACDSignal", () => {
  it("returns neutral for insufficient data", () => {
    expect(calculateMACDSignal([100, 101, 102])).toBe("neutral");
  });

  it("returns bullish for uptrend", () => {
    const prices = Array.from({ length: 30 }, (_, i) => 100 + i * 2);
    const signal = calculateMACDSignal(prices);
    expect(["bullish", "neutral"]).toContain(signal);
  });
});

describe("calculatePriceChange", () => {
  it("returns null for insufficient data", () => {
    expect(calculatePriceChange(100, [90, 95], 10)).toBeNull();
  });

  it("calculates correct price change percentage", () => {
    const historical = [50, 60, 70, 80, 90, 100];
    const change = calculatePriceChange(100, historical, 3);
    // Old price was 80, new is 100 → 25% increase
    expect(change).toBe(25);
  });
});

describe("getSMACrossoverSignal", () => {
  it("returns neutral when either SMA is null", () => {
    expect(getSMACrossoverSignal(null, 100)).toBe("neutral");
    expect(getSMACrossoverSignal(100, null)).toBe("neutral");
  });

  it("returns golden_cross when SMA50 > SMA200", () => {
    expect(getSMACrossoverSignal(110, 100)).toBe("golden_cross");
  });

  it("returns death_cross when SMA50 < SMA200", () => {
    expect(getSMACrossoverSignal(90, 100)).toBe("death_cross");
  });

  it("returns neutral when SMAs are equal", () => {
    expect(getSMACrossoverSignal(100, 100)).toBe("neutral");
  });
});

// ─── Stock Scoring Tests ─────────────────────────────────────────────────────

const createMockStockMetrics = (overrides: Partial<StockMetrics> = {}): StockMetrics => ({
  lastPrice: 100,
  marketCap: 10_000_000_000,
  priceChange1m: 5,
  priceChange3m: 15,
  priceChange6m: 30,
  relativeStrength: 1.2,
  peRatio: 25,
  pbRatio: 3,
  roe: 20,
  revenueGrowthYoY: 15,
  profitMargin: 10,
  sma50: 95,
  sma200: 85,
  rsi14: 60,
  macdSignal: "bullish",
  ...overrides,
});

const createMockUniverse = () => ({
  priceChanges1m: [-10, -5, 0, 5, 10, 15, 20],
  priceChanges3m: [-20, -10, 0, 10, 20, 30, 40],
  priceChanges6m: [-30, -15, 0, 15, 30, 45, 60],
  relativeStrengths: [0.5, 0.8, 1.0, 1.2, 1.5, 1.8, 2.0],
  peRatios: [10, 15, 20, 25, 30, 40, 50],
  roes: [-5, 0, 5, 10, 15, 20, 30],
  revenueGrowths: [-10, 0, 5, 10, 15, 25, 40],
  profitMargins: [-5, 0, 5, 10, 15, 20, 30],
});

describe("calculateStockMomentumScore", () => {
  it("returns score between 0-10", () => {
    const metrics = createMockStockMetrics();
    const universe = createMockUniverse();
    const score = calculateStockMomentumScore(metrics, universe);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(10);
  });

  it("returns higher score for better momentum", () => {
    const universe = createMockUniverse();
    const highMomentum = createMockStockMetrics({
      priceChange1m: 20,
      priceChange3m: 40,
      priceChange6m: 60,
      relativeStrength: 2.0,
    });
    const lowMomentum = createMockStockMetrics({
      priceChange1m: -10,
      priceChange3m: -20,
      priceChange6m: -30,
      relativeStrength: 0.5,
    });

    const highScore = calculateStockMomentumScore(highMomentum, universe);
    const lowScore = calculateStockMomentumScore(lowMomentum, universe);
    expect(highScore).toBeGreaterThan(lowScore);
  });

  it("returns neutral score when all metrics are null", () => {
    const metrics = createMockStockMetrics({
      priceChange1m: null,
      priceChange3m: null,
      priceChange6m: null,
      relativeStrength: null,
    });
    const universe = createMockUniverse();
    const score = calculateStockMomentumScore(metrics, universe);
    expect(score).toBe(5);
  });
});

describe("calculateStockFundamentalsScore", () => {
  it("returns score between 0-10", () => {
    const metrics = createMockStockMetrics();
    const universe = createMockUniverse();
    const score = calculateStockFundamentalsScore(metrics, universe);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(10);
  });

  it("penalizes high P/E (inverted)", () => {
    const universe = createMockUniverse();
    const lowPE = createMockStockMetrics({ peRatio: 10 });
    const highPE = createMockStockMetrics({ peRatio: 50 });

    const lowPEScore = calculateStockFundamentalsScore(lowPE, universe);
    const highPEScore = calculateStockFundamentalsScore(highPE, universe);
    expect(lowPEScore).toBeGreaterThan(highPEScore);
  });
});

describe("calculateStockTechnicalsScore", () => {
  it("returns score between 0-10", () => {
    const metrics = createMockStockMetrics();
    const score = calculateStockTechnicalsScore(metrics);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(10);
  });

  it("rewards golden cross and bullish MACD", () => {
    const bullish = createMockStockMetrics({
      sma50: 110,
      sma200: 100,
      rsi14: 60,
      macdSignal: "bullish",
    });
    const bearish = createMockStockMetrics({
      sma50: 90,
      sma200: 100,
      rsi14: 25,
      macdSignal: "bearish",
    });

    const bullishScore = calculateStockTechnicalsScore(bullish);
    const bearishScore = calculateStockTechnicalsScore(bearish);
    expect(bullishScore).toBeGreaterThan(bearishScore);
  });
});

describe("calculateStockCompositeScore", () => {
  it("applies correct weights (35% + 35% + 30% = 100%)", () => {
    const scores = { momentum: 10, fundamentals: 10, technicals: 10 };
    const composite = calculateStockCompositeScore(scores);
    expect(composite).toBe(10); // All max scores = max composite
  });

  it("calculates weighted average correctly", () => {
    const scores = { momentum: 10, fundamentals: 0, technicals: 5 };
    // 10*0.35 + 0*0.35 + 5*0.30 = 3.5 + 0 + 1.5 = 5
    const composite = calculateStockCompositeScore(scores);
    expect(composite).toBe(5);
  });
});

// ─── Altcoin Scoring Tests ───────────────────────────────────────────────────

const createMockAltMetrics = (overrides: Partial<AltcoinMetrics> = {}): AltcoinMetrics => ({
  priceChange24h: 5,
  priceChange7d: 15,
  priceChange30d: 30,
  athChange: -20,
  volume24h: 100_000_000,
  marketCap: 1_000_000_000,
  marketCapRank: 50,
  volumeChange24h: 25,
  fullyDilutedValuation: 1_200_000_000,
  ...overrides,
});

describe("calculateAltMomentumScore", () => {
  it("returns score between 0-10", () => {
    const metrics = createMockAltMetrics();
    const score = calculateAltMomentumScore(metrics);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(10);
  });

  it("rewards strong price momentum", () => {
    const bullish = createMockAltMetrics({
      priceChange24h: 50,
      priceChange7d: 100,
      priceChange30d: 200,
      athChange: -10,
    });
    const bearish = createMockAltMetrics({
      priceChange24h: -20,
      priceChange7d: -30,
      priceChange30d: -50,
      athChange: -90,
    });

    const bullishScore = calculateAltMomentumScore(bullish);
    const bearishScore = calculateAltMomentumScore(bearish);
    expect(bullishScore).toBeGreaterThan(bearishScore);
  });
});

describe("calculateAltVolumeScore", () => {
  it("returns score between 0-10", () => {
    const metrics = createMockAltMetrics();
    const score = calculateAltVolumeScore(metrics);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(10);
  });

  it("rewards healthy volume/market cap ratio", () => {
    const healthy = createMockAltMetrics({
      volume24h: 100_000_000,
      marketCap: 1_000_000_000, // 10% ratio
      volumeChange24h: 50,
    });
    const low = createMockAltMetrics({
      volume24h: 1_000_000,
      marketCap: 1_000_000_000, // 0.1% ratio
      volumeChange24h: -50,
    });

    const healthyScore = calculateAltVolumeScore(healthy);
    const lowScore = calculateAltVolumeScore(low);
    expect(healthyScore).toBeGreaterThan(lowScore);
  });
});

describe("calculateAltMarketRankScore", () => {
  it("returns 10 for top 10 coins", () => {
    expect(calculateAltMarketRankScore(1)).toBe(10);
    expect(calculateAltMarketRankScore(10)).toBe(10);
  });

  it("returns decreasing scores for lower ranks", () => {
    expect(calculateAltMarketRankScore(50)).toBe(9);
    expect(calculateAltMarketRankScore(100)).toBe(8);
    expect(calculateAltMarketRankScore(200)).toBe(7);
    expect(calculateAltMarketRankScore(500)).toBe(5);
    expect(calculateAltMarketRankScore(1000)).toBe(3);
    expect(calculateAltMarketRankScore(2000)).toBe(1);
  });
});

describe("calculateAltCompositeScore", () => {
  it("applies correct weights (50% + 25% + 25% = 100%)", () => {
    const scores = { momentum: 10, volume: 10, marketRank: 10 };
    const composite = calculateAltCompositeScore(scores);
    expect(composite).toBe(10);
  });

  it("weights momentum highest", () => {
    const momOnly = { momentum: 10, volume: 0, marketRank: 0 };
    const volOnly = { momentum: 0, volume: 10, marketRank: 0 };
    const rankOnly = { momentum: 0, volume: 0, marketRank: 10 };

    const momScore = calculateAltCompositeScore(momOnly);
    const volScore = calculateAltCompositeScore(volOnly);
    const rankScore = calculateAltCompositeScore(rankOnly);

    expect(momScore).toBe(5);   // 10 * 0.50
    expect(volScore).toBe(2.5); // 10 * 0.25
    expect(rankScore).toBe(2.5); // 10 * 0.25
  });
});
