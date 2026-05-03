/**
 * Academic Factor Implementation
 * 
 * Implementation of well-researched academic factors that predict stock returns:
 * 
 * 1. Gross Profitability (Novy-Marx, 2013)
 *    - Higher gross profitability predicts returns independent of value
 *    - Formula: (Revenue - COGS) / Total Assets
 * 
 * 2. Investment Factor (Fama-French, 2015)
 *    - Low asset growth firms outperform high growth firms (CMA factor)
 *    - Formula: (Assets_t - Assets_t-1) / Assets_t-1
 * 
 * 3. Accruals Quality (Sloan, 1996)
 *    - High accruals predict lower future returns (earnings quality)
 *    - Formula: (Net Income - Operating Cash Flow) / Total Assets
 * 
 * References:
 * - Novy-Marx, R. (2013). "The other side of value: The gross profitability premium"
 * - Fama, E. F., & French, K. R. (2015). "A five-factor asset pricing model"
 * - Sloan, R. G. (1996). "Do stock prices fully reflect information in accruals and cash flows about future earnings?"
 */

import YahooFinance from "yahoo-finance2";
const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

// ============================================================================
// Types
// ============================================================================

export interface AcademicFactorsInput {
  // Current Year
  totalRevenue: number | null;
  costOfRevenue: number | null; // COGS
  grossProfit: number | null; // Alternative: Revenue - COGS
  totalAssets: number | null;
  netIncome: number | null;
  operatingCashflow: number | null;

  // Prior Year (for investment factor)
  totalAssetsPrior: number | null;
}

export interface AcademicFactorsResult {
  // Gross Profitability (higher is better)
  grossProfitability: number | null;
  grossProfitabilityPercentile?: number; // 0-100, set during market-wide ranking

  // Investment Factor (lower is better - conservative beats aggressive)
  assetGrowth: number | null;
  assetGrowthPercentile?: number; // 0-100, inverted (low growth = high percentile)

  // Accruals Quality (lower is better - low accruals = high quality)
  accruals: number | null;
  accrualsPercentile?: number; // 0-100, inverted (low accruals = high percentile)

  // Combined academic score (0-30 points for Quant mode boost)
  academicScore: number;
  academicBreakdown: {
    grossProfitability: { score: number; max: number };
    investment: { score: number; max: number };
    accrualsQuality: { score: number; max: number };
  };
}

// ============================================================================
// Factor Calculations
// ============================================================================

/**
 * Calculate Gross Profitability (Novy-Marx factor)
 * Formula: (Revenue - COGS) / Total Assets
 * 
 * Higher values indicate more efficient asset utilization for profit generation.
 * Stocks in the top quintile of gross profitability outperform by ~0.3% monthly.
 */
export function calculateGrossProfitability(
  totalRevenue: number | null,
  costOfRevenue: number | null,
  grossProfit: number | null,
  totalAssets: number | null
): number | null {
  if (totalAssets === null || totalAssets === 0) {
    return null;
  }

  // Use gross profit directly if available, otherwise calculate
  let gp = grossProfit;
  if (gp === null && totalRevenue !== null && costOfRevenue !== null) {
    gp = totalRevenue - costOfRevenue;
  }

  if (gp === null) {
    return null;
  }

  return gp / totalAssets;
}

/**
 * Calculate Investment Factor (Asset Growth)
 * Formula: (Assets_t - Assets_t-1) / Assets_t-1
 * 
 * LOWER is better - conservative firms (low asset growth) outperform aggressive firms.
 * This is the CMA (Conservative Minus Aggressive) factor from Fama-French 5-factor model.
 */
export function calculateInvestmentFactor(
  totalAssets: number | null,
  totalAssetsPrior: number | null
): number | null {
  if (
    totalAssets === null ||
    totalAssetsPrior === null ||
    totalAssetsPrior === 0
  ) {
    return null;
  }

  return (totalAssets - totalAssetsPrior) / totalAssetsPrior;
}

/**
 * Calculate Accruals Quality
 * Formula: (Net Income - Operating Cash Flow) / Total Assets
 * 
 * LOWER is better - high accruals indicate low earnings quality.
 * Stocks with high accruals tend to underperform.
 * 
 * Negative accruals (cash flow > net income) = good earnings quality
 * Positive accruals (net income > cash flow) = low earnings quality
 */
export function calculateAccruals(
  netIncome: number | null,
  operatingCashflow: number | null,
  totalAssets: number | null
): number | null {
  if (
    netIncome === null ||
    operatingCashflow === null ||
    totalAssets === null ||
    totalAssets === 0
  ) {
    return null;
  }

  return (netIncome - operatingCashflow) / totalAssets;
}

// ============================================================================
// Scoring Functions
// ============================================================================

/**
 * Score Gross Profitability (higher is better)
 * Top quintile gets max points.
 * 
 * Thresholds based on typical distribution:
 * - > 0.35 (35%): 10 points (excellent)
 * - > 0.25 (25%): 8 points (very good)
 * - > 0.15 (15%): 5 points (good)
 * - > 0.05 (5%): 3 points (moderate)
 * - <= 0.05: 0 points (poor)
 */
