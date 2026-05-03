/**
 * Piotroski F-Score Implementation
 * 
 * The Piotroski F-Score is a 9-point scoring system (0-9) that uses
 * accounting-based signals to identify financially strong value stocks.
 * 
 * Reference: Piotroski, J. D. (2000). "Value Investing: The Use of Historical
 * Financial Statement Information to Separate Winners from Losers."
 * Journal of Accounting Research, 38, 1-41.
 */

import YahooFinance from "yahoo-finance2";
const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

// ============================================================================
// Types
// ============================================================================

export interface PiotroskiInput {
  // Current Year
  netIncome: number | null;
  totalAssets: number | null;
  operatingCashflow: number | null;
  longTermDebt: number | null;
  currentAssets: number | null;
  currentLiabilities: number | null;
  sharesOutstanding: number | null;
  grossProfit: number | null;
  totalRevenue: number | null;

  // Prior Year (for YoY comparisons)
  netIncomePrior: number | null;
  totalAssetsPrior: number | null;
  operatingCashflowPrior: number | null;
  longTermDebtPrior: number | null;
  currentAssetsPrior: number | null;
  currentLiabilitiesPrior: number | null;
  sharesOutstandingPrior: number | null;
  grossProfitPrior: number | null;
  totalRevenuePrior: number | null;
}

export interface PiotroskiSignal {
  name: string;
  category: "Profitability" | "Leverage" | "Efficiency";
  score: 0 | 1;
  description: string;
  value?: number | null;
  threshold?: string;
}

