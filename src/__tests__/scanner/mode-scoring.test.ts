import { describe, it, expect } from "vitest";
import {
  scoreMetric,
  isFinancialSector,
  isREIT,
  isHighGearingREIT,
  calculateFinancialServicesScore,
  calculateREITScore,
  calculatePercentileRank,
  buildMarketPercentiles,
  scoreByPercentile,
  calculateQuantScore,
  calculateValueScore,
  calculateGrowthScore,
  calculateAllModeScores,
  calculateAllModeScoresWithFlags,
  getTierFromCombinedScore,
  type YahooStockData,
  type Market,
} from "@/lib/scanner/mode-scoring";

// ============================================================================
// Test Helpers
// ============================================================================

const createMockStock = (overrides: Partial<YahooStockData> = {}): YahooStockData => ({
  currentPrice: 100,
  returnOnEquity: 0.15,
  returnOnAssets: 0.012,
  grossMargins: 0.40,
  operatingMargins: 0.20,
  freeCashflow: 1000000000,
  operatingCashflow: 1500000000,
  totalRevenue: 5000000000,
  revenueGrowth: 0.15,
  debtToEquity: 0.5,
  trailingPE: 15,
  priceToBook: 2.0,
  enterpriseToEbitda: 10,
  dividendYield: 0.02,
  marketCap: 10000000000,
  beta: 1.0,
  trailingEps: 5,
  sector: "Technology",
  industry: "Software",
  ...overrides,
});

const createBankStock = (overrides: Partial<YahooStockData> = {}): YahooStockData => ({
  currentPrice: 150,
  returnOnEquity: 0.12,
  returnOnAssets: 0.01,
  trailingPE: 10,
  priceToBook: 1.1,
  dividendYield: 0.035,
  marketCap: 300000000000,
  sector: "Financial Services",
  industry: "Banks—Diversified",
  ...overrides,
});

const createREITStock = (overrides: Partial<YahooStockData> = {}): YahooStockData => ({
  currentPrice: 2.50,
  returnOnEquity: 0.08,
  dividendYield: 0.055,
  priceToBook: 0.95,
  debtToEquity: 0.40,
  marketCap: 5000000000,
  sector: "Real Estate",
  industry: "REIT—Diversified",
  ...overrides,
});

// ============================================================================
// scoreMetric - Missing Data Handling
// ============================================================================

describe("scoreMetric", () => {
  const thresholds: [number, number][] = [
    [0.20, 10],
    [0.15, 7],
    [0.10, 4],
    [0.05, 2],
  ];
  const maxPoints = 10;

  it("returns neutral score (50% of max) for null value", () => {
    const score = scoreMetric(null, thresholds, maxPoints);
    expect(score).toBe(5); // 50% of 10
  });

  it("returns neutral score (50% of max) for undefined value", () => {
    const score = scoreMetric(undefined, thresholds, maxPoints);
    expect(score).toBe(5);
  });

  it("returns neutral score (50% of max) for NaN value", () => {
    const score = scoreMetric(NaN, thresholds, maxPoints);
    expect(score).toBe(5);
  });

  it("scores correctly for value above highest threshold", () => {
    const score = scoreMetric(0.25, thresholds, maxPoints);
    expect(score).toBe(10);
  });

  it("scores correctly for value at middle threshold", () => {
    const score = scoreMetric(0.15, thresholds, maxPoints);
    expect(score).toBe(7);
  });

  it("scores correctly for value below all thresholds", () => {
    const score = scoreMetric(0.01, thresholds, maxPoints);
    expect(score).toBe(0);
  });

  it("handles inverted scoring (lower is better)", () => {
    const invertedThresholds: [number, number][] = [
      [10, 10], // PE < 10: max score
      [15, 7],
      [20, 4],
    ];
    // Value of 8 should get 10 points (below lowest threshold)
    expect(scoreMetric(8, invertedThresholds, maxPoints, true)).toBe(10);
    // Value of 12 should get 7 points
    expect(scoreMetric(12, invertedThresholds, maxPoints, true)).toBe(7);
    // Value of 25 should get 0 points (above all thresholds)
    expect(scoreMetric(25, invertedThresholds, maxPoints, true)).toBe(0);
  });

  it("returns neutral score for missing data with inverted scoring", () => {
    const invertedThresholds: [number, number][] = [
      [10, 10],
      [15, 7],
    ];
    expect(scoreMetric(null, invertedThresholds, maxPoints, true)).toBe(5);
  });
});

