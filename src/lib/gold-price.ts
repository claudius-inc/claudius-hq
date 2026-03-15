import YahooFinance from "yahoo-finance2";
import { logger } from "./logger";

const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

interface QuoteResult {
  regularMarketPrice?: number;
  regularMarketPreviousClose?: number;
  regularMarketChange?: number;
  regularMarketChangePercent?: number;
}

interface HistoricalRow {
  date: Date;
  close: number | null;
}

export interface GoldPriceData {
  price: number;
  change?: number;
  changePercent?: number;
  sma50: number;
  sma200: number;
}

/**
 * Fetch current gold spot price and SMAs from Yahoo Finance (GC=F futures)
 * Shared by /api/gold and /api/valuation/expected-returns
 */
export async function fetchGoldSpotPrice(): Promise<GoldPriceData | null> {
  try {
    // Fetch current gold futures price
    const gcQuote = await yahooFinance.quote("GC=F") as QuoteResult;
    const price = gcQuote?.regularMarketPrice;
    
    if (!price) {
      logger.warn("lib/gold-price", "No gold price from GC=F");
      return null;
    }

    // Fetch historical data for SMAs
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 250); // ~1 year for 200-day SMA

    let sma50 = price;
    let sma200 = price;

    try {
      const hist = (await yahooFinance.chart("GC=F", {
        period1: startDate,
        period2: endDate,
        interval: "1d",
      })) as { quotes?: HistoricalRow[] };

      const closes = (hist.quotes || [])
        .map((q) => q.close)
        .filter((c): c is number => c !== null);

      if (closes.length >= 50) {
        sma50 = Math.round(closes.slice(-50).reduce((a, b) => a + b, 0) / 50 * 100) / 100;
      }
      if (closes.length >= 200) {
        sma200 = Math.round(closes.slice(-200).reduce((a, b) => a + b, 0) / 200 * 100) / 100;
      }
    } catch (e) {
      logger.warn("lib/gold-price", "Error fetching gold historical data for SMAs", { error: e });
    }

    return {
      price,
      change: gcQuote.regularMarketChange,
      changePercent: gcQuote.regularMarketChangePercent,
      sma50,
      sma200,
    };
  } catch (error) {
    logger.error("lib/gold-price", "Error fetching gold price", { error });
    return null;
  }
}

/**
 * Fallback: Get gold price from GLD ETF * 10
 */
export async function fetchGoldPriceFromGLD(): Promise<GoldPriceData | null> {
  try {
    const gldQuote = await yahooFinance.quote("GLD") as QuoteResult;
    const gldPrice = gldQuote?.regularMarketPrice;
    
    if (!gldPrice) return null;

    // GLD tracks ~1/10 of gold price
    const price = gldPrice * 10;

    // For SMAs, fetch GLD historical and scale
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 250);

    let sma50 = price;
    let sma200 = price;

    try {
      const hist = (await yahooFinance.chart("GLD", {
        period1: startDate,
        period2: endDate,
        interval: "1d",
      })) as { quotes?: HistoricalRow[] };

      const closes = (hist.quotes || [])
        .map((q) => q.close)
        .filter((c): c is number => c !== null);

      if (closes.length >= 50) {
        sma50 = Math.round(closes.slice(-50).reduce((a, b) => a + b, 0) / 50 * 10 * 100) / 100;
      }
      if (closes.length >= 200) {
        sma200 = Math.round(closes.slice(-200).reduce((a, b) => a + b, 0) / 200 * 10 * 100) / 100;
      }
    } catch (e) {
      logger.warn("lib/gold-price", "Error fetching GLD historical", { error: e });
    }

    return { price, sma50, sma200 };
  } catch (error) {
    logger.error("lib/gold-price", "Error fetching GLD price", { error });
    return null;
  }
}

/**
 * Get gold price with fallback
 */
export async function getGoldPrice(): Promise<GoldPriceData | null> {
  const goldData = await fetchGoldSpotPrice();
  if (goldData) return goldData;
  
  // Fallback to GLD
  return fetchGoldPriceFromGLD();
}
