/**
 * Multi-mode scoring for the HQ stock scanner.
 * Three distinct scoring philosophies: Quant, Value, Growth
 * Each mode scores 0-100 based on different factor exposures.
 * 
 * Phase 2 addition: Academic factors (Piotroski F-Score, Gross Profitability,
 * Investment Factor, Accruals Quality) integrated as optional Quant boost.
 */

import type { ScoreComponent } from "@/app/markets/scanner/types";
import type { WatchlistMarket } from "@/db/schema";
import type { PiotroskiResult } from "./piotroski";
import type { AcademicFactorsResult } from "./academic-factors";

// ============================================================================
// Types
// ============================================================================

export interface ModeScore {
  score: number; // 0-100
  breakdown: ScoreComponent;
}

export interface AllModeScores {
  quantScore: number;
  valueScore: number;
  growthScore: number;
  combinedScore: number;
  quantBreakdown: ScoreComponent;
  valueBreakdown: ScoreComponent;
  growthBreakdown: ScoreComponent;
  // Phase 2: Academic factors
  fScore?: number; // Piotroski F-Score (0-9)
  fScoreCategory?: "Strong" | "Moderate" | "Weak";
  academicScore?: number; // Combined academic factor score (0-30)
}

// Single source of truth: WATCHLIST_MARKETS in src/db/schema.ts.
// Re-exported here so existing scanner code keeps importing `Market` from
// mode-scoring while the canonical tuple lives next to the schema.
export type Market = WatchlistMarket;

/**
 * Yahoo Finance data structure expected by scoring functions.
 * These fields come from various Yahoo Finance modules.
 */
export interface YahooStockData {
  // financialData module
  currentPrice?: number;
  grossMargins?: number; // as decimal, e.g., 0.35 for 35%
  operatingMargins?: number;
  freeCashflow?: number;
  operatingCashflow?: number;
  totalRevenue?: number;
  revenueGrowth?: number; // YoY revenue growth as decimal
  returnOnEquity?: number; // as decimal
  returnOnAssets?: number; // as decimal (important for banks)
  debtToEquity?: number; // as ratio (e.g., 0.5 for 50%)
  totalDebt?: number;
  ebitda?: number;
  currentRatio?: number; // current assets / current liabilities

  // defaultKeyStatistics module
  trailingEps?: number;
  priceToBook?: number;
  enterpriseToEbitda?: number;
  beta?: number;
  sharesOutstanding?: number;
  heldPercentInsiders?: number;
  enterpriseValue?: number;
  forwardPE?: number;
  pegRatio?: number;
  priceToSalesTrailing12Months?: number;

  // summaryDetail module
  trailingPE?: number;
  dividendYield?: number; // as decimal
  payoutRatio?: number; // as decimal
  marketCap?: number;

  // price module
  regularMarketPrice?: number;
  regularMarketChangePercent?: number;
  fiftyDayAverage?: number;
  twoHundredDayAverage?: number;

  // Calculated/derived fields (may come from historical data)
  revenueGrowth3YCAGR?: number; // 3-year CAGR as decimal
  revenueGrowthQoQ?: number; // QoQ as decimal
  grossMarginTrend?: number; // change in GM, positive = improving
  return3M?: number; // 3-month return as decimal
  return6M?: number; // 6-month return as decimal
  return12M?: number; // 12-month return as decimal (for momentum)
  fcfMargin?: number; // FCF/Revenue as decimal
  fcfYield?: number; // FCF/MarketCap as decimal
  buybackYield?: number; // Net buyback / market cap as decimal
  interestCoverage?: number; // EBIT / Interest Expense
  roic?: number; // Return on Invested Capital as decimal
  earningsYield?: number; // Inverse of P/E
  sector?: string;
  industry?: string;
  consecutivePositiveQuarters?: number; // for consistency check
  revenueAcceleration?: number; // change in YoY growth rate

  // Academic factors (Phase 2)
  piotroskiFScore?: PiotroskiResult; // 0-9 F-Score with breakdown
  academicFactors?: AcademicFactorsResult; // Gross Profitability, Investment, Accruals