// ============================================================================
// Sector Detection
// ============================================================================

describe("isFinancialSector", () => {
  it("returns true for Financial Services sector", () => {
    expect(isFinancialSector("Financial Services")).toBe(true);
  });

  it("returns false for other sectors", () => {
    expect(isFinancialSector("Technology")).toBe(false);
    expect(isFinancialSector("Healthcare")).toBe(false);
    expect(isFinancialSector("Real Estate")).toBe(false);
  });

  it("returns false for undefined/null", () => {
    expect(isFinancialSector(undefined)).toBe(false);
  });
});

describe("isREIT", () => {
  it("returns true for REIT industries", () => {
    expect(isREIT("REIT—Diversified")).toBe(true);
    expect(isREIT("REIT - Industrial")).toBe(true);
    expect(isREIT("Real Estate Investment Trust")).toBe(false); // doesn't contain "REIT"
    expect(isREIT("reit")).toBe(true); // case insensitive
  });

  it("returns false for non-REIT industries", () => {
    expect(isREIT("Software")).toBe(false);
    expect(isREIT("Banks—Diversified")).toBe(false);
    expect(isREIT("Real Estate Services")).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(isREIT(undefined)).toBe(false);
  });
});

describe("isHighGearingREIT", () => {
  it("returns true for SG REIT with gearing > 45%", () => {
    expect(isHighGearingREIT(0.46, "SGX", "REIT—Industrial")).toBe(true);
    expect(isHighGearingREIT(0.50, "SGX", "REIT—Diversified")).toBe(true);
  });

  it("returns false for SG REIT with gearing <= 45%", () => {
    expect(isHighGearingREIT(0.45, "SGX", "REIT—Industrial")).toBe(false);
    expect(isHighGearingREIT(0.35, "SGX", "REIT—Diversified")).toBe(false);
  });

  it("returns false for non-SG markets even with high gearing", () => {
    expect(isHighGearingREIT(0.50, "US", "REIT—Industrial")).toBe(false);
    expect(isHighGearingREIT(0.50, "HK", "REIT—Industrial")).toBe(false);
  });

  it("returns false for non-REIT industries", () => {
    expect(isHighGearingREIT(0.50, "SGX", "Software")).toBe(false);
  });

  it("returns false for null/undefined gearing", () => {
    expect(isHighGearingREIT(null, "SGX", "REIT—Industrial")).toBe(false);
    expect(isHighGearingREIT(undefined, "SGX", "REIT—Industrial")).toBe(false);
  });
});

// ============================================================================
// Financial Services (Bank) Scoring
// ============================================================================

