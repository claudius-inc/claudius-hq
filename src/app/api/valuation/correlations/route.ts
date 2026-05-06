/**
 * Correlation Matrix API
 * 
 * Fetches 60 days of daily returns for major asset classes
 * and calculates pairwise correlation matrix with deviation alerts.
 */

import { NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";
import { getCache, setCache } from "@/lib/cache/market-cache";
import { logger } from "@/lib/logger";
import {
  calculateDailyReturns,
  buildCorrelationMatrix,
  generateCorrelationAlerts,
  type CorrelationAsset,
  type CorrelationsResponse,
} from "@/lib/valuation/correlations";

export const dynamic = "force-dynamic";

const CACHE_KEY = "valuation:correlations";
const CACHE_MAX_AGE = 4 * 60 * 60; // 4 hours

const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

// Asset symbols for Yahoo Finance
const ASSET_SYMBOLS: Record<CorrelationAsset, string> = {
  SPY: "SPY",
  GLD: "GLD",
  BTC: "BTC-USD",
  TLT: "TLT",
  DXY: "DX-Y.NYB", // Dollar Index
};

/**
 * Fetch historical daily prices for an asset
 */
async function fetchHistoricalPrices(
  symbol: string,
  days: number = 90 // Fetch extra for 60 trading days
): Promise<number[]> {
  try {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const chart = await yahooFinance.chart(symbol, {
      period1: startDate,
      period2: endDate,
      interval: "1d",
    });

    const prices = chart.quotes
      .map((q) => q.close)
      .filter((c): c is number => c !== null && c !== undefined);

    return prices;
  } catch (error) {
    logger.error("api/valuation/correlations", `Error fetching ${symbol}`, { error });
    return [];
  }
}

/**
 * Fetch all asset prices and calculate correlations
 */
async function fetchCorrelationData(): Promise<CorrelationsResponse> {
  const assets = Object.keys(ASSET_SYMBOLS) as CorrelationAsset[];
  
  // Fetch all historical prices in parallel
  const pricePromises = assets.map(async (asset) => {
    const symbol = ASSET_SYMBOLS[asset];
    const prices = await fetchHistoricalPrices(symbol);
    return { asset, prices };
  });

  const priceResults = await Promise.all(pricePromises);

  // Build returns object
  const returns: Partial<Record<CorrelationAsset, number[]>> = {};
  let minLength = Infinity;

  for (const { asset, prices } of priceResults) {
    if (prices.length >= 30) {
      const dailyReturns = calculateDailyReturns(prices);
      returns[asset] = dailyReturns;
      minLength = Math.min(minLength, dailyReturns.length);
    }
  }

  // Check if we have enough data
  const validAssets = Object.keys(returns) as CorrelationAsset[];
  if (validAssets.length < 3) {
    return {
      matrix: {},
      alerts: [],
      period: "60d",
      updatedAt: new Date().toISOString(),
      status: "error",
      error: "Insufficient price data available",
    };
  }

  // Trim all return arrays to same length (use last N days)
  const trimmedReturns: Record<CorrelationAsset, number[]> = {} as Record<CorrelationAsset, number[]>;
  const targetLength = Math.min(minLength, 60); // Use up to 60 days

  for (const asset of validAssets) {
    const assetReturns = returns[asset]!;
    trimmedReturns[asset] = assetReturns.slice(-targetLength);
  }

  // Build correlation matrix
  const matrix = buildCorrelationMatrix(trimmedReturns);

  // Generate alerts for unusual correlations
  const alerts = generateCorrelationAlerts(matrix);

  return {
    matrix,
    alerts,
    period: `${targetLength}d`,
    updatedAt: new Date().toISOString(),
    status: validAssets.length === 5 ? "live" : "partial",
  };
}

export async function GET() {
  try {
    // Check cache first
    const cached = await getCache<CorrelationsResponse>(CACHE_KEY, CACHE_MAX_AGE);

    if (cached && !cached.isStale) {
      return NextResponse.json(cached.data);
    }

    // Fetch fresh data
    const data = await fetchCorrelationData();

    // Cache the result
    await setCache(CACHE_KEY, data);

    // If we had stale cache and fetch failed, return stale data
    if (data.status === "error" && cached) {
      return NextResponse.json({
        ...cached.data,
        status: "partial",
        error: "Using cached data due to fetch error",
      });
    }

    return NextResponse.json(data);
  } catch (error) {
    logger.error("api/valuation/correlations", "Error in GET", { error });

    // Try to return cached data on error
    const cached = await getCache<CorrelationsResponse>(CACHE_KEY, CACHE_MAX_AGE * 2);
    if (cached) {
      return NextResponse.json({
        ...cached.data,
        status: "partial",
        error: "Using cached data due to error",
      });
    }

    return NextResponse.json(
      {
        matrix: {},
        alerts: [],
        period: "60d",
        updatedAt: new Date().toISOString(),
        status: "error",
        error: "Failed to fetch correlation data",
      },
      { status: 500 }
    );
  }
}
