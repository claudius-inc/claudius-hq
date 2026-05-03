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

// Rate limiting: 250ms between chart requests (reduced from 350ms since we batch quotes)
const RATE_LIMIT_MS = 250;
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

interface QuoteResult {
  symbol?: string;
  regularMarketPrice?: number;
  regularMarketVolume?: number;
}

/**
 * Batch fetch quotes for multiple tickers.
 */
async function fetchBatchQuotes(tickers: string[]): Promise<Map<string, QuoteResult>> {
  const result = new Map<string, QuoteResult>();
  if (tickers.length === 0) return result;

  const CHUNK = 20;
  const chunks: string[][] = [];
  for (let i = 0; i < tickers.length; i += CHUNK) {
    chunks.push(tickers.slice(i, i + CHUNK));
  }

  await Promise.all(
    chunks.map(async (chunk) => {
      try {
        const quotes = (await yahooFinance.quote(chunk)) as QuoteResult | QuoteResult[];
        const arr = Array.isArray(quotes) ? quotes : [quotes];

        // Build a lookup map for this chunk
        const tickerMap = new Map<string, string>();
        for (const t of chunk) {
          tickerMap.set(t.toUpperCase(), t);
        }

        for (const q of arr) {
          if (q?.symbol) {
            const symbolUpper = q.symbol.toUpperCase();
            let originalTicker = tickerMap.get(symbolUpper);

            // Store under original ticker if found
            if (originalTicker) {
              result.set(originalTicker, q);
            }
            // Also store under returned symbol as fallback
            result.set(q.symbol, q);
          }
        }
      } catch (e) {
        console.error("[Yahoo] Batch quote failed -", e);
        // Try individual calls
        await Promise.all(
          chunk.map(async (t) => {
            try {
              const q = (await yahooFinance.quote(t)) as QuoteResult;
              if (q?.symbol) result.set(t, q);
            } catch {
              /* skip */
            }
          }),
        );
      }
    }),
  );

  return result;
}

/**
 * Fetch quote data for current price (legacy, kept for compatibility).
 */
export async function fetchQuote(
  ticker: string
): Promise<{ price: number; volume: number } | null> {
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
 * Calculate all technical metrics for a ticker (without quote).
 */
async function calculateTechnicalMetricsNoQuote(
  ticker: string,
  quotePrice?: number
): Promise<(TechnicalMetrics & { currentPrice?: number }) | null> {
  const daily = await fetchHistoricalData(ticker);
  if (!daily || daily.length < 50) return null;

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
  const price = quotePrice ?? daily[daily.length - 1].close;
  const rrWeekly =
    athWeekly !== null && swingLow !== null
      ? calculateRR(price, athWeekly, swingLow)
      : null;

  return {
    currentPrice: price,
    athWeekly,
    athMonthly,
    rvolWeekly,
    rvolMonthly,
    atrWeekly,
    rrWeekly,
  };
}

/**
 * Calculate all technical metrics for a ticker (with individual quote).
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
 * Now uses batched quote calls for efficiency.
 */
export async function batchFetchMetrics(
  tickers: string[],
  onProgress?: (ticker: string, index: number, total: number) => void
): Promise<Map<string, TechnicalMetrics & { currentPrice: number }>> {
  const results = new Map<string, TechnicalMetrics & { currentPrice: number }>();

  // Step 1: Batch fetch all quotes
  const quoteMap = await fetchBatchQuotes(tickers);

  // Step 2: Fetch historical data with concurrency limit
  const CONCURRENCY = 6;
  let cursor = 0;

  const worker = async () => {
    while (cursor < tickers.length) {
      const idx = cursor++;
      const ticker = tickers[idx];
      if (onProgress) onProgress(ticker, idx, tickers.length);

      try {
        const quote = quoteMap.get(ticker);
        if (!quote?.regularMarketPrice) {
          console.error(`[Batch] ${ticker}: no quote data`);
          continue;
        }

        const metrics = await calculateTechnicalMetricsNoQuote(ticker, quote.regularMarketPrice);
        if (metrics && metrics.currentPrice) {
          results.set(ticker, {
            currentPrice: metrics.currentPrice,
            athWeekly: metrics.athWeekly,
            athMonthly: metrics.athMonthly,
            rvolWeekly: metrics.rvolWeekly,
            rvolMonthly: metrics.rvolMonthly,
            atrWeekly: metrics.atrWeekly,
            rrWeekly: metrics.rrWeekly,
          });
        }
      } catch (error) {
        console.error(`[Batch] ${ticker}: failed -`, error);
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, tickers.length) }, worker));

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
      returnOnAssets: num(fd?.returnOnAssets),
      debtToEquity: num(fd?.debtToEquity)
        ? num(fd?.debtToEquity)! / 100
        : undefined, // Yahoo returns as percentage
      totalDebt: num(fd?.totalDebt),
      ebitda: num(fd?.ebitda),
      currentRatio: num(fd?.currentRatio),

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

  // Step 1: Batch fetch technical metrics
  const techMetrics = await batchFetchMetrics(tickers, onProgress);

  // Step 2: Fetch fundamental data with concurrency limit
  const CONCURRENCY = 4;
  let cursor = 0;

  const worker = async () => {
    while (cursor < tickers.length) {
      const idx = cursor++;
      const ticker = tickers[idx];

      const tech = techMetrics.get(ticker);
      if (!tech) continue;

      try {
        const fundamentals = await fetchFundamentalData(ticker);
        if (fundamentals) {
          results.set(ticker, {
            ...tech,
            fundamentals,
          });
        }
      } catch (error) {
        console.error(`[Batch] ${ticker}: fundamental fetch failed -`, error);
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, tickers.length) }, worker));

  return results;
}
