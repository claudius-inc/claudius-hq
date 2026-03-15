/**
 * Expected Returns API
 * 
 * Fetches current valuations for major asset classes and calculates
 * expected 10-year real returns based on historical relationships.
 */

import { NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";
import { getCache, setCache } from "@/lib/market-cache";
import { logger } from "@/lib/logger";
import type {
  ExpectedReturnsResponse,
  AssetValuation,
  AssetSymbol,
} from "@/lib/valuation/types";
import {
  calculateSpyValuation,
  calculateGoldValuation,
  calculateBtcValuation,
  calculateBondValuation,
  getBtcCyclePosition,
  determineTacticalSignal,
  determineMomentum,
  rankAssetsByExpectedReturn,
} from "@/lib/valuation/expected-returns";

export const dynamic = "force-dynamic";

const CACHE_KEY = "valuation:expected-returns";
const CACHE_MAX_AGE = 60 * 60; // 1 hour

const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

interface QuoteResult {
  regularMarketPrice?: number;
  trailingPE?: number;
  twoHundredDayAverage?: number;
}

interface FredObservation {
  date: string;
  value: string;
}

interface FredResponse {
  observations: FredObservation[];
}

// Fetch M2 money supply from FRED
async function fetchM2(): Promise<number | null> {
  const apiKey = process.env.FRED_API_KEY;
  if (!apiKey) return null;

  try {
    const url = `https://api.stlouisfed.org/fred/series/observations?series_id=M2SL&api_key=${apiKey}&file_type=json&sort_order=desc&limit=1`;
    const res = await fetch(url, { cache: "no-store" });

    if (!res.ok) {
      logger.error("api/valuation/expected-returns", `FRED M2 error: ${res.status}`);
      return null;
    }

    const data: FredResponse = await res.json();
    if (data.observations.length === 0 || data.observations[0].value === ".") {
      return null;
    }

    // M2 is in billions
    return parseFloat(data.observations[0].value);
  } catch (error) {
    logger.error("api/valuation/expected-returns", "Error fetching M2", { error });
    return null;
  }
}

// Fetch Yahoo Finance quote with 200 DMA
async function fetchQuote(
  symbol: string
): Promise<{ price: number; sma200: number; pe?: number } | null> {
  try {
    const quote = (await yahooFinance.quote(symbol)) as QuoteResult;

    if (!quote.regularMarketPrice) return null;

    return {
      price: quote.regularMarketPrice,
      sma200: quote.twoHundredDayAverage || quote.regularMarketPrice,
      pe: quote.trailingPE,
    };
  } catch (error) {
    logger.error("api/valuation/expected-returns", `Error fetching ${symbol}`, { error });
    return null;
  }
}

// Fetch historical data for 200 DMA calculation
async function fetch200DMA(symbol: string): Promise<number | null> {
  try {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 300); // ~200 trading days

    const chart = await yahooFinance.chart(symbol, {
      period1: startDate,
      period2: endDate,
      interval: "1d",
    });

    const closes = chart.quotes
      .map((q) => q.close)
      .filter((c): c is number => c !== null && c !== undefined);

    if (closes.length < 200) return null;

    const last200 = closes.slice(-200);
    return last200.reduce((a, b) => a + b, 0) / 200;
  } catch (error) {
    logger.error("api/valuation/expected-returns", `Error fetching 200DMA for ${symbol}`, { error });
    return null;
  }
}

