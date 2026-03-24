/**
 * Enhanced metrics fetcher for ACP stock scan.
 * Provides institutional-grade data: sector rotation, earnings, ownership, fundamentals.
 */

import YahooFinance from "yahoo-finance2";
import { logger } from "@/lib/logger";

const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

// Rate limiting: 400ms between requests
const RATE_LIMIT_MS = 400;
let lastRequestTime = 0;

async function rateLimit(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < RATE_LIMIT_MS) {
    await new Promise((resolve) => setTimeout(resolve, RATE_LIMIT_MS - elapsed));
  }
  lastRequestTime = Date.now();
}

// Sector classification for rotation analysis
export const SECTOR_TYPE: Record<string, "cyclical" | "defensive" | "growth" | "mixed"> = {
  "Technology": "growth",
  "Communication Services": "growth",
  "Consumer Cyclical": "cyclical",
  "Consumer Discretionary": "cyclical",
  "Financial Services": "cyclical",
  "Financials": "cyclical",
  "Industrials": "cyclical",
  "Basic Materials": "cyclical",
  "Materials": "cyclical",
  "Energy": "cyclical",
  "Real Estate": "mixed",
  "Consumer Defensive": "defensive",
  "Consumer Staples": "defensive",
  "Healthcare": "defensive",
  "Health Care": "defensive",
  "Utilities": "defensive",
};

// Market cap tier classification (in billions USD)
export function getMarketCapTier(mcapBillions: number): {
  tier: "mega" | "large" | "mid" | "small" | "micro";
  label: string;
} {
  if (mcapBillions >= 200) return { tier: "mega", label: "Mega Cap ($200B+)" };
  if (mcapBillions >= 10) return { tier: "large", label: "Large Cap ($10-200B)" };
  if (mcapBillions >= 2) return { tier: "mid", label: "Mid Cap ($2-10B)" };
  if (mcapBillions >= 0.3) return { tier: "small", label: "Small Cap ($300M-2B)" };
  return { tier: "micro", label: "Micro Cap (<$300M)" };
}

export interface EnhancedStockMetrics {
  // Sector rotation
  sector: string | null;
  sectorType: "cyclical" | "defensive" | "growth" | "mixed" | null;
  industry: string | null;
  
  // Market cap tier
  marketCapTier: "mega" | "large" | "mid" | "small" | "micro";
  marketCapLabel: string;
  
  // Fundamental quality metrics
  fcfYield: number | null;  // Free cash flow yield
  roic: number | null;      // Return on invested capital (approximated)
  debtToEquity: number | null;
  currentRatio: number | null;
  
  // Earnings surprise history
  earningsSurprises: {
    quarter: string;
    actualEPS: number;
    estimatedEPS: number;
    surprisePct: number;
  }[];
  avgEarningsSurprise: number | null;
  consecutiveBeats: number;
  
  // Institutional ownership
  institutionalOwnership: number | null;
  insiderOwnership: number | null;
  shortInterest: number | null;
  shortPercentFloat: number | null;
  
  // Analyst consensus
  analystRating: {
    mean: number | null;  // 1=Strong Buy, 5=Strong Sell
    label: string;
    strongBuy: number;
    buy: number;
    hold: number;
    sell: number;
    strongSell: number;
    total: number;
    targetPrice: number | null;
    targetUpside: number | null;  // % upside to target
  };
  
  // Relative strength vs SPY (performance comparison)
  relativeStrength: {
    vs1m: number | null;  // 1-month excess return vs SPY
    vs3m: number | null;  // 3-month excess return vs SPY
    vs6m: number | null;  // 6-month excess return vs SPY
    rating: "strong" | "positive" | "neutral" | "weak" | "lagging";
  };
  
  // Price momentum
  priceChange1m: number | null;
  priceChange3m: number | null;
  priceChange6m: number | null;
  priceChangeYTD: number | null;
  fiftyTwoWeekHigh: number | null;
  fiftyTwoWeekLow: number | null;
  percentFromHigh: number | null;
  
  // Quality flags
  qualityFlags: string[];
  riskFlags: string[];
}

/**
 * Fetch enhanced metrics for a single ticker.
 */