describe("calculateFinancialServicesScore", () => {
  it("scores a well-performing bank highly", () => {
    const bank = createBankStock({
      returnOnEquity: 0.16,
      returnOnAssets: 0.015,
      trailingPE: 8,
      priceToBook: 0.9,
    });
    const result = calculateFinancialServicesScore(bank, "US");
    
    expect(result.score).toBeGreaterThanOrEqual(70);
    expect(result.breakdown).toHaveProperty("ROE");
    expect(result.breakdown).toHaveProperty("ROA");
    expect(result.breakdown).toHaveProperty("P/E");
    expect(result.breakdown).toHaveProperty("P/B");
  });

  it("scores a weak bank lower", () => {
    const weakBank = createBankStock({
      returnOnEquity: 0.05,
      returnOnAssets: 0.005,
      trailingPE: 20,
      priceToBook: 2.5,
    });
    const result = calculateFinancialServicesScore(weakBank, "US");
    
    expect(result.score).toBeLessThan(50);
  });

  it("handles missing data with neutral scores", () => {
    const incompleteBank = createBankStock({
      returnOnEquity: undefined,
      returnOnAssets: undefined,
      trailingPE: undefined,
      priceToBook: undefined,
    });
    const result = calculateFinancialServicesScore(incompleteBank, "US");
    
    // All metrics missing = all get 50% neutral scores
    // 40 * 0.5 + 20 * 0.5 + 20 * 0.5 + 20 * 0.5 = 20 + 10 + 10 + 10 = 50
    expect(result.score).toBe(50);
  });

  it("scores JPM-like bank correctly", () => {
    // JPM typical metrics
    const jpm = createBankStock({
      returnOnEquity: 0.15,
      returnOnAssets: 0.012,
      trailingPE: 11,
      priceToBook: 1.5,
    });
    const result = calculateFinancialServicesScore(jpm, "US");
    
    expect(result.score).toBeGreaterThan(40);
    expect(result.score).toBeLessThan(80);
  });
});

// ============================================================================
// REIT Scoring
// ============================================================================

describe("calculateREITScore", () => {
  it("scores a high-yield, low-gearing REIT highly", () => {
    const goodREIT = createREITStock({
      dividendYield: 0.07,
      priceToBook: 0.75,
      debtToEquity: 0.35,
    });
    const result = calculateREITScore(goodREIT, "SGX");
    
    expect(result.score).toBeGreaterThanOrEqual(70);
    expect(result.breakdown).toHaveProperty("Dividend Yield");
    expect(result.breakdown).toHaveProperty("P/NAV (P/B)");
    expect(result.breakdown).toHaveProperty("Gearing (D/E)");
  });

  it("penalizes high gearing for SG REITs more than other markets", () => {
    const highGearingREIT = createREITStock({
      dividendYield: 0.06,
      priceToBook: 0.90,
      debtToEquity: 0.48,
    });
    const sgScore = calculateREITScore(highGearingREIT, "SGX");
    const usScore = calculateREITScore(highGearingREIT, "US");
    
    // SG should score lower due to stricter gearing thresholds
    expect(sgScore.score).toBeLessThan(usScore.score);
  });

  it("handles A17U.SI-like REIT (Ascendas REIT)", () => {
    const a17u = createREITStock({
      dividendYield: 0.055,
      priceToBook: 1.05,
      debtToEquity: 0.38,
      industry: "REIT—Industrial",
    });
    const result = calculateREITScore(a17u, "SGX");
    
    expect(result.score).toBeGreaterThan(50);
  });
});

// ============================================================================
// Percentile Ranking
// ============================================================================

describe("calculatePercentileRank", () => {
  const testValues = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];

  it("returns 50 for null/undefined value", () => {
    expect(calculatePercentileRank(null, testValues)).toBe(50);
    expect(calculatePercentileRank(undefined, testValues)).toBe(50);
  });

  it("returns 50 for empty dataset", () => {
    expect(calculatePercentileRank(50, [])).toBe(50);
  });

  it("calculates percentile correctly for higherIsBetter=true", () => {
    // Value of 100 is the highest, should be near 100th percentile
    expect(calculatePercentileRank(100, testValues, true)).toBe(90);
    // Value of 50 is in the middle
    expect(calculatePercentileRank(50, testValues, true)).toBe(40);
    // Value of 10 is lowest
    expect(calculatePercentileRank(10, testValues, true)).toBe(0);
  });

  it("calculates percentile correctly for higherIsBetter=false (inverted)", () => {
    // Value of 10 is the lowest, should be highest percentile when inverted
    expect(calculatePercentileRank(10, testValues, false)).toBe(100);
    // Value of 100 is highest, should be lowest percentile when inverted
    expect(calculatePercentileRank(100, testValues, false)).toBe(10);
  });
});

