import { describe, it, expect } from "vitest";
import {
  calculatePiotroskiFScore,
  fScoreToPoints,
  type PiotroskiInput,
  type PiotroskiResult,
} from "@/lib/scanner/piotroski";

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Create a mock PiotroskiInput with defaults that pass all signals.
 * Override specific fields to test individual signals.
 */
function createMockInput(overrides: Partial<PiotroskiInput> = {}): PiotroskiInput {
  return {
    // Current Year - all positive/strong values
    netIncome: 1000000000, // $1B profit
    totalAssets: 10000000000, // $10B assets → ROA = 10%
    operatingCashflow: 1500000000, // $1.5B cash flow > net income
    longTermDebt: 2000000000, // $2B debt → 20% debt ratio
    currentAssets: 5000000000, // $5B
    currentLiabilities: 2000000000, // $2B → current ratio = 2.5
    sharesOutstanding: 500000000,
    grossProfit: 4000000000, // $4B → 40% gross margin
    totalRevenue: 10000000000, // $10B revenue → asset turnover = 1.0x

    // Prior Year - slightly worse values (to show improvement)
    netIncomePrior: 800000000, // $800M → lower ROA
    totalAssetsPrior: 10000000000, // Same assets → lower ROA
    operatingCashflowPrior: 1200000000,
    longTermDebtPrior: 2500000000, // $2.5B → higher debt ratio
    currentAssetsPrior: 4500000000,
    currentLiabilitiesPrior: 2000000000, // Current ratio = 2.25
    sharesOutstandingPrior: 500000000, // No dilution
    grossProfitPrior: 3500000000, // 35% gross margin
    totalRevenuePrior: 9000000000, // $9B revenue → asset turnover = 0.9x (lower than current)

    ...overrides,
  };
}

/**
 * Create a weak stock that fails most signals.
 */
function createWeakInput(): PiotroskiInput {
  return {
    // Current Year - weak values
    netIncome: -500000000, // Loss
    totalAssets: 10000000000,
    operatingCashflow: -200000000, // Negative cash flow
    longTermDebt: 4000000000, // 40% debt ratio
    currentAssets: 2000000000,
    currentLiabilities: 3000000000, // Current ratio < 1
    sharesOutstanding: 600000000, // Dilution
    grossProfit: 2000000000, // 20% margin
    totalRevenue: 10000000000,

    // Prior Year - better values (showing decline)
    netIncomePrior: 500000000,
    totalAssetsPrior: 9000000000,
    operatingCashflowPrior: 800000000,
    longTermDebtPrior: 3000000000, // Lower debt
    currentAssetsPrior: 3000000000,
    currentLiabilitiesPrior: 2500000000, // Better current ratio
    sharesOutstandingPrior: 500000000, // Less shares
    grossProfitPrior: 2500000000, // 28% margin
    totalRevenuePrior: 9000000000,
  };
}

// ============================================================================
// calculatePiotroskiFScore Tests
// ============================================================================

