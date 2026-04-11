/**
 * Shared metals quotes fetcher — fetches and caches SI=F and GC=F quotes
 * from Yahoo Finance. Used by gold, silver-price, and other routes to
 * eliminate redundant Yahoo calls.
 *
 * Server-only module.
 */

import YahooFinance from "yahoo-finance2";
import { getCache, setCache, CACHE_KEYS } from "@/lib/market-cache";
import { logger } from "@/lib/logger";

const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

const LOG_SRC = "lib/metals-quotes";

interface QuoteResult {
  regularMarketPrice?: number;
  regularMarketPreviousClose?: number;
  regularMarketChange?: number;
  regularMarketChangePercent?: number;
  currency?: string;
  marketState?: string;
  fiftyTwoWeekHigh?: number;
  fiftyTwoWeekLow?: number;
}

export interface MetalsQuotes {
  silver: QuoteResult | null;
  gold: QuoteResult | null;
  updatedAt: string;
}

const TTL_SECONDS = 60;

/**
 * Fetch and cache SI=F and GC=F quotes. Returns cached data if fresh
 * (within 60s), otherwise fetches from Yahoo.
 */
export async function getMetalsQuotes(): Promise<MetalsQuotes> {
  const cached = await getCache<MetalsQuotes>(CACHE_KEYS.METALS_QUOTES, TTL_SECONDS);
  if (cached && !cached.isStale) {
    return cached.data;
  }

  // Fetch both in parallel
  const [silverQuote, goldQuote] = await Promise.all([
    yahooFinance.quote("SI=F").catch((e) => {
      logger.error(LOG_SRC, "Failed to fetch SI=F", { error: e });
      return null;
    }),
    yahooFinance.quote("GC=F").catch((e) => {
      logger.error(LOG_SRC, "Failed to fetch GC=F", { error: e });
      return null;
    }),
  ]);

  const quotes: MetalsQuotes = {
    silver: silverQuote as QuoteResult | null,
    gold: goldQuote as QuoteResult | null,
    updatedAt: new Date().toISOString(),
  };

  await setCache(CACHE_KEYS.METALS_QUOTES, quotes);

  // If we had stale data, we've already fetched fresh — but also return stale
  // if the fresh fetch somehow failed partially
  if (cached && (!quotes.silver || !quotes.gold)) {
    return {
      silver: quotes.silver ?? cached.data.silver,
      gold: quotes.gold ?? cached.data.gold,
      updatedAt: cached.data.updatedAt,
    };
  }

  return quotes;
}