export async function fetchEnhancedMetrics(
  ticker: string,
  currentPrice: number,
  marketCapB: number
): Promise<EnhancedStockMetrics | null> {
  await rateLimit();
  
  try {
    const [quoteSummary, historical] = await Promise.all([
      yahooFinance.quoteSummary(ticker, {
        modules: [
          "assetProfile",
          "defaultKeyStatistics",
          "financialData",
          "earnings",
          "earningsHistory",
          "recommendationTrend",
          "upgradeDowngradeHistory",
        ],
      }).catch(() => null),
      yahooFinance.historical(ticker, {
        period1: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000),
        period2: new Date(),
        interval: "1d",
      }).catch(() => [] as Array<{ date: Date; close: number | null }>),
    ]);
    
    if (!quoteSummary) {
      logger.warn("enhanced-metrics", `No quote summary for ${ticker}`);
      return null;
    }
    
    const profile = quoteSummary.assetProfile;
    const keyStats = quoteSummary.defaultKeyStatistics;
    const financials = quoteSummary.financialData;
    const earnings = quoteSummary.earnings;
    const earningsHistory = quoteSummary.earningsHistory;
    const recommendations = quoteSummary.recommendationTrend;
    
    // Sector classification
    const sector = profile?.sector ?? null;
    const sectorType = sector ? (SECTOR_TYPE[sector] ?? "mixed") : null;
    const industry = profile?.industry ?? null;
    
    // Market cap tier
    const { tier: marketCapTier, label: marketCapLabel } = getMarketCapTier(marketCapB);
    
    // FCF Yield = Free Cash Flow / Market Cap
    const fcf = financials?.freeCashflow ?? null;
    const fcfYield = fcf !== null && marketCapB > 0
      ? (fcf / (marketCapB * 1e9)) * 100
      : null;
    
    // Approximate ROIC = Operating Income / (Total Debt + Total Equity - Cash)
    // Simplified: use ROE as proxy if ROIC not directly available
    const roe = financials?.returnOnEquity ?? null;
    const roic = roe !== null ? roe * 100 : null;
    
    // Debt ratios
    const debtToEquity = financials?.debtToEquity ?? null;
    const currentRatio = financials?.currentRatio ?? null;
    
    // Earnings surprise history
    const earningsSurprises: EnhancedStockMetrics["earningsSurprises"] = [];
    let consecutiveBeats = 0;
    let totalSurprise = 0;
    
    // Use earningsHistory for actual vs estimated
    const history = (earningsHistory as { history?: Array<{
      epsActual?: { raw?: number };
      epsEstimate?: { raw?: number };
      epsDifference?: { raw?: number };
      quarter?: { fmt?: string };
    }> } | undefined)?.history ?? [];
    
    for (const item of history.slice(0, 4)) {
      const actual = item?.epsActual?.raw;
      const estimated = item?.epsEstimate?.raw;
      const quarter = item?.quarter?.fmt ?? "Q?";
      
      if (actual !== undefined && estimated !== undefined && estimated !== 0) {
        const surprisePct = ((actual - estimated) / Math.abs(estimated)) * 100;
        earningsSurprises.push({
          quarter,
          actualEPS: actual,
          estimatedEPS: estimated,
          surprisePct,
        });
        totalSurprise += surprisePct;
      }
    }
    
    // Count consecutive beats (from most recent)
    for (const surprise of earningsSurprises) {
      if (surprise.surprisePct > 0) {
        consecutiveBeats++;
      } else {
        break;
      }
    }
    
    const avgEarningsSurprise = earningsSurprises.length > 0
      ? totalSurprise / earningsSurprises.length
      : null;
    
    // Institutional ownership
    const institutionalOwnership = keyStats?.heldPercentInstitutions
      ? keyStats.heldPercentInstitutions * 100
      : null;
    const insiderOwnership = keyStats?.heldPercentInsiders
      ? keyStats.heldPercentInsiders * 100
      : null;
    const shortInterest = keyStats?.sharesShort ?? null;
    const shortPercentFloat = keyStats?.shortPercentOfFloat
      ? keyStats.shortPercentOfFloat * 100
      : null;
    
    // Analyst consensus
    const recMean = financials?.recommendationMean ?? null;
    const recKey = financials?.recommendationKey ?? null;
    const targetPrice = financials?.targetMeanPrice ?? null;
    
    // Parse recommendation trend for detailed counts
    const trend = recommendations?.trend?.[0] ?? {};
    const analystRating: EnhancedStockMetrics["analystRating"] = {
      mean: recMean,
      label: recKey ? recKey.replace(/_/g, " ").toUpperCase() : getAnalystLabel(recMean),
      strongBuy: (trend as { strongBuy?: number }).strongBuy ?? 0,
      buy: (trend as { buy?: number }).buy ?? 0,
      hold: (trend as { hold?: number }).hold ?? 0,
      sell: (trend as { sell?: number }).sell ?? 0,
      strongSell: (trend as { strongSell?: number }).strongSell ?? 0,
      total: 0,
      targetPrice,
      targetUpside: targetPrice && currentPrice > 0
        ? ((targetPrice - currentPrice) / currentPrice) * 100
        : null,
    };
    analystRating.total = analystRating.strongBuy + analystRating.buy + 
      analystRating.hold + analystRating.sell + analystRating.strongSell;
    
    // Calculate relative strength vs SPY
    const relativeStrength = await calculateRelativeStrength(ticker, historical as Array<{ date: Date; close: number | null }>);
    
    // Price momentum from historical data
    const prices = (historical as Array<{ date: Date; close: number | null }>)
      .filter((h) => h.close !== null)
      .map((h) => ({ date: h.date, price: h.close as number }));
    
    const priceNow = currentPrice;
    const price1m = findPriceAtOffset(prices, 22);
    const price3m = findPriceAtOffset(prices, 66);
    const price6m = findPriceAtOffset(prices, 132);
    const priceYTD = findPriceAtYearStart(prices);
    
    const priceChange1m = price1m ? ((priceNow - price1m) / price1m) * 100 : null;
    const priceChange3m = price3m ? ((priceNow - price3m) / price3m) * 100 : null;
    const priceChange6m = price6m ? ((priceNow - price6m) / price6m) * 100 : null;
    const priceChangeYTD = priceYTD ? ((priceNow - priceYTD) / priceYTD) * 100 : null;
    
    const fiftyTwoWeekHigh = typeof keyStats?.fiftyTwoWeekHigh === "number" 
      ? keyStats.fiftyTwoWeekHigh 
      : null;
    const fiftyTwoWeekLow = typeof keyStats?.fiftyTwoWeekLow === "number" 
      ? keyStats.fiftyTwoWeekLow 
      : null;
    const percentFromHigh = fiftyTwoWeekHigh !== null && currentPrice > 0
      ? ((currentPrice - fiftyTwoWeekHigh) / fiftyTwoWeekHigh) * 100
      : null;
    
    // Quality and risk flags
    const qualityFlags: string[] = [];
    const riskFlags: string[] = [];
    
    // Quality signals
    if (fcfYield !== null && fcfYield > 5) qualityFlags.push("Strong FCF yield");
    if (roic !== null && roic > 15) qualityFlags.push("High ROIC");
    if (consecutiveBeats >= 4) qualityFlags.push("4+ consecutive earnings beats");
    if (avgEarningsSurprise !== null && avgEarningsSurprise > 5) qualityFlags.push("Consistent earnings beats");
    if (debtToEquity !== null && debtToEquity < 0.5) qualityFlags.push("Low debt");
    if (analystRating.mean !== null && analystRating.mean < 2) qualityFlags.push("Strong Buy consensus");
    if (relativeStrength.rating === "strong") qualityFlags.push("Strong relative strength vs SPY");
    if (institutionalOwnership !== null && institutionalOwnership > 70) qualityFlags.push("High institutional ownership");
    
    // Risk signals
    if (shortPercentFloat !== null && shortPercentFloat > 20) riskFlags.push("High short interest");
    if (debtToEquity !== null && debtToEquity > 2) riskFlags.push("High leverage");
    if (currentRatio !== null && currentRatio < 1) riskFlags.push("Liquidity concern");
    if (percentFromHigh !== null && percentFromHigh < -40) riskFlags.push("Down >40% from highs");
    if (avgEarningsSurprise !== null && avgEarningsSurprise < -5) riskFlags.push("Consistent earnings misses");
    if (relativeStrength.rating === "lagging") riskFlags.push("Lagging SPY significantly");
    if (analystRating.mean !== null && analystRating.mean > 3.5) riskFlags.push("Bearish analyst consensus");
    
    return {
      sector,
      sectorType,
      industry,
      marketCapTier,
      marketCapLabel,
      fcfYield: fcfYield !== null ? Math.round(fcfYield * 100) / 100 : null,
      roic: roic !== null ? Math.round(roic * 100) / 100 : null,
      debtToEquity: debtToEquity !== null ? Math.round(debtToEquity * 100) / 100 : null,
      currentRatio: currentRatio !== null ? Math.round(currentRatio * 100) / 100 : null,
      earningsSurprises,
      avgEarningsSurprise: avgEarningsSurprise !== null ? Math.round(avgEarningsSurprise * 100) / 100 : null,
      consecutiveBeats,
      institutionalOwnership: institutionalOwnership !== null ? Math.round(institutionalOwnership * 10) / 10 : null,
      insiderOwnership: insiderOwnership !== null ? Math.round(insiderOwnership * 10) / 10 : null,
      shortInterest,
      shortPercentFloat: shortPercentFloat !== null ? Math.round(shortPercentFloat * 10) / 10 : null,
      analystRating,
      relativeStrength,
      priceChange1m: priceChange1m !== null ? Math.round(priceChange1m * 100) / 100 : null,
      priceChange3m: priceChange3m !== null ? Math.round(priceChange3m * 100) / 100 : null,
      priceChange6m: priceChange6m !== null ? Math.round(priceChange6m * 100) / 100 : null,
      priceChangeYTD: priceChangeYTD !== null ? Math.round(priceChangeYTD * 100) / 100 : null,
      fiftyTwoWeekHigh,
      fiftyTwoWeekLow,
      percentFromHigh: percentFromHigh !== null ? Math.round(percentFromHigh * 100) / 100 : null,
      qualityFlags,
      riskFlags,
    };
  } catch (error) {
    logger.error("enhanced-metrics", `Failed for ${ticker}`, { error });
    return null;
  }
}

