/**
 * POST /api/acp/stock-scan
 * 
 * Stock screening endpoint for US, HK, JP markets.
 * Returns top N stocks ranked by composite score.
 * 
 * Scoring weights: Momentum 35% + Fundamentals 35% + Technicals 30%
 */

import { NextRequest, NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";
import { isApiAuthenticated } from "@/lib/auth";
import { logger } from "@/lib/logger";

// Initialize Yahoo Finance with suppressed notices
const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

// Yahoo Finance types
interface YahooHistoricalBar {
  date: Date;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  volume: number | null;
}
import {
  getTickersForMarket,
  getBenchmarkIndex,
  getMarketCapTier,
  type Market,
} from "../_lib/stock-universe";
import {
  calculateStockMomentumScore,
  calculateStockFundamentalsScore,
  calculateStockTechnicalsScore,
  calculateStockCompositeScore,
  calculateSMA,
  calculateRSI,
  calculateMACDSignal,
  calculatePriceChange,
  getSMACrossoverSignal,
} from "../_lib/scoring";

// ─── Types ───────────────────────────────────────────────────────────────────

interface StockScanRequest {
  market: Market;
  count?: number;
  sector?: string | null;
  min_score?: number;
}

interface StockPick {
  rank: number;
  ticker: string;
  name: string;
  sector: string;
  composite_score: number;
  scores: {
    momentum: number;
    fundamentals: number;
    technicals: number;
  };
  metrics: {
    price_change_1m: number | null;
    price_change_3m: number | null;
    price_change_6m: number | null;
    relative_strength: number | null;
    pe_ratio: number | null;
    pb_ratio: number | null;
    roe: number | null;
    revenue_growth_yoy: number | null;
    profit_margin: number | null;
    sma_50_vs_200: "golden_cross" | "death_cross" | "neutral";
    rsi_14: number | null;
    macd_signal: "bullish" | "bearish" | "neutral";
    above_sma_50: boolean;
    above_sma_200: boolean;
  };
  market_cap: number;
  market_cap_tier: "mega" | "large" | "mid" | "small";
  last_price: number;
  currency: string;
}

interface StockData {
  ticker: string;
  name: string;
  sector: string;
  lastPrice: number;
  marketCap: number;
  currency: string;
  
  // Momentum
  priceChange1m: number | null;
  priceChange3m: number | null;
  priceChange6m: number | null;
  relativeStrength: number | null;
  
  // Fundamentals
  peRatio: number | null;
  pbRatio: number | null;
  roe: number | null;
  revenueGrowthYoY: number | null;
  profitMargin: number | null;
  
  // Technicals
  sma50: number | null;
  sma200: number | null;
  rsi14: number | null;
  macdSignal: "bullish" | "bearish" | "neutral";
}

// ─── Constants ───────────────────────────────────────────────────────────────

const RATE_LIMIT_MS = 100; // 100ms between requests
const MAX_CONCURRENT = 5;
const CACHE_TTL = 900; // 15 minutes

// Simple in-memory cache
const cache = new Map<string, { data: unknown; timestamp: number }>();

// ─── Helper Functions ────────────────────────────────────────────────────────

function getCacheKey(market: string, sector: string | null): string {
  return `scan:stocks:${market}:${sector || "all"}`;
}

function getFromCache<T>(key: string): T | null {
  const cached = cache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL * 1000) {
    return cached.data as T;
  }
  return null;
}

