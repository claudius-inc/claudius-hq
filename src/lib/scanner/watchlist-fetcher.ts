/**
 * Yahoo data fetcher for watchlist scoring. Separated from watchlist.ts so
 * the orchestrator can be tested without mocking the entire Yahoo + indicator stack.
 */
import { fetchHistoricalData } from "@/lib/scanner/yahoo-fetcher";
import { normalizeTickerForYahoo } from "@/lib/yahoo-utils";
import { logger } from "@/lib/logger";
import type { ScoringInputs } from "@/lib/scanner/watchlist";
import { computeIndicators } from "@/lib/scanner/watchlist";

// Use a lighter Yahoo quote for name + 52w + currentPrice instead of
// fetchEnhancedMetrics (which also fetches institutional data we don't need).
// Must use `new YahooFinance()` — the default export's quoteSummary is deprecated/never.
import YahooFinance from "yahoo-finance2";
const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

export interface FetchedTicker {
  inputs: ScoringInputs;
  price: number | null;
  pc1w: number | null;
  pc1m: number | null;
  pc3m: number | null;
  name: string;
}

interface YahooQuoteSummaryResult {
  summaryDetail?: {
    fiftyTwoWeekHigh?: number;
    fiftyTwoWeekLow?: number;
  };
  price?: {
    shortName?: string;
    longName?: string;
    regularMarketPrice?: number;
    regularMarketChangePercent?: number;
  };
}

/**
 * Compute 1-week, 1-month, 3-month price changes from historical bars.
 * Returns null for each if there aren't enough bars.
 */
function computePriceChanges(closes: number[]): {
  pc1w: number | null;
  pc1m: number | null;
  pc3m: number | null;
} {
  const last = closes[closes.length - 1];
  if (!last || last === 0) return { pc1w: null, pc1m: null, pc3m: null };

  // Approximate trading days: 1w≈5, 1m≈21, 3m≈63
  const idx1w = closes.length - 1 - 5;
  const idx1m = closes.length - 1 - 21;
  const idx3m = closes.length - 1 - 63;

  const pc1w = idx1w >= 0 && closes[idx1w] > 0 ? (last / closes[idx1w] - 1) * 100 : null;
  const pc1m = idx1m >= 0 && closes[idx1m] > 0 ? (last / closes[idx1m] - 1) * 100 : null;
  const pc3m = idx3m >= 0 && closes[idx3m] > 0 ? (last / closes[idx3m] - 1) * 100 : null;

  return { pc1w, pc1m, pc3m };
}

export async function buildScoringInputs(ticker: string): Promise<FetchedTicker | null> {
  const yahooTicker = normalizeTickerForYahoo(ticker);

  // Fetch raw bars + lightweight quote data in parallel
  const [bars, quoteSummary] = await Promise.all([
    fetchHistoricalData(yahooTicker).catch(() => null),
    yahooFinance
      .quoteSummary(yahooTicker, { modules: ["summaryDetail", "price"] })
      .catch(() => null) as Promise<YahooQuoteSummaryResult | null>,
  ]);

  if (!bars || bars.length === 0) {
    logger.warn("watchlist-fetcher", `No historical bars for ${ticker}`);
    return null;
  }

  const indicators = computeIndicators(bars);
  const closes = bars.map((b) => b.close);
  const { pc1w, pc1m, pc3m } = computePriceChanges(closes);

  const price = indicators.price ?? null;

  // Extract 52w high/low from quote summary (preferred over computing from 1y bars
  // since Yahoo's value accounts for the full 52-week window accurately).
  const fiftyTwoWeekHigh = quoteSummary?.summaryDetail?.fiftyTwoWeekHigh ?? null;
  const fiftyTwoWeekLow = quoteSummary?.summaryDetail?.fiftyTwoWeekLow ?? null;
  const name =
    quoteSummary?.price?.shortName ??
    quoteSummary?.price?.longName ??
    ticker;

  if (price === null) {
    logger.warn("watchlist-fetcher", `Could not derive price for ${ticker}`);
    return null;
  }

  return {
    name,
    price,
    pc1w,
    pc1m,
    pc3m,
    inputs: {
      price,
      return12mEx1m: indicators.return12mEx1m,
      fiftyTwoWeekHigh,
      fiftyTwoWeekLow,
      closesAbove20SmaPct60d: indicators.closesAbove20SmaPct60d,
      sma200: indicators.sma200,
      sma50: indicators.sma50,
      sma20: indicators.sma20,
      rsi14: indicators.rsi14,
      macdLine: indicators.macdLine,
      macdSignal: indicators.macdSignal,
      avgVol20d: indicators.avgVol20d,
      avgVol60d: indicators.avgVol60d,
      adx14: indicators.adx14,
    },
  };
}