function getAnalystLabel(mean: number | null): string {
  if (mean === null) return "N/A";
  if (mean <= 1.5) return "STRONG BUY";
  if (mean <= 2.5) return "BUY";
  if (mean <= 3.5) return "HOLD";
  if (mean <= 4.5) return "SELL";
  return "STRONG SELL";
}

function findPriceAtOffset(
  prices: { date: Date; price: number }[],
  tradingDaysBack: number
): number | null {
  if (prices.length <= tradingDaysBack) return null;
  return prices[prices.length - 1 - tradingDaysBack]?.price ?? null;
}

function findPriceAtYearStart(
  prices: { date: Date; price: number }[]
): number | null {
  const now = new Date();
  const yearStart = new Date(now.getFullYear(), 0, 1);
  
  // Find first price on or after Jan 1
  for (const p of prices) {
    if (p.date >= yearStart) return p.price;
  }
  return null;
}

// SPY cache for relative strength calculation
let spyHistoricalCache: { date: Date; close: number }[] | null = null;
let spyCacheTime = 0;
const SPY_CACHE_TTL = 60 * 60 * 1000; // 1 hour

async function getSpyHistorical(): Promise<{ date: Date; close: number }[]> {
  const now = Date.now();
  if (spyHistoricalCache && now - spyCacheTime < SPY_CACHE_TTL) {
    return spyHistoricalCache;
  }
  
  try {
    const result = await yahooFinance.historical("SPY", {
      period1: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000),
      period2: new Date(),
      interval: "1d",
    });
    
    spyHistoricalCache = (result as Array<{ date: Date; close: number | null }>)
      .filter((h) => h.close !== null)
      .map((h) => ({ date: h.date, close: h.close as number }));
    spyCacheTime = now;
    
    return spyHistoricalCache;
  } catch (error) {
    logger.error("enhanced-metrics", "Failed to fetch SPY historical", { error });
    return [];
  }
}