function setCache<T>(key: string, data: T): void {
  cache.set(key, { data, timestamp: Date.now() });
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Fetch stock data from Yahoo Finance
 */
async function fetchStockData(
  ticker: string,
  benchmarkReturns: { oneMonth: number; threeMonth: number; sixMonth: number }
): Promise<StockData | null> {
  try {
    // Fetch quote summary with all needed modules
    const quoteSummary = await yahooFinance.quoteSummary(ticker, {
      modules: ["price", "summaryDetail", "defaultKeyStatistics", "financialData", "summaryProfile"],
    });

    const price = quoteSummary.price;
    const detail = quoteSummary.summaryDetail;
    const keyStats = quoteSummary.defaultKeyStatistics;
    const financial = quoteSummary.financialData;
    const profile = quoteSummary.summaryProfile;

    if (!price?.regularMarketPrice) {
      return null;
    }

    // Fetch historical data for technicals
    const endDate = new Date();
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - 12);

    const historical = await yahooFinance.historical(ticker, {
      period1: startDate,
      period2: endDate,
      interval: "1d",
    }) as YahooHistoricalBar[];

    if (!historical || historical.length < 50) {
      return null;
    }

    const closePrices = historical
      .map((h: YahooHistoricalBar) => h.close)
      .filter((c): c is number => c !== null);
    const currentPrice = price.regularMarketPrice;

    // Calculate price changes
    const priceChange1m = calculatePriceChange(currentPrice, closePrices, 21);
    const priceChange3m = calculatePriceChange(currentPrice, closePrices, 63);
    const priceChange6m = calculatePriceChange(currentPrice, closePrices, 126);

    // Calculate relative strength vs benchmark
    let relativeStrength: number | null = null;
    if (priceChange6m !== null && benchmarkReturns.sixMonth !== 0) {
      relativeStrength = priceChange6m / benchmarkReturns.sixMonth;
    }

    // Calculate technicals
    const sma50 = calculateSMA(closePrices, 50);
    const sma200 = calculateSMA(closePrices, 200);
    const rsi14 = calculateRSI(closePrices, 14);
    const macdSignal = calculateMACDSignal(closePrices);

    return {
      ticker,
      name: price.shortName || price.longName || ticker,
      sector: profile?.sector || "Unknown",
      lastPrice: currentPrice,
      marketCap: price.marketCap || 0,
      currency: price.currency || "USD",
      
      priceChange1m,
      priceChange3m,
      priceChange6m,
      relativeStrength,
      
      peRatio: detail?.trailingPE ?? null,
      pbRatio: keyStats?.priceToBook ?? null,
      roe: financial?.returnOnEquity ? (financial.returnOnEquity as number) * 100 : null,
      revenueGrowthYoY: financial?.revenueGrowth ? (financial.revenueGrowth as number) * 100 : null,
      profitMargin: financial?.profitMargins ? (financial.profitMargins as number) * 100 : null,
      
      sma50,
      sma200,
      rsi14,
      macdSignal,
    };
  } catch (error) {
    logger.warn("acp/stock-scan", `Failed to fetch ${ticker}`, { error });
    return null;
  }
}

/**
 * Fetch benchmark returns for relative strength calculation
 */
async function fetchBenchmarkReturns(
  benchmarkTicker: string
): Promise<{ oneMonth: number; threeMonth: number; sixMonth: number }> {
  try {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - 12);

    const historical = await yahooFinance.historical(benchmarkTicker, {
      period1: startDate,
      period2: endDate,
      interval: "1d",
    }) as YahooHistoricalBar[];

    if (!historical || historical.length < 126) {
      return { oneMonth: 1, threeMonth: 1, sixMonth: 1 };
    }

    const closePrices = historical
      .map((h: YahooHistoricalBar) => h.close)
      .filter((c): c is number => c !== null);
    const currentPrice = closePrices[closePrices.length - 1];

    return {
      oneMonth: calculatePriceChange(currentPrice, closePrices, 21) || 1,
      threeMonth: calculatePriceChange(currentPrice, closePrices, 63) || 1,
      sixMonth: calculatePriceChange(currentPrice, closePrices, 126) || 1,
    };
  } catch (error) {
    logger.warn("acp/stock-scan", `Failed to fetch benchmark ${benchmarkTicker}`, { error });
    return { oneMonth: 1, threeMonth: 1, sixMonth: 1 };
  }
}

/**
 * Batch fetch stocks with rate limiting and concurrency control
 */
