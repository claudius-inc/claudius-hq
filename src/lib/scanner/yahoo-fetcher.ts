/**
 * Yahoo Finance data fetcher with rate limiting.
 * Fetches OHLCV data and calculates technical indicators.
 */

import yahooFinance from "yahoo-finance2";
import {
  OHLCV,
  calculateATH,
  calculateATR,
  calculateRVOL,
  calculateRR,
  findSwingLow,
  aggregateToWeekly,
  aggregateToMonthly,
} from "./indicators";
import type { TechnicalMetrics } from "./scoring";
import type { YahooStockData } from "./mode-scoring";

// Rate limiting: 350ms between requests
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

interface YahooHistoricalBar {
  date: Date;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  volume: number | null;
}

/**
 * Convert Yahoo Finance historical data to our OHLCV format.
 */
function toOHLCV(data: YahooHistoricalBar[]): OHLCV[] {
  return data
    .filter(
      (bar) =>
        bar.open !== null &&
        bar.high !== null &&
        bar.low !== null &&
        bar.close !== null &&
        bar.volume !== null
    )
    .map((bar) => ({
      date: bar.date,
      open: bar.open!,
      high: bar.high!,
      low: bar.low!,
      close: bar.close!,
      volume: bar.volume!,
    }));
}

/**
 * Fetch historical data for a ticker.
 * Returns 1 year of daily data.
 */
export async function fetchHistoricalData(
  ticker: string
): Promise<OHLCV[] | null> {
  await rateLimit();

  try {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setFullYear(startDate.getFullYear() - 1);

    const result = await yahooFinance.historical(ticker, {
      period1: startDate,
      period2: endDate,
      interval: "1d",
    });

    const data = result as YahooHistoricalBar[];
    if (!data || data.length < 50) {
      console.warn(`[Yahoo] ${ticker}: insufficient data (${data?.length ?? 0} bars)`);
      return null;
    }

    return toOHLCV(data);
  } catch (error) {
    console.error(`[Yahoo] ${ticker}: fetch failed -`, error);
    return null;
  }
}

/**
 * Fetch quote data for current price.
 */
export async function fetchQuote(
  ticker: string
): Promise<{ price: number; volume: number } | null> {
  await rateLimit();

  try {
    const result = await yahooFinance.quote(ticker);
    const quote = result as Record<string, unknown>;
    if (!quote || quote.regularMarketPrice === undefined) {
      return null;
    }
    return {
      price: quote.regularMarketPrice as number,
      volume: (quote.regularMarketVolume as number) ?? 0,
    };
  } catch (error) {
    console.error(`[Yahoo] ${ticker}: quote failed -`, error);
    return null;
  }
}

/**
 * Calculate all technical metrics for a ticker.
 */
export async function calculateTechnicalMetrics(
  ticker: string
): Promise<(TechnicalMetrics & { currentPrice: number }) | null> {
  const daily = await fetchHistoricalData(ticker);
  if (!daily || daily.length < 50) return null;

  const quote = await fetchQuote(ticker);
  if (!quote) return null;

  const weekly = aggregateToWeekly(daily);
  const monthly = aggregateToMonthly(daily);

  // ATH calculations
  const athWeekly = calculateATH(weekly);
  const athMonthly = calculateATH(monthly);

  // RVOL calculations (10-period lookback for weekly, 3 for monthly)
  const rvolWeekly = calculateRVOL(weekly, 10);
  const rvolMonthly = calculateRVOL(monthly, 3);

  // ATR weekly (14-period)
  const atrWeekly = calculateATR(weekly, 14);

  // RR calculation
  const swingLow = findSwingLow(weekly, 20);
  const rrWeekly =
    athWeekly !== null && swingLow !== null
      ? calculateRR(quote.price, athWeekly, swingLow)
      : null;

  return {
    currentPrice: quote.price,
    athWeekly,
    athMonthly,
    rvolWeekly,
    rvolMonthly,
    atrWeekly,
    rrWeekly,
  };
}

/**
 * Batch fetch technical metrics for multiple tickers.
 * Respects rate limiting between each request.
 */
export async function batchFetchMetrics(
  tickers: string[],
  onProgress?: (ticker: string, index: number, total: number) => void
): Promise<Map<string, TechnicalMetrics & { currentPrice: number }>> {
  const results = new Map<string, TechnicalMetrics & { currentPrice: number }>();

  for (let i = 0; i < tickers.length; i++) {
    const ticker = tickers[i];
    if (onProgress) onProgress(ticker, i, tickers.length);

    try {
      const metrics = await calculateTechnicalMetrics(ticker);
      if (metrics) {
        results.set(ticker, metrics);
      }
    } catch (error) {
      console.error(`[Batch] ${ticker}: failed -`, error);
    }
  }

  return results;
}

/**
 * Fetch fundamental data needed for mode scoring.
 * Uses quoteSummary to get financialData, defaultKeyStatistics, summaryDetail, price.
 */