async function calculateRelativeStrength(
  ticker: string,
  stockHistorical: { date: Date; close: number | null }[]
): Promise<EnhancedStockMetrics["relativeStrength"]> {
  const defaultResult = {
    vs1m: null,
    vs3m: null,
    vs6m: null,
    rating: "neutral" as const,
  };
  
  try {
    const spyData = await getSpyHistorical();
    if (spyData.length < 132) return defaultResult;
    
    const stockPrices = stockHistorical
      .filter((h) => h.close !== null)
      .map((h) => ({ date: h.date, price: h.close as number }));
    
    if (stockPrices.length < 132) return defaultResult;
    
    // Calculate returns for both
    const stockNow = stockPrices[stockPrices.length - 1].price;
    const stock1m = findPriceAtOffset(stockPrices.map(p => ({ date: p.date, price: p.price })), 22);
    const stock3m = findPriceAtOffset(stockPrices.map(p => ({ date: p.date, price: p.price })), 66);
    const stock6m = findPriceAtOffset(stockPrices.map(p => ({ date: p.date, price: p.price })), 132);
    
    const spyNow = spyData[spyData.length - 1].close;
    const spy1m = spyData.length > 22 ? spyData[spyData.length - 23]?.close : null;
    const spy3m = spyData.length > 66 ? spyData[spyData.length - 67]?.close : null;
    const spy6m = spyData.length > 132 ? spyData[spyData.length - 133]?.close : null;
    
    const stockReturn1m = stock1m ? ((stockNow - stock1m) / stock1m) * 100 : null;
    const stockReturn3m = stock3m ? ((stockNow - stock3m) / stock3m) * 100 : null;
    const stockReturn6m = stock6m ? ((stockNow - stock6m) / stock6m) * 100 : null;
    
    const spyReturn1m = spy1m ? ((spyNow - spy1m) / spy1m) * 100 : null;
    const spyReturn3m = spy3m ? ((spyNow - spy3m) / spy3m) * 100 : null;
    const spyReturn6m = spy6m ? ((spyNow - spy6m) / spy6m) * 100 : null;
    
    const vs1m = stockReturn1m !== null && spyReturn1m !== null
      ? Math.round((stockReturn1m - spyReturn1m) * 100) / 100
      : null;
    const vs3m = stockReturn3m !== null && spyReturn3m !== null
      ? Math.round((stockReturn3m - spyReturn3m) * 100) / 100
      : null;
    const vs6m = stockReturn6m !== null && spyReturn6m !== null
      ? Math.round((stockReturn6m - spyReturn6m) * 100) / 100
      : null;
    
    // Calculate rating based on average relative performance
    const validVs = [vs1m, vs3m, vs6m].filter((v) => v !== null) as number[];
    const avgVs = validVs.length > 0
      ? validVs.reduce((a, b) => a + b, 0) / validVs.length
      : 0;
    
    let rating: EnhancedStockMetrics["relativeStrength"]["rating"];
    if (avgVs > 10) rating = "strong";
    else if (avgVs > 3) rating = "positive";
    else if (avgVs >= -3) rating = "neutral";
    else if (avgVs >= -10) rating = "weak";
    else rating = "lagging";
    
    return { vs1m, vs3m, vs6m, rating };
  } catch (error) {
    logger.error("enhanced-metrics", `RS calc failed for ${ticker}`, { error });
    return defaultResult;
  }
}