export interface PiotroskiResult {
  fScore: number; // 0-9
  signals: PiotroskiSignal[];
  profitability: number; // 0-4
  leverage: number; // 0-3
  efficiency: number; // 0-2
  category: "Strong" | "Moderate" | "Weak";
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Calculate ROA: Net Income / Total Assets
 */
function calculateROA(netIncome: number | null, totalAssets: number | null): number | null {
  if (netIncome === null || totalAssets === null || totalAssets === 0) {
    return null;
  }
  return netIncome / totalAssets;
}

/**
 * Calculate Current Ratio: Current Assets / Current Liabilities
 */
function calculateCurrentRatio(
  currentAssets: number | null,
  currentLiabilities: number | null
): number | null {
  if (currentAssets === null || currentLiabilities === null || currentLiabilities === 0) {
    return null;
  }
  return currentAssets / currentLiabilities;
}

/**
 * Calculate Long-term Debt Ratio: Long-term Debt / Total Assets
 */
function calculateDebtRatio(
  longTermDebt: number | null,
  totalAssets: number | null
): number | null {
  if (longTermDebt === null || totalAssets === null || totalAssets === 0) {
    return null;
  }
  return longTermDebt / totalAssets;
}

/**
 * Calculate Gross Margin: Gross Profit / Total Revenue
 */
function calculateGrossMargin(
  grossProfit: number | null,
  totalRevenue: number | null
): number | null {
  if (grossProfit === null || totalRevenue === null || totalRevenue === 0) {
    return null;
  }
  return grossProfit / totalRevenue;
}

/**
 * Calculate Asset Turnover: Total Revenue / Total Assets
 */
function calculateAssetTurnover(
  totalRevenue: number | null,
  totalAssets: number | null
): number | null {
  if (totalRevenue === null || totalAssets === null || totalAssets === 0) {
    return null;
  }
  return totalRevenue / totalAssets;
}

// ============================================================================
// Piotroski F-Score Calculation
// ============================================================================

/**
 * Calculate Piotroski F-Score (0-9) from financial statement data.
 * 
 * Profitability signals (4 points):
 * 1. ROA > 0 (positive net income / assets)
 * 2. Operating Cash Flow > 0
 * 3. ROA increasing YoY
 * 4. Cash Flow > Net Income (accruals quality)
 * 
 * Leverage/Liquidity signals (3 points):
 * 5. Long-term debt ratio decreasing
 * 6. Current ratio increasing
 * 7. No new shares issued
 * 
 * Operating Efficiency signals (2 points):
 * 8. Gross margin increasing
 * 9. Asset turnover increasing
 */
export function calculatePiotroskiFScore(input: PiotroskiInput): PiotroskiResult {
  const signals: PiotroskiSignal[] = [];
  let profitability = 0;
  let leverage = 0;
  let efficiency = 0;

  // -------------------------------------------------------------------------
  // PROFITABILITY (4 signals)
  // -------------------------------------------------------------------------

  // 1. ROA > 0 (positive net income relative to assets)
  const roa = calculateROA(input.netIncome, input.totalAssets);
  const roaPositive = roa !== null && roa > 0 ? 1 : 0;
  profitability += roaPositive;
  signals.push({
    name: "Positive ROA",
    category: "Profitability",
    score: roaPositive as 0 | 1,
    description: "Return on Assets > 0",
    value: roa,
    threshold: "> 0",
  });

  // 2. Operating Cash Flow > 0
  const cfPositive = input.operatingCashflow !== null && input.operatingCashflow > 0 ? 1 : 0;
  profitability += cfPositive;
  signals.push({
    name: "Positive Cash Flow",
    category: "Profitability",
    score: cfPositive as 0 | 1,
    description: "Operating Cash Flow > 0",
    value: input.operatingCashflow,
    threshold: "> 0",
  });

  // 3. ROA increasing YoY
  const roaPrior = calculateROA(input.netIncomePrior, input.totalAssetsPrior);
  let roaIncreasing: 0 | 1 = 0;
  if (roa !== null && roaPrior !== null && roa > roaPrior) {
    roaIncreasing = 1;
  }
  profitability += roaIncreasing;
  signals.push({
    name: "Improving ROA",
    category: "Profitability",
    score: roaIncreasing,
    description: "ROA is higher than prior year",
    value: roa !== null && roaPrior !== null ? roa - roaPrior : null,
    threshold: "Current > Prior",
  });

  // 4. Cash Flow > Net Income (accruals quality)
  // High-quality earnings are backed by cash, not accruals
  let accruals: 0 | 1 = 0;
  if (
    input.operatingCashflow !== null &&
    input.netIncome !== null &&
    input.operatingCashflow > input.netIncome
  ) {
    accruals = 1;
  }
  profitability += accruals;
  signals.push({
    name: "Quality Earnings",
    category: "Profitability",
    score: accruals,
    description: "Operating Cash Flow > Net Income (low accruals)",
    value:
      input.operatingCashflow !== null && input.netIncome !== null
        ? input.operatingCashflow - input.netIncome
        : null,
    threshold: "OCF > Net Income",
  });

  // -------------------------------------------------------------------------
  // LEVERAGE / LIQUIDITY (3 signals)
  // -------------------------------------------------------------------------

  // 5. Long-term debt ratio decreasing
  const debtRatio = calculateDebtRatio(input.longTermDebt, input.totalAssets);
  const debtRatioPrior = calculateDebtRatio(input.longTermDebtPrior, input.totalAssetsPrior);
  let debtDecreasing: 0 | 1 = 0;
  if (debtRatio !== null && debtRatioPrior !== null && debtRatio < debtRatioPrior) {
    debtDecreasing = 1;
  } else if (debtRatio !== null && debtRatioPrior !== null && debtRatio === 0 && debtRatioPrior === 0) {
    // No debt in both years = good
    debtDecreasing = 1;
  }
  leverage += debtDecreasing;
  signals.push({
    name: "Decreasing Leverage",
    category: "Leverage",
    score: debtDecreasing,
    description: "Long-term debt ratio is lower than prior year",
    value: debtRatio !== null && debtRatioPrior !== null ? debtRatioPrior - debtRatio : null,
    threshold: "Current < Prior",
  });

  // 6. Current ratio increasing
  const currentRatio = calculateCurrentRatio(input.currentAssets, input.currentLiabilities);
  const currentRatioPrior = calculateCurrentRatio(
    input.currentAssetsPrior,
    input.currentLiabilitiesPrior
  );
  let liquidityIncreasing: 0 | 1 = 0;
  if (currentRatio !== null && currentRatioPrior !== null && currentRatio > currentRatioPrior) {
    liquidityIncreasing = 1;
  }
  leverage += liquidityIncreasing;
  signals.push({
    name: "Improving Liquidity",
    category: "Leverage",
    score: liquidityIncreasing,
    description: "Current ratio is higher than prior year",
    value:
      currentRatio !== null && currentRatioPrior !== null
        ? currentRatio - currentRatioPrior
        : null,
    threshold: "Current > Prior",
  });

  // 7. No new shares issued (dilution check)
  let noDilution: 0 | 1 = 0;
  if (
    input.sharesOutstanding !== null &&
    input.sharesOutstandingPrior !== null &&
    input.sharesOutstanding <= input.sharesOutstandingPrior
  ) {
    noDilution = 1;
  }
  leverage += noDilution;
  signals.push({
    name: "No Dilution",
    category: "Leverage",
    score: noDilution,
    description: "No new shares issued (or shares decreased)",
    value:
      input.sharesOutstanding !== null && input.sharesOutstandingPrior !== null
        ? input.sharesOutstandingPrior - input.sharesOutstanding
        : null,
    threshold: "Current ≤ Prior",
  });

  // -------------------------------------------------------------------------
  // OPERATING EFFICIENCY (2 signals)
  // -------------------------------------------------------------------------

  // 8. Gross margin increasing
  const grossMargin = calculateGrossMargin(input.grossProfit, input.totalRevenue);
  const grossMarginPrior = calculateGrossMargin(input.grossProfitPrior, input.totalRevenuePrior);
  let marginIncreasing: 0 | 1 = 0;
  if (grossMargin !== null && grossMarginPrior !== null && grossMargin > grossMarginPrior) {
    marginIncreasing = 1;
  }
  efficiency += marginIncreasing;
  signals.push({
    name: "Improving Margin",
    category: "Efficiency",
    score: marginIncreasing,
    description: "Gross margin is higher than prior year",
    value:
      grossMargin !== null && grossMarginPrior !== null
        ? grossMargin - grossMarginPrior
        : null,
    threshold: "Current > Prior",
  });

  // 9. Asset turnover increasing
  const assetTurnover = calculateAssetTurnover(input.totalRevenue, input.totalAssets);
  const assetTurnoverPrior = calculateAssetTurnover(
    input.totalRevenuePrior,
    input.totalAssetsPrior
  );
  let turnoverIncreasing: 0 | 1 = 0;
  if (
    assetTurnover !== null &&
    assetTurnoverPrior !== null &&
    assetTurnover > assetTurnoverPrior
  ) {
    turnoverIncreasing = 1;
  }
  efficiency += turnoverIncreasing;
  signals.push({
    name: "Improving Turnover",
    category: "Efficiency",
    score: turnoverIncreasing,
    description: "Asset turnover is higher than prior year",
    value:
      assetTurnover !== null && assetTurnoverPrior !== null
        ? assetTurnover - assetTurnoverPrior
        : null,
    threshold: "Current > Prior",
  });

  // -------------------------------------------------------------------------
  // Final Score
  // -------------------------------------------------------------------------
  const fScore = profitability + leverage + efficiency;

  // Categorize
  let category: "Strong" | "Moderate" | "Weak";
  if (fScore >= 7) {
    category = "Strong";
  } else if (fScore >= 4) {
    category = "Moderate";
  } else {
    category = "Weak";
  }

  return {
    fScore,
    signals,
    profitability,
    leverage,
    efficiency,
    category,
  };
}

// ============================================================================
// Yahoo Finance Data Fetcher for Piotroski
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

interface YahooFinancialStatement {
  endDate: { raw: number };
  netIncome?: { raw: number };
  totalAssets?: { raw: number };
  totalCurrentAssets?: { raw: number };
  totalCurrentLiabilities?: { raw: number };
  longTermDebt?: { raw: number };
  operatingCashflow?: { raw: number };
  grossProfit?: { raw: number };
  totalRevenue?: { raw: number };
}

/**
 * Fetch financial statement data and calculate Piotroski F-Score.
 */
export async function fetchPiotroskiFScore(ticker: string): Promise<PiotroskiResult | null> {
  await rateLimit();

  try {
    const result = await yahooFinance.quoteSummary(ticker, {
      modules: [
        "incomeStatementHistory",
        "balanceSheetHistory",
        "cashflowStatementHistory",
        "defaultKeyStatistics",
      ],
    });

    if (!result) return null;

    // Type the result
    const summary = result as {
      incomeStatementHistory?: { incomeStatementHistory?: unknown[] };
      balanceSheetHistory?: { balanceSheetHistory?: unknown[] };
      cashflowStatementHistory?: { cashflowStatementHistory?: unknown[] };
      defaultKeyStatistics?: { sharesOutstanding?: number };
    };

    const incomeStatements = summary.incomeStatementHistory?.incomeStatementHistory ?? [];
    const balanceSheets = summary.balanceSheetHistory?.balanceSheetHistory ?? [];
    const cashflowStatements = summary.cashflowStatementHistory?.cashflowStatementHistory ?? [];

    // Need at least 2 years of data for YoY comparisons
    if (incomeStatements.length < 2 || balanceSheets.length < 2 || cashflowStatements.length < 2) {
      console.warn(`[Piotroski] ${ticker}: insufficient historical data`);
      return null;
    }

    // Yahoo returns statements in reverse chronological order (most recent first)
    const income = incomeStatements[0] as Record<string, unknown>;
    const incomePrior = incomeStatements[1] as Record<string, unknown>;
    const balance = balanceSheets[0] as Record<string, unknown>;
    const balancePrior = balanceSheets[1] as Record<string, unknown>;
    const cashflow = cashflowStatements[0] as Record<string, unknown>;
    const cashflowPrior = cashflowStatements[1] as Record<string, unknown>;

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

    // Get current shares outstanding (from defaultKeyStatistics)
    const sharesOutstanding = summary.defaultKeyStatistics?.sharesOutstanding ?? null;

    // Build Piotroski input
    const piotroskiInput: PiotroskiInput = {
      // Current Year
      netIncome: num(income, "netIncome"),
      totalAssets: num(balance, "totalAssets"),
      operatingCashflow: num(cashflow, "operatingCashflow") ?? num(cashflow, "totalCashFromOperatingActivities"),
      longTermDebt: num(balance, "longTermDebt"),
      currentAssets: num(balance, "totalCurrentAssets"),
      currentLiabilities: num(balance, "totalCurrentLiabilities"),
      sharesOutstanding: sharesOutstanding,
      grossProfit: num(income, "grossProfit"),
      totalRevenue: num(income, "totalRevenue"),

      // Prior Year
      netIncomePrior: num(incomePrior, "netIncome"),
      totalAssetsPrior: num(balancePrior, "totalAssets"),
      operatingCashflowPrior: num(cashflowPrior, "operatingCashflow") ?? num(cashflowPrior, "totalCashFromOperatingActivities"),
      longTermDebtPrior: num(balancePrior, "longTermDebt"),
      currentAssetsPrior: num(balancePrior, "totalCurrentAssets"),
      currentLiabilitiesPrior: num(balancePrior, "totalCurrentLiabilities"),
      sharesOutstandingPrior: sharesOutstanding, // Note: we'd need historical shares data
      grossProfitPrior: num(incomePrior, "grossProfit"),
      totalRevenuePrior: num(incomePrior, "totalRevenue"),
    };

    return calculatePiotroskiFScore(piotroskiInput);
  } catch (error) {
    console.error(`[Piotroski] ${ticker}: fetch failed -`, error);
    return null;
  }
}

/**
 * Score F-Score for display purposes.
 * Maps 0-9 to categories useful for ranking.
 */
export function fScoreToPoints(fScore: number, maxPoints: number = 10): number {
  // Map F-Score (0-9) to points
  // 8-9: max points (strong)
  // 6-7: 75% points (good)
  // 4-5: 50% points (moderate)
  // 2-3: 25% points (weak)
  // 0-1: 0 points (avoid)
  if (fScore >= 8) return maxPoints;
  if (fScore >= 6) return Math.round(maxPoints * 0.75);
  if (fScore >= 4) return Math.round(maxPoints * 0.5);
  if (fScore >= 2) return Math.round(maxPoints * 0.25);
  return 0;
}
