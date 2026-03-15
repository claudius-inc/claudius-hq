/**
 * Expected Returns Calculation Engine
 * 
 * Maps current valuations to historical expected 10-year real returns.
 * Based on Shiller CAPE research and historical backtests.
 */

import type {
  ReturnLookupTable,
  ExpectedReturn,
  ValuationMetric,
  ConfidenceLevel,
  TacticalSignal,
  MomentumSignal,
} from "./types";

// ---------------------------------------------------------------------------
// S&P 500 PE Ratio → Expected 10Y Real Return
// Based on historical CAPE data (Shiller)
// ---------------------------------------------------------------------------
export const SP500_PE_LOOKUP: ReturnLookupTable = [
  { min: 0, max: 10, expectedReturn: 11, confidence: "high" },
  { min: 10, max: 15, expectedReturn: 9, confidence: "high" },
  { min: 15, max: 20, expectedReturn: 6, confidence: "medium" },
  { min: 20, max: 25, expectedReturn: 3, confidence: "medium" },
  { min: 25, max: 30, expectedReturn: 1, confidence: "medium" },
  { min: 30, max: 35, expectedReturn: 0, confidence: "low" },
  { min: 35, max: 100, expectedReturn: -1, confidence: "low" },
];

// Historical PE percentiles for S&P 500
const SP500_PE_PERCENTILES = {
  p10: 11,
  p25: 14,
  p50: 17,
  p75: 22,
  p90: 28,
};

// ---------------------------------------------------------------------------
// M2/Gold Ratio → Expected 10Y Return
// M2 money supply (billions) / Gold price ($/oz)
// Higher = gold cheap (more money per oz). Lower = gold expensive.
// Historical range: ~2 (1980 peak, expensive) to ~18 (2000 bottom, cheap)
// ---------------------------------------------------------------------------
export const GOLD_M2_LOOKUP: ReturnLookupTable = [
  { min: 0, max: 3, expectedReturn: -2, confidence: "low" },
  { min: 3, max: 6, expectedReturn: 0, confidence: "medium" },
  { min: 6, max: 10, expectedReturn: 3, confidence: "medium" },
  { min: 10, max: 15, expectedReturn: 6, confidence: "medium" },
  { min: 15, max: 100, expectedReturn: 8, confidence: "medium" },
];

// Historical M2/Gold percentiles (1970-2026)
const GOLD_M2_PERCENTILES = {
  p10: 3,
  p25: 6,
  p50: 9,
  p75: 13,
  p90: 17,
};

// ---------------------------------------------------------------------------
// BTC Halving Cycle → Expected Return
// Simple model based on 4-year halving cycle
// Year 1: Post-halving accumulation
// Year 2: Mid-cycle (current - March 2026)
// Year 3-4: Peak and correction
// ---------------------------------------------------------------------------
export const BTC_CYCLE_LOOKUP: ReturnLookupTable = [
  { min: 0, max: 1.5, expectedReturn: 15, confidence: "low" },  // Year 1
  { min: 1.5, max: 2.5, expectedReturn: 10, confidence: "low" }, // Year 2
  { min: 2.5, max: 3.5, expectedReturn: 5, confidence: "low" },  // Year 3
  { min: 3.5, max: 4, expectedReturn: 0, confidence: "low" },    // Year 4
];

// ---------------------------------------------------------------------------
// Bond Yield → Expected Return
// Simple: yield ≈ expected return for high-quality bonds
// ---------------------------------------------------------------------------
export const BOND_YIELD_LOOKUP: ReturnLookupTable = [
  { min: 0, max: 2, expectedReturn: 1.5, confidence: "high" },
  { min: 2, max: 3, expectedReturn: 2.5, confidence: "high" },
  { min: 3, max: 4, expectedReturn: 3.5, confidence: "high" },
  { min: 4, max: 5, expectedReturn: 4.5, confidence: "high" },
  { min: 5, max: 6, expectedReturn: 5.5, confidence: "high" },
  { min: 6, max: 100, expectedReturn: 6.5, confidence: "high" },
];

// ---------------------------------------------------------------------------
// Calculation Functions
// ---------------------------------------------------------------------------

export function lookupExpectedReturn(
  value: number,
  table: ReturnLookupTable
): ExpectedReturn {
  const entry = table.find((e) => value >= e.min && value < e.max);
  if (!entry) {
    // Default to last entry if out of range
    const last = table[table.length - 1];
    return { tenYear: last.expectedReturn, confidence: last.confidence };
  }
  return { tenYear: entry.expectedReturn, confidence: entry.confidence };
}

export function calculatePercentile(
  value: number,
  percentiles: { p10: number; p25: number; p50: number; p75: number; p90: number }
): number {
  if (value <= percentiles.p10) return 10;
  if (value <= percentiles.p25) return 25;
  if (value <= percentiles.p50) return 50;
  if (value <= percentiles.p75) return 75;
  if (value <= percentiles.p90) return 90;
  return 95;
}