/**
 * Batch fetch enhanced metrics for multiple tickers.
 */
export async function batchFetchEnhancedMetrics(
  stocks: Array<{ ticker: string; price: number; mcapB: string }>,
  onProgress?: (ticker: string, index: number, total: number) => void
): Promise<Map<string, EnhancedStockMetrics>> {
  const results = new Map<string, EnhancedStockMetrics>();
  
  for (let i = 0; i < stocks.length; i++) {
    const stock = stocks[i];
    if (onProgress) onProgress(stock.ticker, i, stocks.length);
    
    try {
      const mcapB = parseFloat(stock.mcapB.replace(/[^0-9.]/g, "")) || 0;
      const metrics = await fetchEnhancedMetrics(stock.ticker, stock.price, mcapB);
      if (metrics) {
        results.set(stock.ticker, metrics);
      }
    } catch (error) {
      logger.error("enhanced-metrics", `Batch failed for ${stock.ticker}`, { error });
    }
  }
  
  return results;
}

/**
 * Get sector rotation context based on current regime.
 */
export function getSectorRotationContext(
  sectorType: "cyclical" | "defensive" | "growth" | "mixed" | null
): {
  regime: string;
  favorability: "favorable" | "neutral" | "unfavorable";
  context: string;
} {
  // Simple heuristic — in a real implementation, this would use macro data
  // For now, return neutral context
  if (!sectorType) {
    return {
      regime: "Unknown",
      favorability: "neutral",
      context: "Sector classification unavailable",
    };
  }
  
  // This would ideally check VIX, yield curve, etc.
  // For the ACP offering, we provide the classification for agents to use
  const contextMap: Record<string, string> = {
    cyclical: "Cyclical sector — performs well in economic expansion, underperforms in recession",
    defensive: "Defensive sector — stable during downturns, may lag in strong bull markets",
    growth: "Growth sector — benefits from low rates and risk-on environment",
    mixed: "Mixed sector — performance varies by subsector and market conditions",
  };
  
  return {
    regime: "Current",
    favorability: "neutral",
    context: contextMap[sectorType] ?? "Unknown sector type",
  };
}