describe("calculatePiotroskiFScore", () => {
  describe("Strong Stock (High F-Score)", () => {
    it("scores 9/9 for a stock passing all signals", () => {
      const input = createMockInput();
      const result = calculatePiotroskiFScore(input);

      expect(result.fScore).toBe(9);
      expect(result.category).toBe("Strong");
      expect(result.profitability).toBe(4);
      expect(result.leverage).toBe(3);
      expect(result.efficiency).toBe(2);
    });

    it("identifies all 9 signals correctly", () => {
      const input = createMockInput();
      const result = calculatePiotroskiFScore(input);

      // Check each signal
      const signalNames = result.signals.map((s) => s.name);
      expect(signalNames).toContain("Positive ROA");
      expect(signalNames).toContain("Positive Cash Flow");
      expect(signalNames).toContain("Improving ROA");
      expect(signalNames).toContain("Quality Earnings");
      expect(signalNames).toContain("Decreasing Leverage");
      expect(signalNames).toContain("Improving Liquidity");
      expect(signalNames).toContain("No Dilution");
      expect(signalNames).toContain("Improving Margin");
      expect(signalNames).toContain("Improving Turnover");

      // All should score 1
      expect(result.signals.every((s) => s.score === 1)).toBe(true);
    });
  });

  describe("Weak Stock (Low F-Score)", () => {
    it("scores low for a stock failing most signals", () => {
      const input = createWeakInput();
      const result = calculatePiotroskiFScore(input);

      expect(result.fScore).toBeLessThanOrEqual(2);
      expect(result.category).toBe("Weak");
    });

    it("identifies failing signals correctly", () => {
      const input = createWeakInput();
      const result = calculatePiotroskiFScore(input);

      // Find specific signals
      const roaSignal = result.signals.find((s) => s.name === "Positive ROA");
      const cfSignal = result.signals.find((s) => s.name === "Positive Cash Flow");
      const dilutionSignal = result.signals.find((s) => s.name === "No Dilution");

      expect(roaSignal?.score).toBe(0); // Negative ROA
      expect(cfSignal?.score).toBe(0); // Negative cash flow
      expect(dilutionSignal?.score).toBe(0); // Shares increased
    });
  });

  describe("Profitability Signals (4 points)", () => {
    it("Signal 1: ROA > 0 scores 1 for positive, 0 for negative", () => {
      // Positive ROA
      const positive = createMockInput({ netIncome: 100000000 });
      expect(
        calculatePiotroskiFScore(positive).signals.find((s) => s.name === "Positive ROA")
          ?.score
      ).toBe(1);

      // Negative ROA (loss)
      const negative = createMockInput({ netIncome: -100000000 });
      expect(
        calculatePiotroskiFScore(negative).signals.find((s) => s.name === "Positive ROA")
          ?.score
      ).toBe(0);
    });

    it("Signal 2: Operating Cash Flow > 0", () => {
      // Positive cash flow
      const positive = createMockInput({ operatingCashflow: 100000000 });
      expect(
        calculatePiotroskiFScore(positive).signals.find(
          (s) => s.name === "Positive Cash Flow"
        )?.score
      ).toBe(1);

      // Negative cash flow
      const negative = createMockInput({ operatingCashflow: -100000000 });
      expect(
        calculatePiotroskiFScore(negative).signals.find(
          (s) => s.name === "Positive Cash Flow"
        )?.score
      ).toBe(0);
    });

    it("Signal 3: ROA increasing YoY", () => {
      // ROA increasing (current 10%, prior 8%)
      const increasing = createMockInput({
        netIncome: 1000000000,
        totalAssets: 10000000000,
        netIncomePrior: 800000000,
        totalAssetsPrior: 10000000000,
      });
      expect(
        calculatePiotroskiFScore(increasing).signals.find((s) => s.name === "Improving ROA")
          ?.score
      ).toBe(1);

      // ROA decreasing
      const decreasing = createMockInput({
        netIncome: 800000000,
        totalAssets: 10000000000,
        netIncomePrior: 1000000000,
        totalAssetsPrior: 10000000000,
      });
      expect(
        calculatePiotroskiFScore(decreasing).signals.find((s) => s.name === "Improving ROA")
          ?.score
      ).toBe(0);
    });

    it("Signal 4: Cash Flow > Net Income (accruals quality)", () => {
      // Good accruals (cash flow > earnings)
      const good = createMockInput({
        operatingCashflow: 1500000000,
        netIncome: 1000000000,
      });
      expect(
        calculatePiotroskiFScore(good).signals.find((s) => s.name === "Quality Earnings")
          ?.score
      ).toBe(1);

      // Bad accruals (earnings > cash flow)
      const bad = createMockInput({
        operatingCashflow: 800000000,
        netIncome: 1000000000,
      });
      expect(
        calculatePiotroskiFScore(bad).signals.find((s) => s.name === "Quality Earnings")
          ?.score
      ).toBe(0);
    });
  });

  describe("Leverage/Liquidity Signals (3 points)", () => {
    it("Signal 5: Long-term debt ratio decreasing", () => {
      // Decreasing debt ratio
      const decreasing = createMockInput({
        longTermDebt: 1000000000,
        totalAssets: 10000000000, // 10%
        longTermDebtPrior: 2000000000,
        totalAssetsPrior: 10000000000, // 20%
      });
      expect(
        calculatePiotroskiFScore(decreasing).signals.find(
          (s) => s.name === "Decreasing Leverage"
        )?.score
      ).toBe(1);

      // Increasing debt ratio
      const increasing = createMockInput({
        longTermDebt: 3000000000,
        totalAssets: 10000000000,
        longTermDebtPrior: 2000000000,
        totalAssetsPrior: 10000000000,
      });
      expect(
        calculatePiotroskiFScore(increasing).signals.find(
          (s) => s.name === "Decreasing Leverage"
        )?.score
      ).toBe(0);
    });

    it("Signal 6: Current ratio increasing", () => {
      // Improving liquidity
      const improving = createMockInput({
        currentAssets: 3000000000,
        currentLiabilities: 1000000000, // CR = 3.0
        currentAssetsPrior: 2000000000,
        currentLiabilitiesPrior: 1000000000, // CR = 2.0
      });
      expect(
        calculatePiotroskiFScore(improving).signals.find(
          (s) => s.name === "Improving Liquidity"
        )?.score
      ).toBe(1);

      // Declining liquidity
      const declining = createMockInput({
        currentAssets: 2000000000,
        currentLiabilities: 1500000000, // CR = 1.33
        currentAssetsPrior: 2000000000,
        currentLiabilitiesPrior: 1000000000, // CR = 2.0
      });
      expect(
        calculatePiotroskiFScore(declining).signals.find(
          (s) => s.name === "Improving Liquidity"
        )?.score
      ).toBe(0);
    });

    it("Signal 7: No new shares issued", () => {
      // No dilution
      const noDilution = createMockInput({
        sharesOutstanding: 500000000,
        sharesOutstandingPrior: 500000000,
      });
      expect(
        calculatePiotroskiFScore(noDilution).signals.find((s) => s.name === "No Dilution")
          ?.score
      ).toBe(1);

      // Buyback (even better)
      const buyback = createMockInput({
        sharesOutstanding: 450000000,
        sharesOutstandingPrior: 500000000,
      });
      expect(
        calculatePiotroskiFScore(buyback).signals.find((s) => s.name === "No Dilution")
          ?.score
      ).toBe(1);

      // Dilution
      const dilution = createMockInput({
        sharesOutstanding: 600000000,
        sharesOutstandingPrior: 500000000,
      });
      expect(
        calculatePiotroskiFScore(dilution).signals.find((s) => s.name === "No Dilution")
          ?.score
      ).toBe(0);
    });
  });

  describe("Operating Efficiency Signals (2 points)", () => {
    it("Signal 8: Gross margin increasing", () => {
      // Improving margin
      const improving = createMockInput({
        grossProfit: 5000000000,
        totalRevenue: 10000000000, // 50%
        grossProfitPrior: 4000000000,
        totalRevenuePrior: 10000000000, // 40%
      });
      expect(
        calculatePiotroskiFScore(improving).signals.find(
          (s) => s.name === "Improving Margin"
        )?.score
      ).toBe(1);

      // Declining margin
      const declining = createMockInput({
        grossProfit: 3000000000,
        totalRevenue: 10000000000, // 30%
        grossProfitPrior: 4000000000,
        totalRevenuePrior: 10000000000, // 40%
      });
      expect(
        calculatePiotroskiFScore(declining).signals.find(
          (s) => s.name === "Improving Margin"
        )?.score
      ).toBe(0);
    });

    it("Signal 9: Asset turnover increasing", () => {
      // Improving turnover
      const improving = createMockInput({
        totalRevenue: 12000000000,
        totalAssets: 10000000000, // 1.2x
        totalRevenuePrior: 10000000000,
        totalAssetsPrior: 10000000000, // 1.0x
      });
      expect(
        calculatePiotroskiFScore(improving).signals.find(
          (s) => s.name === "Improving Turnover"
        )?.score
      ).toBe(1);

      // Declining turnover
      const declining = createMockInput({
        totalRevenue: 8000000000,
        totalAssets: 10000000000, // 0.8x
        totalRevenuePrior: 10000000000,
        totalAssetsPrior: 10000000000, // 1.0x
      });
      expect(
        calculatePiotroskiFScore(declining).signals.find(
          (s) => s.name === "Improving Turnover"
        )?.score
      ).toBe(0);
    });
  });

  describe("Category Classification", () => {
    it("classifies F-Score 7-9 as Strong", () => {
      const strong = createMockInput(); // Should score 9
      expect(calculatePiotroskiFScore(strong).category).toBe("Strong");
    });

    it("classifies F-Score 4-6 as Moderate", () => {
      // Create a stock that passes exactly 5 signals
      const moderate = createMockInput({
        // Fail 4 signals
        netIncome: -100000000, // Fail: ROA > 0
        operatingCashflow: 800000000, // Fail: OCF > Net Income (since NI is negative, this passes)
        longTermDebt: 3000000000,
        longTermDebtPrior: 2000000000, // Fail: debt ratio decreasing
        currentAssets: 2000000000,
        currentLiabilities: 2500000000,
        currentAssetsPrior: 2000000000,
        currentLiabilitiesPrior: 2000000000, // Fail: current ratio increasing
      });
      const result = calculatePiotroskiFScore(moderate);
      expect(result.fScore).toBeGreaterThanOrEqual(4);
      expect(result.fScore).toBeLessThanOrEqual(6);
      expect(result.category).toBe("Moderate");
    });

    it("classifies F-Score 0-3 as Weak", () => {
      const weak = createWeakInput();
      expect(calculatePiotroskiFScore(weak).category).toBe("Weak");
    });
  });

  describe("Missing Data Handling", () => {
    it("handles null values gracefully", () => {
      const withNulls: PiotroskiInput = {
        netIncome: null,
        totalAssets: null,
        operatingCashflow: null,
        longTermDebt: null,
        currentAssets: null,
        currentLiabilities: null,
        sharesOutstanding: null,
        grossProfit: null,
        totalRevenue: null,
        netIncomePrior: null,
        totalAssetsPrior: null,
        operatingCashflowPrior: null,
        longTermDebtPrior: null,
        currentAssetsPrior: null,
        currentLiabilitiesPrior: null,
        sharesOutstandingPrior: null,
        grossProfitPrior: null,
        totalRevenuePrior: null,
      };

      const result = calculatePiotroskiFScore(withNulls);
      expect(result.fScore).toBe(0);
      expect(result.category).toBe("Weak");
    });

    it("handles partial data", () => {
      const partial = createMockInput({
        netIncomePrior: null, // Can't calculate ROA trend
        grossProfitPrior: null, // Can't calculate margin trend
      });

      const result = calculatePiotroskiFScore(partial);
      // Should still calculate other signals
      expect(result.fScore).toBeGreaterThan(0);
    });
  });
});