export function scoreGrossProfitability(
  gp: number | null,
  maxPoints: number = 10
): number {
  if (gp === null) {
    return Math.round(maxPoints * 0.5); // Neutral for missing data
  }

  if (gp > 0.35) return maxPoints;
  if (gp > 0.25) return Math.round(maxPoints * 0.8);
  if (gp > 0.15) return Math.round(maxPoints * 0.5);
  if (gp > 0.05) return Math.round(maxPoints * 0.3);
  return 0;
}

/**
 * Score Investment Factor (lower asset growth is better)
 * Bottom quintile (conservative) gets max points.
 * 
 * Thresholds:
 * - < 0% (shrinking): 10 points (most conservative)
 * - < 5%: 8 points (conservative)
 * - < 10%: 5 points (moderate)
 * - < 20%: 3 points (growing)
 * - >= 20%: 0 points (aggressive)
 */
export function scoreInvestmentFactor(
  assetGrowth: number | null,
  maxPoints: number = 10
): number {
  if (assetGrowth === null) {
    return Math.round(maxPoints * 0.5); // Neutral for missing data
  }

  if (assetGrowth < 0) return maxPoints; // Shrinking = very conservative
  if (assetGrowth < 0.05) return Math.round(maxPoints * 0.8);
  if (assetGrowth < 0.10) return Math.round(maxPoints * 0.5);
  if (assetGrowth < 0.20) return Math.round(maxPoints * 0.3);
  return 0; // Aggressive growth
}

/**
 * Score Accruals Quality (lower accruals is better)
 * Bottom quintile (low/negative accruals) gets max points.
 * 
 * Thresholds:
 * - < -0.05 (cash flow significantly > earnings): 10 points (excellent quality)
 * - < 0 (cash flow > earnings): 8 points (good quality)
 * - < 0.05 (small accruals): 5 points (moderate)
 * - < 0.10 (moderate accruals): 3 points (concerning)
 * - >= 0.10 (high accruals): 0 points (low quality)
 */
export function scoreAccrualsQuality(
  accruals: number | null,
  maxPoints: number = 10
): number {
  if (accruals === null) {
    return Math.round(maxPoints * 0.5); // Neutral for missing data
  }

  if (accruals < -0.05) return maxPoints; // Very high quality
  if (accruals < 0) return Math.round(maxPoints * 0.8);
  if (accruals < 0.05) return Math.round(maxPoints * 0.5);
  if (accruals < 0.10) return Math.round(maxPoints * 0.3);
  return 0; // Low quality earnings
}

// ============================================================================
// Combined Academic Factors
// ============================================================================

/**
 * Calculate all academic factors from input data.
 * Returns individual factors and combined academic score (0-30 points).
 */
export function calculateAcademicFactors(input: AcademicFactorsInput): AcademicFactorsResult {
  // Calculate individual factors
  const grossProfitability = calculateGrossProfitability(
    input.totalRevenue,
    input.costOfRevenue,
    input.grossProfit,
    input.totalAssets
  );

  const assetGrowth = calculateInvestmentFactor(input.totalAssets, input.totalAssetsPrior);

  const accruals = calculateAccruals(
    input.netIncome,
    input.operatingCashflow,
    input.totalAssets
  );

  // Score each factor (10 points max each, 30 total)
  const gpScore = scoreGrossProfitability(grossProfitability);
  const investmentScore = scoreInvestmentFactor(assetGrowth);
  const accrualsScore = scoreAccrualsQuality(accruals);

  return {
    grossProfitability,
    assetGrowth,
    accruals,
    academicScore: gpScore + investmentScore + accrualsScore,
    academicBreakdown: {
      grossProfitability: { score: gpScore, max: 10 },
      investment: { score: investmentScore, max: 10 },
      accrualsQuality: { score: accrualsScore, max: 10 },
    },
  };
}

// ============================================================================
// Yahoo Finance Data Fetcher for Academic Factors
// ============================================================================

const RATE_LIMIT_MS = 350;
let lastRequestTime = 0;

async function rateLimit(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < RATE_LIMIT_MS) {
    await new Promise((resolve) => setTimeout(resolve, RATE_LIMIT_MS - elapsed));
  }
  lastRequestTime = Date.now();
}

/**
 * Fetch financial statement data and calculate academic factors.
 */