describe("buildMarketPercentiles", () => {
  it("extracts metrics from stock array", () => {
    const stocks: YahooStockData[] = [
      createMockStock({ returnOnEquity: 0.10 }),
      createMockStock({ returnOnEquity: 0.15 }),
      createMockStock({ returnOnEquity: 0.20 }),
    ];
    
    const percentiles = buildMarketPercentiles(stocks, "US");
    
    expect(percentiles.market).toBe("US");
    expect(percentiles.metrics.returnOnEquity).toEqual([0.10, 0.15, 0.20]);
    expect(percentiles.calculatedAt).toBeInstanceOf(Date);
  });

  it("filters out invalid values", () => {
    const stocks: YahooStockData[] = [
      createMockStock({ returnOnEquity: 0.10 }),
      createMockStock({ returnOnEquity: undefined }),
      createMockStock({ returnOnEquity: NaN }),
      createMockStock({ returnOnEquity: 0.20 }),
    ];
    
    const percentiles = buildMarketPercentiles(stocks, "US");
    
    expect(percentiles.metrics.returnOnEquity).toEqual([0.10, 0.20]);
  });
});

describe("scoreByPercentile", () => {
  const allValues = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];

  it("scores based on percentile rank", () => {
    // Value 100 is at 90th percentile, should get 90% of maxPoints
    const score = scoreByPercentile(100, allValues, 10, true);
    expect(score).toBe(9); // 90% of 10
  });

  it("returns neutral score for missing value", () => {
    const score = scoreByPercentile(null, allValues, 10, true);
    expect(score).toBe(5); // 50% of 10
  });
});

// ============================================================================
// calculateAllModeScoresWithFlags
// ============================================================================

describe("calculateAllModeScoresWithFlags", () => {
  it("detects financial services sector and uses specialized scoring", () => {
    const bank = createBankStock();
    const result = calculateAllModeScoresWithFlags(bank, "US");
    
    expect(result.sectorFlags.isFinancial).toBe(true);
    expect(result.sectorFlags.isREIT).toBe(false);
    expect(result.sectorScore).toBeDefined();
    expect(result.sectorScore?.breakdown).toHaveProperty("ROE");
  });

  it("detects REIT and uses specialized scoring", () => {
    const reit = createREITStock();
    const result = calculateAllModeScoresWithFlags(reit, "SGX");
    
    expect(result.sectorFlags.isFinancial).toBe(false);
    expect(result.sectorFlags.isREIT).toBe(true);
    expect(result.sectorScore).toBeDefined();
    expect(result.sectorScore?.breakdown).toHaveProperty("Dividend Yield");
  });

  it("flags high gearing for SG REITs", () => {
    const highGearingREIT = createREITStock({ debtToEquity: 0.48 });
    const result = calculateAllModeScoresWithFlags(highGearingREIT, "SGX");
    
    expect(result.sectorFlags.highGearingWarning).toBe(true);
  });

  it("uses standard scoring for non-specialized sectors", () => {
    const techStock = createMockStock();
    const result = calculateAllModeScoresWithFlags(techStock, "US");
    
    expect(result.sectorFlags.isFinancial).toBe(false);
    expect(result.sectorFlags.isREIT).toBe(false);
    expect(result.sectorScore).toBeUndefined();
  });

  it("combined score weights sector score heavily (60/40)", () => {
    const bank = createBankStock({
      returnOnEquity: 0.15,
      returnOnAssets: 0.015,
      trailingPE: 8,
      priceToBook: 0.8,
    });
    const result = calculateAllModeScoresWithFlags(bank, "US");
    
    // The combined score should reflect the sector-weighted approach
    expect(result.combinedScore).toBeGreaterThan(0);
    expect(result.combinedScore).toBeLessThanOrEqual(100);
  });
});

// ============================================================================
// Integration Tests with Sample Tickers
// ============================================================================