async function batchFetchStocks(
  tickers: string[],
  benchmarkReturns: { oneMonth: number; threeMonth: number; sixMonth: number }
): Promise<StockData[]> {
  const results: StockData[] = [];
  
  // Process in batches
  for (let i = 0; i < tickers.length; i += MAX_CONCURRENT) {
    const batch = tickers.slice(i, i + MAX_CONCURRENT);
    const batchResults = await Promise.all(
      batch.map(ticker => fetchStockData(ticker, benchmarkReturns))
    );
    
    for (const result of batchResults) {
      if (result) results.push(result);
    }
    
    // Rate limit between batches
    if (i + MAX_CONCURRENT < tickers.length) {
      await sleep(RATE_LIMIT_MS * MAX_CONCURRENT);
    }
  }
  
  return results;
}

/**
 * Score and rank stocks
 */
function scoreAndRankStocks(stocks: StockData[]): StockPick[] {
  // Build universe statistics for percentile ranking
  const universe = {
    priceChanges1m: stocks.map(s => s.priceChange1m).filter((v): v is number => v !== null),
    priceChanges3m: stocks.map(s => s.priceChange3m).filter((v): v is number => v !== null),
    priceChanges6m: stocks.map(s => s.priceChange6m).filter((v): v is number => v !== null),
    relativeStrengths: stocks.map(s => s.relativeStrength).filter((v): v is number => v !== null),
    peRatios: stocks.map(s => s.peRatio).filter((v): v is number => v !== null),
    roes: stocks.map(s => s.roe).filter((v): v is number => v !== null),
    revenueGrowths: stocks.map(s => s.revenueGrowthYoY).filter((v): v is number => v !== null),
    profitMargins: stocks.map(s => s.profitMargin).filter((v): v is number => v !== null),
  };

  // Calculate scores for each stock
  const scoredStocks = stocks.map(stock => {
    const momentum = calculateStockMomentumScore(stock, universe);
    const fundamentals = calculateStockFundamentalsScore(stock, universe);
    const technicals = calculateStockTechnicalsScore(stock);
    const composite = calculateStockCompositeScore({ momentum, fundamentals, technicals });

    const pick: Omit<StockPick, "rank"> = {
      ticker: stock.ticker,
      name: stock.name,
      sector: stock.sector,
      composite_score: Math.round(composite * 10) / 10,
      scores: {
        momentum: Math.round(momentum * 10) / 10,
        fundamentals: Math.round(fundamentals * 10) / 10,
        technicals: Math.round(technicals * 10) / 10,
      },
      metrics: {
        price_change_1m: stock.priceChange1m !== null ? Math.round(stock.priceChange1m * 10) / 10 : null,
        price_change_3m: stock.priceChange3m !== null ? Math.round(stock.priceChange3m * 10) / 10 : null,
        price_change_6m: stock.priceChange6m !== null ? Math.round(stock.priceChange6m * 10) / 10 : null,
        relative_strength: stock.relativeStrength !== null ? Math.round(stock.relativeStrength * 100) / 100 : null,
        pe_ratio: stock.peRatio !== null ? Math.round(stock.peRatio * 10) / 10 : null,
        pb_ratio: stock.pbRatio !== null ? Math.round(stock.pbRatio * 10) / 10 : null,
        roe: stock.roe !== null ? Math.round(stock.roe * 10) / 10 : null,
        revenue_growth_yoy: stock.revenueGrowthYoY !== null ? Math.round(stock.revenueGrowthYoY * 10) / 10 : null,
        profit_margin: stock.profitMargin !== null ? Math.round(stock.profitMargin * 10) / 10 : null,
        sma_50_vs_200: getSMACrossoverSignal(stock.sma50, stock.sma200),
        rsi_14: stock.rsi14 !== null ? Math.round(stock.rsi14) : null,
        macd_signal: stock.macdSignal,
        above_sma_50: stock.sma50 !== null && stock.lastPrice > stock.sma50,
        above_sma_200: stock.sma200 !== null && stock.lastPrice > stock.sma200,
      },
      market_cap: stock.marketCap,
      market_cap_tier: getMarketCapTier(stock.marketCap),
      last_price: Math.round(stock.lastPrice * 100) / 100,
      currency: stock.currency,
    };

    return { ...pick, compositeScore: composite };
  });

  // Sort by composite score (descending) and add rank
  scoredStocks.sort((a, b) => b.compositeScore - a.compositeScore);

  return scoredStocks.map((stock, index) => {
    const { compositeScore: _score, ...rest } = stock;
    void _score; // Explicitly ignore unused variable
    return { ...rest, rank: index + 1 };
  });
}