// ============================================================================
// fScoreToPoints Tests
// ============================================================================

describe("fScoreToPoints", () => {
  it("maps F-Score 8-9 to max points", () => {
    expect(fScoreToPoints(8, 10)).toBe(10);
    expect(fScoreToPoints(9, 10)).toBe(10);
  });

  it("maps F-Score 6-7 to 75% of max points", () => {
    expect(fScoreToPoints(6, 10)).toBe(8); // 75% of 10 rounded
    expect(fScoreToPoints(7, 10)).toBe(8);
  });

  it("maps F-Score 4-5 to 50% of max points", () => {
    expect(fScoreToPoints(4, 10)).toBe(5);
    expect(fScoreToPoints(5, 10)).toBe(5);
  });

  it("maps F-Score 2-3 to 25% of max points", () => {
    expect(fScoreToPoints(2, 10)).toBe(3); // 25% of 10 rounded
    expect(fScoreToPoints(3, 10)).toBe(3);
  });

  it("maps F-Score 0-1 to 0 points", () => {
    expect(fScoreToPoints(0, 10)).toBe(0);
    expect(fScoreToPoints(1, 10)).toBe(0);
  });

  it("respects custom maxPoints", () => {
    expect(fScoreToPoints(9, 20)).toBe(20);
    expect(fScoreToPoints(6, 20)).toBe(15); // 75% of 20
    expect(fScoreToPoints(4, 20)).toBe(10); // 50% of 20
  });
});