export function determineValuationZone(
  percentile: number
): "cheap" | "fair" | "expensive" {
  if (percentile <= 25) return "cheap";
  if (percentile <= 75) return "fair";
  return "expensive";
}

export function determineTacticalSignal(
  price: number,
  sma200: number
): TacticalSignal {
  const ratio = price / sma200;
  if (ratio < 0.98) return "below";
  if (ratio > 1.02) return "above";
  return "at";
}

export function determineMomentum(
  vs200dma: TacticalSignal,
  changePercent?: number
): MomentumSignal {
  // Simple momentum based on 200 DMA position
  if (vs200dma === "below") return "bearish";
  if (vs200dma === "above") return "bullish";
  return "neutral";
}

// ---------------------------------------------------------------------------
// Asset-Specific Calculations
// ---------------------------------------------------------------------------

export function calculateSpyValuation(pe: number): {
  valuation: ValuationMetric;
  expectedReturn: ExpectedReturn;
} {
  const percentile = calculatePercentile(pe, SP500_PE_PERCENTILES);
  const zone = determineValuationZone(percentile);
  const expectedReturn = lookupExpectedReturn(pe, SP500_PE_LOOKUP);

  return {
    valuation: {
      metric: "PE",
      value: Math.round(pe * 10) / 10,
      percentile,
      zone,
    },
    expectedReturn,
  };
}

export function calculateGoldValuation(m2GoldRatio: number): {
  valuation: ValuationMetric;
  expectedReturn: ExpectedReturn;
} {
  const percentile = calculatePercentile(m2GoldRatio, GOLD_M2_PERCENTILES);
  // Inverted: high M2/Gold = gold cheap, low = gold expensive
  const zone = percentile >= 75 ? "cheap" : percentile >= 25 ? "fair" : "expensive";
  const expectedReturn = lookupExpectedReturn(m2GoldRatio, GOLD_M2_LOOKUP);

  return {
    valuation: {
      metric: "M2/Au",
      value: Math.round(m2GoldRatio * 10) / 10,
      percentile,
      zone,
    },
    expectedReturn,
  };
}

export function calculateBtcValuation(cycleYear: number): {
  valuation: ValuationMetric;
  expectedReturn: ExpectedReturn;
} {
  // cycleYear is 0-4, where 0 = halving month
  // Percentile based on where we are in cycle (early = cheap)
  const percentile = Math.min(95, Math.round((cycleYear / 4) * 100));
  const zone = determineValuationZone(percentile);
  const expectedReturn = lookupExpectedReturn(cycleYear, BTC_CYCLE_LOOKUP);

  return {
    valuation: {
      metric: "Cycle",
      value: Math.round(cycleYear * 10) / 10,
      percentile,
      zone,
    },
    expectedReturn,
  };
}

export function calculateBondValuation(yield10y: number): {
  valuation: ValuationMetric;
  expectedReturn: ExpectedReturn;
} {
  // For bonds, higher yield = better value (reverse of other assets)
  const percentile = Math.max(5, Math.min(95, Math.round(yield10y * 15)));
  const zone = yield10y > 4 ? "cheap" : yield10y > 2.5 ? "fair" : "expensive";
  
  return {
    valuation: {
      metric: "Yield",
      value: Math.round(yield10y * 100) / 100,
      percentile,
      zone,
    },
    expectedReturn: {
      tenYear: Math.round(yield10y * 100) / 100,
      confidence: "high",
    },
  };
}

// ---------------------------------------------------------------------------
// BTC Halving Cycle Calculator
// ---------------------------------------------------------------------------

// Last halving: April 20, 2024
const LAST_HALVING = new Date("2024-04-20");
const CYCLE_LENGTH_DAYS = 4 * 365; // ~4 years

export function getBtcCyclePosition(): number {
  const now = new Date();
  const daysSinceHalving = (now.getTime() - LAST_HALVING.getTime()) / (1000 * 60 * 60 * 24);
  const cycleYear = daysSinceHalving / 365;
  return Math.min(4, Math.max(0, cycleYear));
}

export function getBtcCycleLabel(cycleYear: number): string {
  if (cycleYear < 1) return "Year 1 (Post-Halving)";
  if (cycleYear < 2) return "Year 2 (Mid-Cycle)";
  if (cycleYear < 3) return "Year 3 (Late Cycle)";
  return "Year 4 (Pre-Halving)";
}

// ---------------------------------------------------------------------------
// Ranking
// ---------------------------------------------------------------------------

export function rankAssetsByExpectedReturn(
  assets: Array<{ symbol: string; expectedReturn: { tenYear: number } }>
): string[] {
  return assets
    .sort((a, b) => b.expectedReturn.tenYear - a.expectedReturn.tenYear)
    .map((a) => a.symbol);
}
