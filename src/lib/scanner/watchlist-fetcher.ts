/**
 * Yahoo data fetcher for watchlist scoring. Separated from watchlist.ts so
 * the orchestrator can be tested without mocking the entire Yahoo + indicator stack.
 *
 * Fetches its own historical bars (rather than reusing yahoo-fetcher.fetchHistoricalData)
 * because the latter uses the deprecated default export of yahoo-finance2 which throws
 * "Call `new YahooFinance()` first." at runtime.
 */
import { normalizeTickerForYahoo } from "@/lib/yahoo-utils";
import { logger } from "@/lib/logger";
import type { ScoringInputs } from "@/lib/scanner/watchlist";
import { computeIndicators } from "@/lib/scanner/watchlist-indicators";
import type { OHLCV } from "@/lib/scanner/indicators";
import { acquireYahooSlot, withYahooRetry } from "@/lib/scanner/yahoo-rate-limiter";
import YahooFinance from "yahoo-finance2";
const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

export interface FetchedTicker {
  inputs: ScoringInputs;
  price: number | null;
  pc1d: number | null;
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
    /** Yahoo returns this as a fraction (-0.028 = -2.8%), not a percent. */
    regularMarketChangePercent?: number;
  };
}

/**
 * Compute 1-week, 1-month, 3-month price changes from historical bars.
 * Returns null for each if there aren't enough bars.
 */
function computePriceChanges(closes: number[]): {
  pc1d: number | null;
  pc1w: number | null;
  pc1m: number | null;
  pc3m: number | null;
} {
  const last = closes[closes.length - 1];
  if (!last || last === 0) return { pc1d: null, pc1w: null, pc1m: null, pc3m: null };

  // Approximate trading days: 1d≈1, 1w≈5, 1m≈21, 3m≈63
  const idx1d = closes.length - 1 - 1;
  const idx1w = closes.length - 1 - 5;
  const idx1m = closes.length - 1 - 21;
  const idx3m = closes.length - 1 - 63;

  const pc1d = idx1d >= 0 && closes[idx1d] > 0 ? (last / closes[idx1d] - 1) * 100 : null;
  const pc1w = idx1w >= 0 && closes[idx1w] > 0 ? (last / closes[idx1w] - 1) * 100 : null;
  const pc1m = idx1m >= 0 && closes[idx1m] > 0 ? (last / closes[idx1m] - 1) * 100 : null;
  const pc3m = idx3m >= 0 && closes[idx3m] > 0 ? (last / closes[idx3m] - 1) * 100 : null;

  return { pc1d, pc1w, pc1m, pc3m };
}

async function fetchBars(yahooTicker: string): Promise<OHLCV[] | null> {
  // 14 months back: covers >253 trading days needed for return12mEx1m.
  const startDate = new Date();
  startDate.setMonth(startDate.getMonth() - 14);
  try {
    await acquireYahooSlot();
    const raw = await withYahooRetry(`chart(${yahooTicker})`, () =>
      yahooFinance.chart(yahooTicker, {
        period1: startDate,
        period2: new Date(),
        interval: "1d",
      }),
    );
    const quotes = raw?.quotes ?? [];
    return quotes
      .filter((q) => q.close != null && q.high != null && q.low != null && q.open != null)
      .map((q) => ({
        date: q.date as Date,
        open: q.open as number,
        high: q.high as number,
        low: q.low as number,
        close: q.close as number,
        volume: (q.volume ?? 0) as number,
      }));
  } catch {
    return null;
  }
}

async function fetchQuoteSummary(
  yahooTicker: string,
): Promise<YahooQuoteSummaryResult | null> {
  try {
    await acquireYahooSlot();
    return (await withYahooRetry(`quoteSummary(${yahooTicker})`, () =>
      yahooFinance.quoteSummary(yahooTicker, {
        modules: ["summaryDetail", "price"],
      }),
    )) as YahooQuoteSummaryResult;
  } catch {
    return null;
  }
}

export async function buildScoringInputs(ticker: string): Promise<FetchedTicker | null> {
  const yahooTicker = normalizeTickerForYahoo(ticker);

  // Sequence the per-ticker pair so the rate limiter can pace cleanly —
  // parallel fan-out (Promise.all) was creating paired bursts that overwhelmed
  // Yahoo's tolerance for concurrent connections from a single client.
  const bars = await fetchBars(yahooTicker);
  const quoteSummary = await fetchQuoteSummary(yahooTicker);

  if (!bars || bars.length === 0) {
    logger.warn("watchlist-fetcher", `No historical bars for ${ticker}`);
    return null;
  }

  const indicators = computeIndicators(bars);
  const closes = bars.map((b) => b.close).filter((c): c is number => c != null);
  const changes = computePriceChanges(closes);

  // Recent IPOs (e.g., 0100.HK on listing day) only have one bar of history,
  // so historical-bar comparisons return null. Yahoo's quoteSummary still
  // exposes the live 1-day change as a fraction; fall back to that so the
  // 1D column isn't blank on day one.
  const liveChangeFrac = quoteSummary?.price?.regularMarketChangePercent ?? null;
  const pc1d =
    changes.pc1d ?? (liveChangeFrac != null ? liveChangeFrac * 100 : null);
  const { pc1w, pc1m, pc3m } = changes;

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
    pc1d,
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