// ============================================================================
// Real-World Stock Scenarios
// ============================================================================

describe("Real-World Stock Scenarios", () => {
  it("scores a typical strong value stock (Warren Buffett style)", () => {
    // Berkshire Hathaway-like metrics
    const berkshire: PiotroskiInput = {
      netIncome: 90000000000, // $90B
      totalAssets: 1000000000000, // $1T → ROA = 9%
      operatingCashflow: 40000000000, // $40B (insurance company, different model)
      longTermDebt: 130000000000, // $130B → 13% debt ratio
      currentAssets: 150000000000,
      currentLiabilities: 100000000000, // CR = 1.5
      sharesOutstanding: 1500000000,
      grossProfit: null, // Not typical for financials
      totalRevenue: 300000000000,

      netIncomePrior: 80000000000,
      totalAssetsPrior: 950000000000,
      operatingCashflowPrior: 35000000000,
      longTermDebtPrior: 125000000000,
      currentAssetsPrior: 140000000000,
      currentLiabilitiesPrior: 95000000000,
      sharesOutstandingPrior: 1550000000, // Buybacks
      grossProfitPrior: null,
      totalRevenuePrior: 280000000000,
    };

    const result = calculatePiotroskiFScore(berkshire);
    // Should score reasonably well
    expect(result.fScore).toBeGreaterThanOrEqual(5);
  });

  it("scores a typical tech growth stock", () => {
    // NVIDIA-like metrics
    const nvidia: PiotroskiInput = {
      netIncome: 30000000000, // $30B
      totalAssets: 65000000000, // $65B → ROA = 46%!
      operatingCashflow: 35000000000, // Strong cash generation
      longTermDebt: 10000000000, // Low debt
      currentAssets: 40000000000,
      currentLiabilities: 10000000000, // CR = 4
      sharesOutstanding: 2500000000,
      grossProfit: 50000000000, // 80% GM
      totalRevenue: 60000000000,

      netIncomePrior: 5000000000, // Massive growth
      totalAssetsPrior: 40000000000,
      operatingCashflowPrior: 6000000000,
      longTermDebtPrior: 11000000000,
      currentAssetsPrior: 25000000000,
      currentLiabilitiesPrior: 8000000000,
      sharesOutstandingPrior: 2500000000,
      grossProfitPrior: 15000000000,
      totalRevenuePrior: 27000000000,
    };

    const result = calculatePiotroskiFScore(nvidia);
    // Should score high - strong fundamentals
    expect(result.fScore).toBeGreaterThanOrEqual(7);
    expect(result.category).toBe("Strong");
  });

  it("scores a distressed company", () => {
    // Struggling retailer
    const distressed: PiotroskiInput = {
      netIncome: -2000000000, // $2B loss
      totalAssets: 15000000000,
      operatingCashflow: -500000000, // Cash burn
      longTermDebt: 8000000000, // High debt
      currentAssets: 3000000000,
      currentLiabilities: 5000000000, // CR < 1
      sharesOutstanding: 400000000,
      grossProfit: 2000000000, // 20% margin
      totalRevenue: 10000000000,

      netIncomePrior: -500000000,
      totalAssetsPrior: 18000000000, // Asset impairments
      operatingCashflowPrior: 500000000,
      longTermDebtPrior: 6000000000,
      currentAssetsPrior: 4000000000,
      currentLiabilitiesPrior: 4000000000,
      sharesOutstandingPrior: 300000000, // Dilution
      grossProfitPrior: 3000000000,
      totalRevenuePrior: 12000000000,
    };

    const result = calculatePiotroskiFScore(distressed);
    expect(result.fScore).toBeLessThanOrEqual(2);
    expect(result.category).toBe("Weak");
  });
});