// ─── Route Handler ───────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // Auth check
  if (!isApiAuthenticated(req)) {
    return NextResponse.json(
      { success: false, error: { code: "UNAUTHORIZED", message: "Missing or invalid API key" } },
      { status: 401 }
    );
  }

  try {
    const body: StockScanRequest = await req.json();
    const { market, count = 10, sector = null, min_score = 0 } = body;

    // Validate inputs
    if (!market || !["US", "HK", "JP"].includes(market)) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_MARKET", message: "Market must be US, HK, or JP" } },
        { status: 400 }
      );
    }

    if (count < 1 || count > 50) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_COUNT", message: "Count must be between 1 and 50" } },
        { status: 400 }
      );
    }

    // Check cache
    const cacheKey = getCacheKey(market, sector);
    const cached = getFromCache<StockPick[]>(cacheKey);
    
    let picks: StockPick[];
    let totalScreened: number;

    if (cached) {
      logger.info("acp/stock-scan", `Cache hit for ${cacheKey}`);
      picks = cached;
      totalScreened = picks.length;
    } else {
      logger.info("acp/stock-scan", `Scanning ${market} market...`);
      
      // Get tickers and benchmark
      const tickers = getTickersForMarket(market as Market);
      const benchmarkTicker = getBenchmarkIndex(market as Market);
      
      // Fetch benchmark returns
      const benchmarkReturns = await fetchBenchmarkReturns(benchmarkTicker);
      
      // Fetch all stock data
      const stockData = await batchFetchStocks(tickers, benchmarkReturns);
      totalScreened = stockData.length;
      
      // Score and rank
      picks = scoreAndRankStocks(stockData);
      
      // Cache results
      setCache(cacheKey, picks);
      
      logger.info("acp/stock-scan", `Scanned ${totalScreened} stocks for ${market}`);
    }

    // Filter by sector if specified
    if (sector) {
      picks = picks.filter(p => p.sector.toLowerCase().includes(sector.toLowerCase()));
    }

    // Filter by minimum score
    if (min_score > 0) {
      picks = picks.filter(p => p.composite_score >= min_score);
    }

    // Limit results
    picks = picks.slice(0, count);

    // Re-rank after filtering
    picks = picks.map((p, i) => ({ ...p, rank: i + 1 }));

    return NextResponse.json({
      success: true,
      data: {
        market,
        scan_timestamp: new Date().toISOString(),
        total_screened: totalScreened,
        picks,
      },
      meta: {
        weights: {
          momentum: 0.35,
          fundamentals: 0.35,
          technicals: 0.30,
        },
        data_source: "yahoo-finance",
        cache_ttl_seconds: CACHE_TTL,
      },
    });
  } catch (error) {
    logger.error("acp/stock-scan", "Error processing scan", { error });
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "Failed to process stock scan" } },
      { status: 500 }
    );
  }
}

// Also support GET for simple queries
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const market = searchParams.get("market") || "US";
  const count = parseInt(searchParams.get("count") || "10");
  const sector = searchParams.get("sector") || null;
  
  // Create a mock request with the params
  const mockReq = new NextRequest(req.url, {
    method: "POST",
    headers: req.headers,
    body: JSON.stringify({ market, count, sector }),
  });
  
  return POST(mockReq);
}