  // Individual academic metrics (for direct access)
  grossProfitability?: number; // (Revenue - COGS) / Total Assets
  assetGrowth?: number; // YoY asset growth rate
  accruals?: number; // (Net Income - OCF) / Total Assets
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Safely get a number, returning 0 if null/undefined/NaN
 */
function safeNum(val: number | undefined | null): number {
  if (val === undefined || val === null || isNaN(val)) return 0;
  return val;
}

/**
 * Score a metric with null handling - returns neutral score (50% of max) for missing data.
 * @param value - the metric value (can be null/undefined)
 * @param thresholds - array of [threshold, points] pairs, sorted high to low (or low to high if inverted)
 * @param maxPoints - maximum points for this metric
 * @param invert - if true, lower values are better (e.g., P/E, D/E)
 * @returns score between 0 and maxPoints, or 50% of maxPoints if value is null/undefined
 */
export function scoreMetric(
  value: number | undefined | null,
  thresholds: [number, number][],
  maxPoints: number,
  invert = false
): number {
  // Missing data = neutral score (50% of max points)
  if (value === undefined || value === null || isNaN(value)) {
    return Math.round(maxPoints * 0.5);
  }

  for (const [threshold, points] of thresholds) {
    if (invert ? value <= threshold : value >= threshold) {
      return points;
    }
  }
  return 0;
}

/**
 * Score a metric using tiered thresholds.
 * @param value - the metric value
 * @param tiers - array of [threshold, points] pairs, sorted high to low
 * @param invert - if true, lower values are better (e.g., P/E, D/E)
 * @deprecated Use scoreMetric instead for proper null handling
 */
function tieredScore(
  value: number | undefined | null,
  tiers: [number, number][],
  invert = false
): number {
  if (value === undefined || value === null || isNaN(value)) return 0;

  for (const [threshold, points] of tiers) {
    if (invert ? value <= threshold : value >= threshold) {
      return points;
    }
  }
  return 0;
}

/**
 * Determine ROIC threshold based on market.
 * US/LSE: 15%, JP/KS: 8%, EM Asia (HK, CN, SGX): 10%
 *
 * KS (Korea) is treated like JP — Korean equities have idiosyncratic
 * accounting (chaebol cross-holdings, opaque conglomerate structures), so a
 * conservative developed-market threshold matches JP's 8% better than the
 * 15% US/LSE bar.
 */
function getROICThreshold(market: Market): number {
  switch (market) {
    case "JP":
    case "KS":
      return 0.08;
    case "HK":
    case "CN":
    case "SGX":
      return 0.1;
    case "US":
    case "LSE":
    default:
      return 0.15;
  }
}

/**
 * Check if stock is in a tech/internet sector (for Rule of 40).
 */
function isTechSector(sector?: string, industry?: string): boolean {
  const techSectors = ["Technology", "Communication Services"];
  const techIndustries = [
    "Software",
    "Internet",
    "Cloud",
    "SaaS",
    "Information Technology Services",
    "Electronic Gaming & Multimedia",
    "Internet Content & Information",
  ];

  if (sector && techSectors.some((s) => sector.includes(s))) return true;
  if (industry && techIndustries.some((i) => industry.includes(i))) return true;
  return false;
}

/**
 * Check if stock is in Financial Services sector (banks, insurance, etc.)
 * These require alternate scoring metrics.
 */
export function isFinancialSector(sector?: string): boolean {
  return sector === "Financial Services";
}

/**
 * Check if stock is a REIT.
 */
export function isREIT(industry?: string): boolean {
  if (!industry) return false;
  return industry.toLowerCase().includes("reit");
}

/**
 * For Singapore REITs, check if gearing exceeds 45% threshold.
 * MAS limit is 50%, but 45% is a warning threshold.
 */
export function isHighGearingREIT(
  debtToEquity: number | undefined | null,
  market: Market,
  industry?: string
): boolean {
  if (!isREIT(industry)) return false;
  if (market !== "SGX") return false;
  if (debtToEquity === undefined || debtToEquity === null) return false;
  return debtToEquity > 0.45;
}

/**
 * Calculate Financial Services specific score (banks, insurance).
 * Uses alternate metrics: ROE (40%), ROA (20%), P/E (20%), P/B (20%)
 */
export function calculateFinancialServicesScore(
  stock: YahooStockData,
  market: Market = "US"
): ModeScore {
  const breakdown: ScoreComponent = {};

  // -------------------------------------------------------------------------
  // ROE (40 pts max) - Primary quality metric for banks
  // -------------------------------------------------------------------------
  const roe = stock.returnOnEquity;
  const roeScore = scoreMetric(
    roe,
    [
      [0.15, 40], // >15%: excellent
      [0.12, 32], // >12%: good
      [0.10, 24], // >10%: acceptable
      [0.08, 16], // >8%: below average
      [0.05, 8],  // >5%: weak
    ],
    40
  );
  breakdown["ROE"] = { score: roeScore, max: 40 };

  // -------------------------------------------------------------------------
  // ROA (20 pts max) - Asset efficiency
  // -------------------------------------------------------------------------
  const roa = stock.returnOnAssets;
  const roaScore = scoreMetric(
    roa,
    [
      [0.015, 20], // >1.5%: excellent for banks
      [0.012, 16], // >1.2%: good
      [0.01, 12],  // >1.0%: acceptable
      [0.008, 8],  // >0.8%: below average
      [0.005, 4],  // >0.5%: weak
    ],
    20
  );
  breakdown["ROA"] = { score: roaScore, max: 20 };

  // -------------------------------------------------------------------------
  // P/E (20 pts max) - Value metric
  // -------------------------------------------------------------------------
  const pe = stock.trailingPE;
  const peScore = scoreMetric(
    pe,
    [
      [8, 20],  // <8: deep value
      [10, 16], // <10: attractive
      [12, 12], // <12: fair
      [15, 8],  // <15: reasonable
      [20, 4],  // <20: expensive
    ],
    20,
    true // inverted - lower is better
  );
  breakdown["P/E"] = { score: peScore, max: 20 };

  // -------------------------------------------------------------------------
  // P/B (20 pts max) - Book value metric (key for banks)
  // -------------------------------------------------------------------------
  const pb = stock.priceToBook;
  const pbScore = scoreMetric(
    pb,
    [
      [0.8, 20], // <0.8: deep value
      [1.0, 16], // <1.0: below book
      [1.2, 12], // <1.2: slight premium
      [1.5, 8],  // <1.5: fair
      [2.0, 4],  // <2.0: premium
    ],
    20,
    true // inverted - lower is better
  );
  breakdown["P/B"] = { score: pbScore, max: 20 };

  const totalScore = roeScore + roaScore + peScore + pbScore;

  return {
    score: Math.min(100, Math.round(totalScore)),
    breakdown,
  };
}

/**
 * Calculate REIT-specific score.
 * Focus on: Dividend Yield, P/B (as P/NAV proxy), Gearing
 */
export function calculateREITScore(
  stock: YahooStockData,
  market: Market = "US"
): ModeScore {
  const breakdown: ScoreComponent = {};

  // -------------------------------------------------------------------------
  // Dividend Yield (40 pts max) - Primary metric for REITs
  // -------------------------------------------------------------------------
  const divYield = stock.dividendYield;
  const divScore = scoreMetric(
    divYield,
    [
      [0.07, 40], // >7%: excellent
      [0.06, 32], // >6%: very good
      [0.05, 24], // >5%: good
      [0.04, 16], // >4%: acceptable
      [0.03, 8],  // >3%: below average
    ],
    40
  );
  breakdown["Dividend Yield"] = { score: divScore, max: 40 };

  // -------------------------------------------------------------------------
  // P/NAV (P/B as proxy) (30 pts max) - Value metric
  // -------------------------------------------------------------------------
  const pb = stock.priceToBook;
  const pnavScore = scoreMetric(
    pb,
    [
      [0.7, 30], // <0.7: deep discount to NAV
      [0.85, 24], // <0.85: good discount
      [1.0, 18], // <1.0: at NAV
      [1.1, 12], // <1.1: slight premium
      [1.2, 6],  // <1.2: premium
    ],
    30,
    true
  );
  breakdown["P/NAV (P/B)"] = { score: pnavScore, max: 30 };

  // -------------------------------------------------------------------------
  // Gearing (30 pts max) - Risk metric (lower is better)
  // For SG REITs: >45% is warning, >50% is MAS limit
  // -------------------------------------------------------------------------
  const de = stock.debtToEquity;
  let gearingScore: number;
  if (market === "SGX") {
    // Stricter thresholds for SG REITs
    gearingScore = scoreMetric(
      de,
      [
        [0.35, 30], // <35%: very safe
        [0.40, 24], // <40%: safe
        [0.45, 16], // <45%: acceptable (warning threshold)
        [0.48, 8],  // <48%: concerning
        [0.50, 2],  // <50%: near MAS limit
      ],
      30,
      true
    );
  } else {
    gearingScore = scoreMetric(
      de,
      [
        [0.40, 30], // <40%: very safe
        [0.50, 24], // <50%: safe
        [0.60, 16], // <60%: acceptable
        [0.70, 8],  // <70%: elevated
        [0.80, 2],  // <80%: high
      ],
      30,
      true
    );
  }
  breakdown["Gearing (D/E)"] = { score: gearingScore, max: 30 };

  const totalScore = divScore + pnavScore + gearingScore;

  return {
    score: Math.min(100, Math.round(totalScore)),
    breakdown,
  };
}

// ============================================================================
// Percentile Ranking
// ============================================================================

/**
 * Calculate percentile rank of a value within a dataset.
 * Returns 0-100 where 100 = top of the dataset.
 * 
 * @param value - the value to rank
 * @param allValues - array of all values in the market
 * @param higherIsBetter - if true, higher values get higher percentiles
 * @returns percentile rank 0-100, or 50 if value/dataset is invalid
 */
export function calculatePercentileRank(
  value: number | undefined | null,
  allValues: number[],
  higherIsBetter = true
): number {
  if (value === undefined || value === null || isNaN(value)) {
    return 50; // Neutral for missing data
  }

  // Filter out invalid values
  const validValues = allValues.filter(v => v !== null && v !== undefined && !isNaN(v));
  if (validValues.length === 0) {
    return 50;
  }

  // Count how many values are below the given value
  const belowCount = validValues.filter(v => v < value).length;
  const percentile = (belowCount / validValues.length) * 100;

  return higherIsBetter ? percentile : 100 - percentile;
}

/**
 * Market percentile cache for in-memory storage during refresh.
 */
export interface MarketPercentiles {
  market: Market;
  metrics: {
    returnOnEquity: number[];
    returnOnAssets: number[];
    trailingPE: number[];
    priceToBook: number[];
    dividendYield: number[];
    debtToEquity: number[];
    grossMargins: number[];
    enterpriseToEbitda: number[];
    freeCashflow: number[];
    revenueGrowth: number[];
  };
  calculatedAt: Date;
}

/**
 * Build percentile data from an array of stock data.
 */
export function buildMarketPercentiles(
  stocks: YahooStockData[],
  market: Market
): MarketPercentiles {
  const extractMetric = (key: keyof YahooStockData): number[] => {
    return stocks
      .map(s => s[key])
      .filter((v): v is number => typeof v === "number" && !isNaN(v));
  };

  return {
    market,
    metrics: {
      returnOnEquity: extractMetric("returnOnEquity"),
      returnOnAssets: extractMetric("returnOnAssets"),
      trailingPE: extractMetric("trailingPE"),
      priceToBook: extractMetric("priceToBook"),
      dividendYield: extractMetric("dividendYield"),
      debtToEquity: extractMetric("debtToEquity"),
      grossMargins: extractMetric("grossMargins"),
      enterpriseToEbitda: extractMetric("enterpriseToEbitda"),
      freeCashflow: extractMetric("freeCashflow"),
      revenueGrowth: extractMetric("revenueGrowth"),
    },
    calculatedAt: new Date(),
  };
}

/**
 * Score a metric using percentile rank within market.
 * Maps percentile to points: 90th+ = max, 75th = 75%, 50th = 50%, etc.
 */
export function scoreByPercentile(
  value: number | undefined | null,
  allValues: number[],
  maxPoints: number,
  higherIsBetter = true
): number {
  const percentile = calculatePercentileRank(value, allValues, higherIsBetter);
  return Math.round((percentile / 100) * maxPoints);
}

// ============================================================================
// QUANT MODE (100 pts)
// Factor-based scoring using academically validated metrics
// ============================================================================
// - Quality - Profitability: 25 pts (ROE, Gross Margin, FCF Positive)
// - Quality - Stability: 20 pts (Debt/Equity, Earnings Positive, Earnings Quality)
// - Value: 25 pts (EV/EBITDA, P/B, FCF Yield)
// - Momentum: 15 pts (12-1 month return if available, else SMA200)
// - Shareholder Yield: 10 pts (Div + Buyback yield)
// - Low Volatility: 5 pts (Beta <1)
// NOTE: Size factor REMOVED (dead factor post-2000)

export function calculateQuantScore(
  stock: YahooStockData,
  market: Market = "US"
): ModeScore {
  const breakdown: ScoreComponent = {};

  // -------------------------------------------------------------------------
  // Quality - Profitability (25 pts)
  // -------------------------------------------------------------------------
  let profitabilityScore = 0;

  // ROE (10 pts max): >20%: 10, >15%: 7, >10%: 4
  const roe = safeNum(stock.returnOnEquity);
  profitabilityScore += tieredScore(roe, [
    [0.2, 10],
    [0.15, 7],
    [0.1, 4],
  ]);

  // Gross Margin (8 pts max): >50%: 8, >40%: 6, >30%: 4
  const gm = safeNum(stock.grossMargins);
  profitabilityScore += tieredScore(gm, [
    [0.5, 8],
    [0.4, 6],
    [0.3, 4],
  ]);

  // FCF Positive (7 pts): Yes: 7, No: 0
  const fcf = safeNum(stock.freeCashflow);
  if (fcf > 0) profitabilityScore += 7;

  breakdown["Quality - Profitability"] = { score: profitabilityScore, max: 25 };

  // -------------------------------------------------------------------------
  // Quality - Stability (20 pts)
  // -------------------------------------------------------------------------
  let stabilityScore = 0;

  // Debt/Equity (8 pts max): <30%: 8, <60%: 5, <100%: 2
  const de = safeNum(stock.debtToEquity);
  stabilityScore += tieredScore(
    de,
    [
      [0.3, 8],
      [0.6, 5],
      [1.0, 2],
    ],
    true
  );

  // Earnings Positive (7 pts): trailing EPS > 0
  const eps = safeNum(stock.trailingEps);
  if (eps > 0) stabilityScore += 7;

  // Earnings Quality (5 pts): OCF > Net Income proxy (conservative FCF)
  // If operating cash flow > 0 and FCF is positive, assume decent quality
  const ocf = safeNum(stock.operatingCashflow);
  if (ocf > 0 && fcf > 0 && ocf > fcf) {
    stabilityScore += 5;
  } else if (ocf > 0) {
    stabilityScore += 3;
  }

  breakdown["Quality - Stability"] = { score: stabilityScore, max: 20 };

  // -------------------------------------------------------------------------
  // Value (25 pts)
  // -------------------------------------------------------------------------
  let valueScore = 0;

  // EV/EBITDA (10 pts max): <8: 10, <12: 7, <16: 4
  const evEbitda = safeNum(stock.enterpriseToEbitda);
  if (evEbitda > 0) {
    valueScore += tieredScore(
      evEbitda,
      [
        [8, 10],
        [12, 7],
        [16, 4],
      ],
      true
    );
  }

  // P/B (8 pts max): <1.5: 8, <2.5: 5, <4: 2
  const pb = safeNum(stock.priceToBook);
  if (pb > 0) {
    valueScore += tieredScore(
      pb,
      [
        [1.5, 8],
        [2.5, 5],
        [4, 2],
      ],
      true
    );
  }

  // FCF Yield (7 pts max): >8%: 7, >5%: 5, >3%: 3
  const fcfYield = stock.fcfYield ?? calculateFCFYield(stock);
  valueScore += tieredScore(fcfYield, [
    [0.08, 7],
    [0.05, 5],
    [0.03, 3],
  ]);

  breakdown["Value"] = { score: valueScore, max: 25 };

  // -------------------------------------------------------------------------
  // Momentum (15 pts)
  // -------------------------------------------------------------------------
  let momentumScore = 0;

  // 12-1 month return if available (industry standard momentum factor)
  // Otherwise fall back to price vs SMA200
  const return12M = stock.return12M;
  if (return12M !== undefined && return12M !== null) {
    // 12-month momentum: >30%: 10, >15%: 7, >0%: 4, >-10%: 2
    momentumScore += tieredScore(return12M, [
      [0.3, 10],
      [0.15, 7],
      [0.0, 4],
      [-0.1, 2],
    ]);
  } else {
    // Fallback: Price vs SMA200
    const price = safeNum(stock.regularMarketPrice || stock.currentPrice);
    const sma200 = safeNum(stock.twoHundredDayAverage);
    if (price > 0 && sma200 > 0) {
      const pctAboveSMA = (price - sma200) / sma200;
      momentumScore += tieredScore(pctAboveSMA, [
        [0.2, 10],
        [0.1, 7],
        [0.0, 4],
        [-0.1, 2],
      ]);
    }
  }

  // Not overextended penalty check (5 pts max for being reasonable)
  const price = safeNum(stock.regularMarketPrice || stock.currentPrice);
  const sma200 = safeNum(stock.twoHundredDayAverage);
  if (price > 0 && sma200 > 0) {
    const pctAboveSMA = (price - sma200) / sma200;
    if (pctAboveSMA < 0.25) {
      momentumScore += 5; // Not overextended
    } else if (pctAboveSMA < 0.4) {
      momentumScore += 3;
    }
  } else {
    momentumScore += 3; // No data, give middle score
  }

  breakdown["Momentum"] = { score: momentumScore, max: 15 };

  // -------------------------------------------------------------------------
  // Shareholder Yield (10 pts)
  // -------------------------------------------------------------------------
  let shareholderYieldScore = 0;

  // Div + Buyback Yield: >4%: 10, >2%: 6, >1%: 3
  const divYield = safeNum(stock.dividendYield);
  const buybackYield = safeNum(stock.buybackYield);
  const totalYield = divYield + buybackYield;

  shareholderYieldScore += tieredScore(totalYield, [
    [0.04, 10],
    [0.02, 6],
    [0.01, 3],
  ]);

  breakdown["Shareholder Yield"] = { score: shareholderYieldScore, max: 10 };

  // -------------------------------------------------------------------------
  // Low Volatility (5 pts)
  // -------------------------------------------------------------------------
  let lowVolScore = 0;

  // Beta <1: 5 pts, Beta <1.2: 3 pts, Beta <1.5: 1 pt
  const beta = safeNum(stock.beta);
  if (beta > 0) {
    lowVolScore += tieredScore(
      beta,
      [
        [1.0, 5],
        [1.2, 3],
        [1.5, 1],
      ],
      true
    );
  } else {
    lowVolScore += 2; // No beta data, give neutral score
  }

  breakdown["Low Volatility"] = { score: lowVolScore, max: 5 };

  // -------------------------------------------------------------------------
  // Academic Factors Boost (Optional, 0-15 bonus points)
  // When academic factors are available, they can boost the score
  // but total is still capped at 100.
  // -------------------------------------------------------------------------
  let academicBoost = 0;

  // Piotroski F-Score bonus (0-5 pts)
  if (stock.piotroskiFScore) {
    const fScore = stock.piotroskiFScore.fScore;
    // F-Score 8-9: +5, 6-7: +3, 4-5: +1, <4: 0
    if (fScore >= 8) academicBoost += 5;
    else if (fScore >= 6) academicBoost += 3;
    else if (fScore >= 4) academicBoost += 1;
  }

  // Academic factors bonus (0-10 pts)
  if (stock.academicFactors) {
    // Academic score is 0-30, map to 0-10 bonus
    const academicScore = stock.academicFactors.academicScore;
    academicBoost += Math.round((academicScore / 30) * 10);
  }

  // If academic factors weren't fetched, provide scaled bonus based on direct values
  if (!stock.piotroskiFScore && !stock.academicFactors) {
    // Use available direct metrics for partial academic scoring
    // Gross Profitability (0-3 pts)
    if (stock.grossProfitability !== undefined) {
      if (stock.grossProfitability > 0.25) academicBoost += 3;
      else if (stock.grossProfitability > 0.15) academicBoost += 2;
      else if (stock.grossProfitability > 0.05) academicBoost += 1;
    }
    // Accruals Quality (0-2 pts) - lower is better
    if (stock.accruals !== undefined) {
      if (stock.accruals < 0) academicBoost += 2; // Cash flow > Net Income
      else if (stock.accruals < 0.05) academicBoost += 1;
    }
  }

  if (academicBoost > 0) {
    breakdown["Academic Factors"] = { score: academicBoost, max: 15 };
  }

  // -------------------------------------------------------------------------
  // Total Score
  // -------------------------------------------------------------------------
  const totalScore =
    profitabilityScore +
    stabilityScore +
    valueScore +
    momentumScore +
    shareholderYieldScore +
    lowVolScore +
    academicBoost;

  return {
    score: Math.min(100, Math.round(totalScore)),
    breakdown,
  };
}

// ============================================================================
// VALUE MODE (100 pts)
// Buffett/Klarman style: margin of safety, cash generation, durability
// ============================================================================
// - Valuation: 35 pts (EV/EBITDA, Earnings Yield Spread, P/FCF, P/B)
// - Cash Generation: 25 pts (FCF Yield, FCF Margin, FCF/Debt)
// - Quality & Durability: 30 pts (ROIC with regional thresholds, Interest Coverage, D/E, ROE)
// - Dividend: 10 pts (Yield, Payout Ratio)
// NO value trap penalties (rejected - kills contrarian plays)

export function calculateValueScore(
  stock: YahooStockData,
  market: Market = "US"
): ModeScore {
  const breakdown: ScoreComponent = {};

  // -------------------------------------------------------------------------
  // Valuation (35 pts)
  // -------------------------------------------------------------------------
  let valuationScore = 0;

  // EV/EBITDA (12 pts max): <6: 12, <8: 10, <10: 7, <14: 4
  const evEbitda = safeNum(stock.enterpriseToEbitda);
  if (evEbitda > 0) {
    valuationScore += tieredScore(
      evEbitda,
      [
        [6, 12],
        [8, 10],
        [10, 7],
        [14, 4],
      ],
      true
    );
  }

  // Earnings Yield Spread vs risk-free (10 pts max)
  // Earnings yield = 1/PE. Spread = EY - 4.5% (approximate 10Y yield)
  const pe = safeNum(stock.trailingPE);
  if (pe > 0) {
    const earningsYield = 1 / pe;
    const spread = earningsYield - 0.045;
    valuationScore += tieredScore(spread, [
      [0.06, 10],
      [0.04, 8],
      [0.02, 5],
      [0.0, 2],
    ]);
  }

  // P/FCF (8 pts max): <10: 8, <15: 6, <20: 4, <25: 2
  const mcap = safeNum(stock.marketCap);
  const fcf = safeNum(stock.freeCashflow);
  if (mcap > 0 && fcf > 0) {
    const pFcf = mcap / fcf;
    valuationScore += tieredScore(
      pFcf,
      [
        [10, 8],
        [15, 6],
        [20, 4],
        [25, 2],
      ],
      true
    );
  }

  // P/B (5 pts max): <1: 5, <1.5: 4, <2.5: 3, <4: 2
  const pb = safeNum(stock.priceToBook);
  if (pb > 0) {
    valuationScore += tieredScore(
      pb,
      [
        [1, 5],
        [1.5, 4],
        [2.5, 3],
        [4, 2],
      ],
      true
    );
  }

  breakdown["Valuation"] = { score: valuationScore, max: 35 };

  // -------------------------------------------------------------------------
  // Cash Generation (25 pts)
  // -------------------------------------------------------------------------
  let cashGenScore = 0;

  // FCF Yield (10 pts max): >10%: 10, >7%: 8, >5%: 6, >3%: 4
  const fcfYield = stock.fcfYield ?? calculateFCFYield(stock);
  cashGenScore += tieredScore(fcfYield, [
    [0.1, 10],
    [0.07, 8],
    [0.05, 6],
    [0.03, 4],
  ]);

  // FCF Margin (8 pts max): >20%: 8, >12%: 6, >6%: 4, >0%: 2
  const fcfMargin = stock.fcfMargin ?? calculateFCFMargin(stock);
  cashGenScore += tieredScore(fcfMargin, [
    [0.2, 8],
    [0.12, 6],
    [0.06, 4],
    [0.0, 2],
  ]);

  // FCF/Debt (7 pts max): >0.5: 7, >0.25: 5, >0.15: 3, >0: 1
  const totalDebt = safeNum(stock.totalDebt);
  if (fcf > 0 && totalDebt > 0) {
    const fcfToDebt = fcf / totalDebt;
    cashGenScore += tieredScore(fcfToDebt, [
      [0.5, 7],
      [0.25, 5],
      [0.15, 3],
      [0.0, 1],
    ]);
  } else if (fcf > 0 && totalDebt === 0) {
    // No debt = max score
    cashGenScore += 7;
  }

  breakdown["Cash Generation"] = { score: cashGenScore, max: 25 };

  // -------------------------------------------------------------------------
  // Quality & Durability (30 pts)
  // -------------------------------------------------------------------------
  let qualityScore = 0;

  // ROIC with regional thresholds (12 pts max)
  const roicThreshold = getROICThreshold(market);
  const roic = safeNum(stock.roic || stock.returnOnEquity); // Fallback to ROE if ROIC not available
  if (roic > 0) {
    if (roic >= roicThreshold * 1.5) {
      qualityScore += 12; // Exceptional
    } else if (roic >= roicThreshold) {
      qualityScore += 10; // Meets threshold
    } else if (roic >= roicThreshold * 0.75) {
      qualityScore += 7;
    } else if (roic >= roicThreshold * 0.5) {
      qualityScore += 4;
    }
  }

  // Interest Coverage (6 pts max): >10x: 6, >6x: 5, >4x: 3, >2x: 1
  const intCov = safeNum(stock.interestCoverage);
  if (intCov > 0) {
    qualityScore += tieredScore(intCov, [
      [10, 6],
      [6, 5],
      [4, 3],
      [2, 1],
    ]);
  } else {
    // If no interest coverage data, check if debt is low
    const de = safeNum(stock.debtToEquity);
    if (de < 0.3) qualityScore += 4; // Low debt suggests good coverage
    else if (de < 0.6) qualityScore += 2;
  }

  // Debt/Equity (6 pts max): <30%: 6, <60%: 5, <100%: 3, <150%: 1
  const de = safeNum(stock.debtToEquity);
  qualityScore += tieredScore(
    de,
    [
      [0.3, 6],
      [0.6, 5],
      [1.0, 3],
      [1.5, 1],
    ],
    true
  );

  // ROE (6 pts max): >18%: 6, >12%: 5, >8%: 4, >5%: 2
  const roe = safeNum(stock.returnOnEquity);
  qualityScore += tieredScore(roe, [
    [0.18, 6],
    [0.12, 5],
    [0.08, 4],
    [0.05, 2],
  ]);

  breakdown["Quality & Durability"] = { score: qualityScore, max: 30 };

  // -------------------------------------------------------------------------
  // Dividend (10 pts)
  // -------------------------------------------------------------------------
  let dividendScore = 0;

  // Dividend Yield (5 pts max): >4%: 5, >2.5%: 4, >1.5%: 3, >0.5%: 2
  const divYield = safeNum(stock.dividendYield);
  dividendScore += tieredScore(divYield, [
    [0.04, 5],
    [0.025, 4],
    [0.015, 3],
    [0.005, 2],
  ]);

  // Payout Ratio (5 pts max): 20-50%: 5, 50-70%: 4, 0-20%: 3, 70-90%: 2
  // Sweet spot is sustainable payout
  const payout = safeNum(stock.payoutRatio);
  if (payout >= 0.2 && payout <= 0.5) {
    dividendScore += 5; // Sustainable sweet spot
  } else if (payout > 0.5 && payout <= 0.7) {
    dividendScore += 4;
  } else if (payout > 0 && payout < 0.2) {
    dividendScore += 3; // Room to grow
  } else if (payout > 0.7 && payout <= 0.9) {
    dividendScore += 2;
  }

  breakdown["Dividend"] = { score: dividendScore, max: 10 };

  // -------------------------------------------------------------------------
  // Total Score
  // -------------------------------------------------------------------------
  const totalScore = valuationScore + cashGenScore + qualityScore + dividendScore;

  return {
    score: Math.min(100, Math.round(totalScore)),
    breakdown,
  };
}

// ============================================================================
// GROWTH MODE (100 pts)
// Hypergrowth-friendly: revenue velocity, scalability, unit economics
// ============================================================================
// - Revenue Growth: 40 pts (3Y CAGR max at >60%, YoY, QoQ)
// - Growth Durability: 20 pts (Acceleration, Consistency)
// - Scalability: 25 pts (Gross Margin, GM Trend, Rule of 40 for software/internet only)
// - Momentum: 5 pts (3M return for mean reversion signal - REDUCED)
// - TAM Proxy: 10 pts (P/S-to-Growth, Market Cap sweet spot)

export function calculateGrowthScore(
  stock: YahooStockData,
  market: Market = "US"
): ModeScore {
  const breakdown: ScoreComponent = {};

  // -------------------------------------------------------------------------
  // Revenue Growth (40 pts)
  // -------------------------------------------------------------------------
  let revenueGrowthScore = 0;

  // 3Y CAGR (15 pts max): >60%: 15, >40%: 12, >25%: 8, >15%: 5, >0%: 2
  // NOTE: Capped at 60% (not 100% - too unrealistic)
  const cagr3y = safeNum(stock.revenueGrowth3YCAGR);
  revenueGrowthScore += tieredScore(cagr3y, [
    [0.6, 15],
    [0.4, 12],
    [0.25, 8],
    [0.15, 5],
    [0.0, 2],
  ]);

  // YoY Growth (15 pts max): >80%: 15, >50%: 12, >30%: 8, >15%: 5, >0%: 2
  const yoy = safeNum(stock.revenueGrowth);
  revenueGrowthScore += tieredScore(yoy, [
    [0.8, 15],
    [0.5, 12],
    [0.3, 8],
    [0.15, 5],
    [0.0, 2],
  ]);

  // QoQ Growth (10 pts max): >20%: 10, >10%: 7, >5%: 4, >0%: 2
  const qoq = safeNum(stock.revenueGrowthQoQ);
  revenueGrowthScore += tieredScore(qoq, [
    [0.2, 10],
    [0.1, 7],
    [0.05, 4],
    [0.0, 2],
  ]);

  breakdown["Revenue Growth"] = { score: revenueGrowthScore, max: 40 };

  // -------------------------------------------------------------------------
  // Growth Durability (20 pts)
  // -------------------------------------------------------------------------
  let durabilityScore = 0;

  // Acceleration (10 pts max): >10pp: 10, >5pp: 7, stable (±2pp): 4, decelerating: 1
  const acceleration = safeNum(stock.revenueAcceleration);
  if (acceleration > 0.1) {
    durabilityScore += 10;
  } else if (acceleration > 0.05) {
    durabilityScore += 7;
  } else if (acceleration >= -0.02) {
    durabilityScore += 4; // Stable
  } else if (acceleration > -0.1) {
    durabilityScore += 2;
  } else {
    durabilityScore += 1; // Significant deceleration
  }

  // Consistency (10 pts max): 4/4 Q positive: 10, 3/4: 7, 2/4: 4
  const posQuarters = stock.consecutivePositiveQuarters ?? 0;
  if (posQuarters >= 4) {
    durabilityScore += 10;
  } else if (posQuarters >= 3) {
    durabilityScore += 7;
  } else if (posQuarters >= 2) {
    durabilityScore += 4;
  } else if (posQuarters >= 1) {
    durabilityScore += 2;
  }

  breakdown["Growth Durability"] = { score: durabilityScore, max: 20 };

  // -------------------------------------------------------------------------
  // Scalability (25 pts)
  // -------------------------------------------------------------------------
  let scalabilityScore = 0;

  // Gross Margin (12 pts max): >70%: 12, >60%: 10, >50%: 7, >40%: 4, >30%: 2
  const gm = safeNum(stock.grossMargins);
  scalabilityScore += tieredScore(gm, [
    [0.7, 12],
    [0.6, 10],
    [0.5, 7],
    [0.4, 4],
    [0.3, 2],
  ]);

  // GM Trend (5 pts max): Improving >3pp: 5, >1pp: 3, stable: 2, declining: 0
  const gmTrend = safeNum(stock.grossMarginTrend);
  if (gmTrend > 0.03) {
    scalabilityScore += 5;
  } else if (gmTrend > 0.01) {
    scalabilityScore += 3;
  } else if (gmTrend >= -0.01) {
    scalabilityScore += 2; // Stable
  }

  // Rule of 40 - ONLY for Tech/Internet sectors (8 pts max)
  // Revenue Growth + Profit Margin >= 40%
  const isTech = isTechSector(stock.sector, stock.industry);
  if (isTech) {
    const opMargin = safeNum(stock.operatingMargins);
    const ruleOf40 = yoy + opMargin;
    if (ruleOf40 >= 0.4) {
      scalabilityScore += 8;
    } else if (ruleOf40 >= 0.3) {
      scalabilityScore += 5;
    } else if (ruleOf40 >= 0.2) {
      scalabilityScore += 2;
    }
  } else {
    // Non-tech: give partial points based on operating margin alone
    const opMargin = safeNum(stock.operatingMargins);
    if (opMargin > 0.2) {
      scalabilityScore += 4;
    } else if (opMargin > 0.1) {
      scalabilityScore += 2;
    }
  }

  breakdown["Scalability"] = { score: scalabilityScore, max: 25 };

  // -------------------------------------------------------------------------
  // Momentum (5 pts) - REDUCED from 15
  // -------------------------------------------------------------------------
  let momentumScore = 0;

  // 3M return for mean reversion signal: >15%: 5, >8%: 4, >0%: 2, negative: 1
  const return3M = safeNum(stock.return3M);
  momentumScore += tieredScore(return3M, [
    [0.15, 5],
    [0.08, 4],
    [0.0, 2],
    [-0.2, 1],
  ]);

  breakdown["Momentum"] = { score: momentumScore, max: 5 };

  // -------------------------------------------------------------------------
  // TAM Proxy (10 pts)
  // -------------------------------------------------------------------------
  let tamScore = 0;

  // P/S-to-Growth Ratio (6 pts max): <0.1: 6, <0.2: 5, <0.3: 4, <0.5: 2
  // PSG = (P/S) / (Revenue Growth * 100)
  const ps = safeNum(stock.priceToSalesTrailing12Months);
  if (ps > 0 && yoy > 0) {
    const psg = ps / (yoy * 100);
    tamScore += tieredScore(
      psg,
      [
        [0.1, 6],
        [0.2, 5],
        [0.3, 4],
        [0.5, 2],
      ],
      true
    );
  }

  // Market Cap Sweet Spot (4 pts max): $500M-$5B: 4, $5B-$20B: 3, $100M-$500M: 2, $20B-$100B: 1
  const mcap = safeNum(stock.marketCap);
  const mcapB = mcap / 1e9;
  if (mcapB >= 0.5 && mcapB <= 5) {
    tamScore += 4; // Sweet spot for growth
  } else if (mcapB > 5 && mcapB <= 20) {
    tamScore += 3;
  } else if (mcapB >= 0.1 && mcapB < 0.5) {
    tamScore += 2; // Small but could scale
  } else if (mcapB > 20 && mcapB <= 100) {
    tamScore += 1; // Large, harder to grow fast
  }

  breakdown["TAM Proxy"] = { score: tamScore, max: 10 };

  // -------------------------------------------------------------------------
  // Total Score
  // -------------------------------------------------------------------------
  const totalScore =
    revenueGrowthScore + durabilityScore + scalabilityScore + momentumScore + tamScore;

  return {
    score: Math.min(100, Math.round(totalScore)),
    breakdown,
  };
}

// ============================================================================
// Combined Score
// ============================================================================

export interface SectorFlags {
  isFinancial: boolean;
  isREIT: boolean;
  highGearingWarning: boolean; // For SG REITs with gearing > 45%
}

export interface AllModeScoresWithFlags extends AllModeScores {
  sectorFlags: SectorFlags;
  /** If sector-specific scoring was used, this contains the alternate score */
  sectorScore?: ModeScore;
}

/**
 * Calculate all three mode scores plus combined.
 * For Financial Services (banks) and REITs, uses sector-specific scoring.
 * Combined = simple average of Quant + Value + Growth
 */
export function calculateAllModeScores(
  stock: YahooStockData,
  market: Market = "US"
): AllModeScores {
  const result = calculateAllModeScoresWithFlags(stock, market);
  // Return base type for backwards compatibility
  return {
    quantScore: result.quantScore,
    valueScore: result.valueScore,
    growthScore: result.growthScore,
    combinedScore: result.combinedScore,
    quantBreakdown: result.quantBreakdown,
    valueBreakdown: result.valueBreakdown,
    growthBreakdown: result.growthBreakdown,
    fScore: result.fScore,
    fScoreCategory: result.fScoreCategory,
    academicScore: result.academicScore,
  };
}

/**
 * Calculate all mode scores with sector-specific handling and flags.
 * - Financial Services (banks, insurance): Uses ROE, ROA, P/E, P/B scoring
 * - REITs: Uses Dividend Yield, P/NAV, Gearing scoring
 */
export function calculateAllModeScoresWithFlags(
  stock: YahooStockData,
  market: Market = "US"
): AllModeScoresWithFlags {
  const isFinancial = isFinancialSector(stock.sector);
  const reit = isREIT(stock.industry);
  const highGearingWarning = isHighGearingREIT(stock.debtToEquity, market, stock.industry);

  const sectorFlags: SectorFlags = {
    isFinancial,
    isREIT: reit,
    highGearingWarning,
  };

  // Extract F-Score and academic factors if available
  const fScore = stock.piotroskiFScore?.fScore;
  const fScoreCategory = stock.piotroskiFScore?.category;
  const academicScore = stock.academicFactors?.academicScore;

  // For Financial Services, use specialized scoring
  if (isFinancial) {
    const financialScore = calculateFinancialServicesScore(stock, market);
    // Still calculate regular scores for comparison, but combined uses financial score
    const quant = calculateQuantScore(stock, market);
    const value = calculateValueScore(stock, market);
    const growth = calculateGrowthScore(stock, market);

    // For banks, weight the financial score heavily
    // Combined = 60% Financial Services score + 40% average of other modes
    const otherAvg = (quant.score + value.score + growth.score) / 3;
    const combinedScore = Math.round(financialScore.score * 0.6 + otherAvg * 0.4);

    return {
      quantScore: quant.score,
      valueScore: value.score,
      growthScore: growth.score,
      combinedScore,
      quantBreakdown: quant.breakdown,
      valueBreakdown: value.breakdown,
      growthBreakdown: growth.breakdown,
      sectorFlags,
      sectorScore: financialScore,
      fScore,
      fScoreCategory,
      academicScore,
    };
  }

  // For REITs, use specialized scoring
  if (reit) {
    const reitScore = calculateREITScore(stock, market);
    const quant = calculateQuantScore(stock, market);
    const value = calculateValueScore(stock, market);
    const growth = calculateGrowthScore(stock, market);

    // For REITs, weight the REIT-specific score heavily
    // Combined = 60% REIT score + 40% average of other modes
    const otherAvg = (quant.score + value.score + growth.score) / 3;
    const combinedScore = Math.round(reitScore.score * 0.6 + otherAvg * 0.4);

    return {
      quantScore: quant.score,
      valueScore: value.score,
      growthScore: growth.score,
      combinedScore,
      quantBreakdown: quant.breakdown,
      valueBreakdown: value.breakdown,
      growthBreakdown: growth.breakdown,
      sectorFlags,
      sectorScore: reitScore,
      fScore,
      fScoreCategory,
      academicScore,
    };
  }

  // Standard scoring for all other sectors
  const quant = calculateQuantScore(stock, market);
  const value = calculateValueScore(stock, market);
  const growth = calculateGrowthScore(stock, market);

  const combinedScore = Math.round((quant.score + value.score + growth.score) / 3);

  return {
    quantScore: quant.score,
    valueScore: value.score,
    growthScore: growth.score,
    combinedScore,
    quantBreakdown: quant.breakdown,
    valueBreakdown: value.breakdown,
    growthBreakdown: growth.breakdown,
    sectorFlags,
    fScore,
    fScoreCategory,
    academicScore,
  };
}

// ============================================================================
// Helper Calculations
// ============================================================================

function calculateFCFYield(stock: YahooStockData): number {
  const fcf = safeNum(stock.freeCashflow);
  const mcap = safeNum(stock.marketCap);
  if (mcap > 0 && fcf !== 0) {
    return fcf / mcap;
  }
  return 0;
}

function calculateFCFMargin(stock: YahooStockData): number {
  const fcf = safeNum(stock.freeCashflow);
  const revenue = safeNum(stock.totalRevenue);
  if (revenue > 0 && fcf !== 0) {
    return fcf / revenue;
  }
  return 0;
}

// ============================================================================
// Tier Classification (based on Combined Score)
// ============================================================================

export function getTierFromCombinedScore(score: number): {
  tier: string;
  tierColor: string;
} {
  if (score >= 80) return { tier: "HIGH CONVICTION", tierColor: "green" };
  if (score >= 65) return { tier: "WATCHLIST", tierColor: "blue" };
  if (score >= 50) return { tier: "SPECULATIVE", tierColor: "yellow" };
  return { tier: "AVOID", tierColor: "red" };
}