export async function fetchAcademicFactors(ticker: string): Promise<AcademicFactorsResult | null> {
  await rateLimit();

  try {
    const result = await yahooFinance.quoteSummary(ticker, {
      modules: [
        "incomeStatementHistory",
        "balanceSheetHistory",
        "cashflowStatementHistory",
      ],
    });

    if (!result) return null;

    // Type the result
    const summary = result as {
      incomeStatementHistory?: { incomeStatementHistory?: unknown[] };
      balanceSheetHistory?: { balanceSheetHistory?: unknown[] };
      cashflowStatementHistory?: { cashflowStatementHistory?: unknown[] };
    };

    const incomeStatements = summary.incomeStatementHistory?.incomeStatementHistory ?? [];
    const balanceSheets = summary.balanceSheetHistory?.balanceSheetHistory ?? [];
    const cashflowStatements = summary.cashflowStatementHistory?.cashflowStatementHistory ?? [];

    // Need at least 2 years for investment factor
    if (balanceSheets.length < 2) {
      console.warn(`[AcademicFactors] ${ticker}: insufficient historical data`);
      return null;
    }

    // Yahoo returns statements in reverse chronological order
    const income = incomeStatements[0] as Record<string, unknown> | undefined;
    const balance = balanceSheets[0] as Record<string, unknown>;
    const balancePrior = balanceSheets[1] as Record<string, unknown>;
    const cashflow = cashflowStatements[0] as Record<string, unknown> | undefined;

    // Helper to extract numeric value
    const num = (obj: Record<string, unknown> | undefined, key: string): number | null => {
      if (!obj) return null;
      const val = obj[key];
      if (typeof val === "number") return val;
      if (val && typeof val === "object" && "raw" in val) {
        return (val as { raw: number }).raw;
      }
      return null;
    };

    // Build input
    const input: AcademicFactorsInput = {
      totalRevenue: num(income, "totalRevenue"),
      costOfRevenue: num(income, "costOfRevenue"),
      grossProfit: num(income, "grossProfit"),
      totalAssets: num(balance, "totalAssets"),
      netIncome: num(income, "netIncome"),
      operatingCashflow: num(cashflow, "operatingCashflow") ?? num(cashflow, "totalCashFromOperatingActivities"),
      totalAssetsPrior: num(balancePrior, "totalAssets"),
    };

    return calculateAcademicFactors(input);
  } catch (error) {
    console.error(`[AcademicFactors] ${ticker}: fetch failed -`, error);
    return null;
  }
}

// ============================================================================
// Percentile-Based Scoring (for market-relative ranking)
// ============================================================================

/**
 * Calculate percentile for a value within a distribution.
 * Returns 0-100 where higher = better rank.
 */
export function calculatePercentile(
  value: number,
  allValues: number[],
  higherIsBetter: boolean = true
): number {
  if (allValues.length === 0) return 50;

  const sorted = [...allValues].sort((a, b) => a - b);
  const rank = sorted.findIndex((v) => v >= value);
  const percentile = rank === -1 ? 100 : (rank / sorted.length) * 100;

  return higherIsBetter ? percentile : 100 - percentile;
}

/**
 * Build percentile data for academic factors across a market.
 * Used for relative ranking within market universe.
 */
export interface AcademicPercentiles {
  grossProfitability: number[];
  assetGrowth: number[];
  accruals: number[];
}

export function buildAcademicPercentiles(
  results: AcademicFactorsResult[]
): AcademicPercentiles {
  return {
    grossProfitability: results
      .map((r) => r.grossProfitability)
      .filter((v): v is number => v !== null),
    assetGrowth: results
      .map((r) => r.assetGrowth)
      .filter((v): v is number => v !== null),
    accruals: results
      .map((r) => r.accruals)
      .filter((v): v is number => v !== null),
  };
}

/**
 * Score academic factors using percentile ranking.
 * 
 * @param factors - Individual stock's academic factors
 * @param percentiles - Market-wide percentile data
 * @param maxPoints - Maximum points per factor (default 10, 30 total)
 * @returns Updated result with percentile-based scores
 */
export function scoreByPercentile(
  factors: AcademicFactorsResult,
  percentiles: AcademicPercentiles,
  maxPoints: number = 10
): AcademicFactorsResult {
  // Gross Profitability: higher is better
  let gpPercentile = 50;
  let gpScore = Math.round(maxPoints * 0.5);
  if (factors.grossProfitability !== null && percentiles.grossProfitability.length > 0) {
    gpPercentile = calculatePercentile(
      factors.grossProfitability,
      percentiles.grossProfitability,
      true
    );
    gpScore = Math.round((gpPercentile / 100) * maxPoints);
  }

  // Asset Growth: lower is better (inverted)
  let agPercentile = 50;
  let agScore = Math.round(maxPoints * 0.5);
  if (factors.assetGrowth !== null && percentiles.assetGrowth.length > 0) {
    agPercentile = calculatePercentile(factors.assetGrowth, percentiles.assetGrowth, false);
    agScore = Math.round((agPercentile / 100) * maxPoints);
  }

  // Accruals: lower is better (inverted)
  let accPercentile = 50;
  let accScore = Math.round(maxPoints * 0.5);
  if (factors.accruals !== null && percentiles.accruals.length > 0) {
    accPercentile = calculatePercentile(factors.accruals, percentiles.accruals, false);
    accScore = Math.round((accPercentile / 100) * maxPoints);
  }

  return {
    ...factors,
    grossProfitabilityPercentile: gpPercentile,
    assetGrowthPercentile: agPercentile,
    accrualsPercentile: accPercentile,
    academicScore: gpScore + agScore + accScore,
    academicBreakdown: {
      grossProfitability: { score: gpScore, max: maxPoints },
      investment: { score: agScore, max: maxPoints },
      accrualsQuality: { score: accScore, max: maxPoints },
    },
  };
}