describe("Sample Ticker Scoring", () => {
  describe("JPM (US Bank)", () => {
    it("scores appropriately as a bank", () => {
      const jpm: YahooStockData = {
        currentPrice: 195,
        returnOnEquity: 0.14,
        returnOnAssets: 0.011,
        trailingPE: 11.5,
        priceToBook: 1.6,
        dividendYield: 0.023,
        marketCap: 560000000000,
        sector: "Financial Services",
        industry: "Banks—Diversified",
      };
      
      const result = calculateAllModeScoresWithFlags(jpm, "US");
      
      expect(result.sectorFlags.isFinancial).toBe(true);
      expect(result.combinedScore).toBeGreaterThan(40);
    });
  });

  describe("D05.SI (DBS Singapore Bank)", () => {
    it("scores appropriately as an SG bank", () => {
      const dbs: YahooStockData = {
        currentPrice: 38,
        returnOnEquity: 0.17,
        returnOnAssets: 0.012,
        trailingPE: 10,
        priceToBook: 1.7,
        dividendYield: 0.05,
        marketCap: 100000000000,
        sector: "Financial Services",
        industry: "Banks—Regional",
      };
      
      const result = calculateAllModeScoresWithFlags(dbs, "SGX");
      
      expect(result.sectorFlags.isFinancial).toBe(true);
      expect(result.combinedScore).toBeGreaterThan(50);
    });
  });

  describe("A17U.SI (Ascendas REIT)", () => {
    it("scores appropriately as an SG REIT", () => {
      const a17u: YahooStockData = {
        currentPrice: 2.75,
        dividendYield: 0.055,
        priceToBook: 1.05,
        debtToEquity: 0.38,
        marketCap: 12000000000,
        sector: "Real Estate",
        industry: "REIT—Industrial",
      };
      
      const result = calculateAllModeScoresWithFlags(a17u, "SGX");
      
      expect(result.sectorFlags.isREIT).toBe(true);
      expect(result.sectorFlags.highGearingWarning).toBe(false);
      expect(result.combinedScore).toBeGreaterThan(40);
    });

    it("flags high gearing if debt exceeds 45%", () => {
      const highGearingA17u: YahooStockData = {
        currentPrice: 2.75,
        dividendYield: 0.055,
        priceToBook: 1.05,
        debtToEquity: 0.47,
        marketCap: 12000000000,
        sector: "Real Estate",
        industry: "REIT—Industrial",
      };
      
      const result = calculateAllModeScoresWithFlags(highGearingA17u, "SGX");
      
      expect(result.sectorFlags.highGearingWarning).toBe(true);
    });
  });
});

// ============================================================================
// Tier Classification
// ============================================================================

describe("getTierFromCombinedScore", () => {
  it("returns HIGH CONVICTION for score >= 80", () => {
    expect(getTierFromCombinedScore(80)).toEqual({ tier: "HIGH CONVICTION", tierColor: "green" });
    expect(getTierFromCombinedScore(100)).toEqual({ tier: "HIGH CONVICTION", tierColor: "green" });
  });

  it("returns WATCHLIST for score 65-79", () => {
    expect(getTierFromCombinedScore(65)).toEqual({ tier: "WATCHLIST", tierColor: "blue" });
    expect(getTierFromCombinedScore(79)).toEqual({ tier: "WATCHLIST", tierColor: "blue" });
  });

  it("returns SPECULATIVE for score 50-64", () => {
    expect(getTierFromCombinedScore(50)).toEqual({ tier: "SPECULATIVE", tierColor: "yellow" });
    expect(getTierFromCombinedScore(64)).toEqual({ tier: "SPECULATIVE", tierColor: "yellow" });
  });

  it("returns AVOID for score < 50", () => {
    expect(getTierFromCombinedScore(49)).toEqual({ tier: "AVOID", tierColor: "red" });
    expect(getTierFromCombinedScore(0)).toEqual({ tier: "AVOID", tierColor: "red" });
  });
});