async function fetchExpectedReturnsData(): Promise<ExpectedReturnsResponse> {
  const assets: AssetValuation[] = [];

  // Fetch all data in parallel
  const [spyData, gldData, btcData, tnxData, m2] = await Promise.all([
    fetchQuote("SPY"),
    fetchQuote("GLD"),
    fetchQuote("BTC-USD"),
    fetchQuote("^TNX"),
    fetchM2(),
  ]);

  // Also fetch 200 DMAs in parallel for tactical signals
  const [btcSma200] = await Promise.all([
    btcData ? fetch200DMA("BTC-USD") : Promise.resolve(null),
  ]);

  // ---------------------------------------------------------------------------
  // S&P 500
  // ---------------------------------------------------------------------------
  if (spyData) {
    // Use trailing PE if available, otherwise estimate ~30 (current market)
    const pe = spyData.pe ?? 30;
    const { valuation, expectedReturn } = calculateSpyValuation(pe);
    const vs200dma = determineTacticalSignal(spyData.price, spyData.sma200);

    assets.push({
      symbol: "SPY",
      name: "S&P 500",
      price: Math.round(spyData.price * 100) / 100,
      valuation,
      expectedReturn,
      tactical: {
        vs200dma,
        momentum: determineMomentum(vs200dma),
      },
    });
  }

  // ---------------------------------------------------------------------------
  // Gold
  // ---------------------------------------------------------------------------
  if (gldData && m2) {
    // GLD tracks gold at ~1/10 of spot price, so estimate spot
    const goldSpot = gldData.price * 10;
    // Gold/M2 ratio (M2 is in billions, gold in USD)
    const goldM2Ratio = goldSpot / m2;
    const { valuation, expectedReturn } = calculateGoldValuation(goldM2Ratio);
    const vs200dma = determineTacticalSignal(gldData.price, gldData.sma200);

    assets.push({
      symbol: "GLD",
      name: "Gold",
      price: Math.round(goldSpot * 100) / 100,
      valuation,
      expectedReturn,
      tactical: {
        vs200dma,
        momentum: determineMomentum(vs200dma),
      },
    });
  } else if (gldData) {
    // Fallback: no M2 data, use simple valuation
    const goldSpot = gldData.price * 10;
    const vs200dma = determineTacticalSignal(gldData.price, gldData.sma200);

    assets.push({
      symbol: "GLD",
      name: "Gold",
      price: Math.round(goldSpot * 100) / 100,
      valuation: {
        metric: "Au/M2",
        value: 0,
        percentile: 50,
        zone: "fair",
      },
      expectedReturn: {
        tenYear: 3,
        confidence: "low",
      },
      tactical: {
        vs200dma,
        momentum: determineMomentum(vs200dma),
      },
    });
  }

  // ---------------------------------------------------------------------------
  // Bitcoin
  // ---------------------------------------------------------------------------
  if (btcData) {
    const cycleYear = getBtcCyclePosition();
    const { valuation, expectedReturn } = calculateBtcValuation(cycleYear);
    const sma200 = btcSma200 || btcData.sma200;
    const vs200dma = determineTacticalSignal(btcData.price, sma200);

    assets.push({
      symbol: "BTC",
      name: "Bitcoin",
      price: Math.round(btcData.price),
      valuation: {
        ...valuation,
        metric: `Yr ${Math.ceil(cycleYear)}`,
      },
      expectedReturn,
      tactical: {
        vs200dma,
        momentum: determineMomentum(vs200dma),
      },
    });
  }

  // ---------------------------------------------------------------------------
  // Bonds (10Y Treasury)
  // ---------------------------------------------------------------------------
  if (tnxData) {
    // ^TNX is already the yield percentage
    const yield10y = tnxData.price;
    const { valuation, expectedReturn } = calculateBondValuation(yield10y);

    assets.push({
      symbol: "TLT",
      name: "10Y Bonds",
      price: yield10y,
      valuation,
      expectedReturn,
      tactical: {
        vs200dma: "at", // Yields don't have meaningful 200 DMA signals
        momentum: "neutral",
      },
    });
  }

  // Calculate ranking
  const relativeRanking = rankAssetsByExpectedReturn(assets) as AssetSymbol[];

  return {
    assets,
    relativeRanking,
    updatedAt: new Date().toISOString(),
    status: assets.length === 4 ? "live" : assets.length > 0 ? "partial" : "error",
  };
}

export async function GET() {
  try {
    // Check cache first
    const cached = await getCache<ExpectedReturnsResponse>(CACHE_KEY, CACHE_MAX_AGE);

    if (cached && !cached.isStale) {
      return NextResponse.json(cached.data);
    }

    // Fetch fresh data
    const data = await fetchExpectedReturnsData();

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
    logger.error("api/valuation/expected-returns", "Error in GET", { error });

    // Try to return cached data on error
    const cached = await getCache<ExpectedReturnsResponse>(CACHE_KEY, CACHE_MAX_AGE * 2);
    if (cached) {
      return NextResponse.json({
        ...cached.data,
        status: "partial",
        error: "Using cached data due to error",
      });
    }

    return NextResponse.json(
      {
        assets: [],
        relativeRanking: [],
        updatedAt: new Date().toISOString(),
        status: "error",
        error: "Failed to fetch valuation data",
      },
      { status: 500 }
    );
  }
}