export async function fetchFundamentalData(
  ticker: string
): Promise<YahooStockData | null> {
  await rateLimit();

  try {
    const result = await yahooFinance.quoteSummary(ticker, {
      modules: [
        "financialData",
        "defaultKeyStatistics",
        "summaryDetail",
        "price",
        "summaryProfile",
      ],
    });

    if (!result) return null;

    // Type the result properly - yahoo-finance2's types can be tricky
    const summary = result as {
      financialData?: Record<string, unknown>;
      defaultKeyStatistics?: Record<string, unknown>;
      summaryDetail?: Record<string, unknown>;
      price?: Record<string, unknown>;
      summaryProfile?: Record<string, unknown>;
    };

    const fd = summary.financialData;
    const ks = summary.defaultKeyStatistics;
    const sd = summary.summaryDetail;
    const pr = summary.price;
    const sp = summary.summaryProfile;

    // Build YahooStockData from quoteSummary modules
    // Cast to number since yahoo-finance2 returns unknown types
    const num = (v: unknown): number | undefined =>
      typeof v === "number" ? v : undefined;
    const str = (v: unknown): string | undefined =>
      typeof v === "string" ? v : undefined;

    const data: YahooStockData = {
      // financialData
      currentPrice: num(fd?.currentPrice) ?? num(pr?.regularMarketPrice),
      grossMargins: num(fd?.grossMargins),
      operatingMargins: num(fd?.operatingMargins),
      freeCashflow: num(fd?.freeCashflow),
      operatingCashflow: num(fd?.operatingCashflow),
      totalRevenue: num(fd?.totalRevenue),
      revenueGrowth: num(fd?.revenueGrowth),
      returnOnEquity: num(fd?.returnOnEquity),
      debtToEquity: num(fd?.debtToEquity)
        ? num(fd?.debtToEquity)! / 100
        : undefined, // Yahoo returns as percentage
      totalDebt: num(fd?.totalDebt),
      ebitda: num(fd?.ebitda),

      // defaultKeyStatistics
      trailingEps: num(ks?.trailingEps),
      priceToBook: num(ks?.priceToBook),
      enterpriseToEbitda: num(ks?.enterpriseToEbitda),
      beta: num(ks?.beta),
      sharesOutstanding: num(ks?.sharesOutstanding),
      heldPercentInsiders: num(ks?.heldPercentInsiders),
      enterpriseValue: num(ks?.enterpriseValue),
      forwardPE: num(ks?.forwardPE),
      pegRatio: num(ks?.pegRatio),
      priceToSalesTrailing12Months: num(ks?.priceToSalesTrailing12Months),

      // summaryDetail
      trailingPE: num(sd?.trailingPE),
      dividendYield: num(sd?.dividendYield),
      payoutRatio: num(sd?.payoutRatio),
      marketCap: num(sd?.marketCap),

      // price
      regularMarketPrice: num(pr?.regularMarketPrice),
      regularMarketChangePercent: num(pr?.regularMarketChangePercent),
      fiftyDayAverage: num(pr?.fiftyDayAverage),
      twoHundredDayAverage: num(pr?.twoHundredDayAverage),

      // summaryProfile
      sector: str(sp?.sector),
      industry: str(sp?.industry),
    };

    // Calculate derived metrics
    if (data.freeCashflow && data.marketCap && data.marketCap > 0) {
      data.fcfYield = data.freeCashflow / data.marketCap;
    }
    if (data.freeCashflow && data.totalRevenue && data.totalRevenue > 0) {
      data.fcfMargin = data.freeCashflow / data.totalRevenue;
    }

    return data;
  } catch (error) {
    console.error(`[Yahoo] ${ticker}: fundamental fetch failed -`, error);
    return null;
  }
}

/**
 * Combined fetch: technical metrics + fundamental data for mode scoring.
 */
export async function fetchAllStockData(
  ticker: string
): Promise<
  | (TechnicalMetrics & { currentPrice: number } & { fundamentals: YahooStockData })
  | null
> {
  // Fetch technical metrics first
  const techMetrics = await calculateTechnicalMetrics(ticker);
  if (!techMetrics) return null;

  // Fetch fundamental data
  const fundamentals = await fetchFundamentalData(ticker);
  if (!fundamentals) return null;

  return {
    ...techMetrics,
    fundamentals,
  };
}

/**
 * Batch fetch all stock data (technical + fundamental) for multiple tickers.
 */
export async function batchFetchAllData(
  tickers: string[],
  onProgress?: (ticker: string, index: number, total: number) => void
): Promise<
  Map<string, TechnicalMetrics & { currentPrice: number } & { fundamentals: YahooStockData }>
> {
  const results = new Map<
    string,
    TechnicalMetrics & { currentPrice: number } & { fundamentals: YahooStockData }
  >();

  for (let i = 0; i < tickers.length; i++) {
    const ticker = tickers[i];
    if (onProgress) onProgress(ticker, i, tickers.length);

    try {
      const data = await fetchAllStockData(ticker);
      if (data) {
        results.set(ticker, data);
      }
    } catch (error) {
      console.error(`[Batch] ${ticker}: failed -`, error);
    }
  }

  return results;
}
