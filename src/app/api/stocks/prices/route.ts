import { NextRequest, NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";
import { getCache, setCache, CACHE_KEYS } from "@/lib/cache/market-cache";
import { logger } from "@/lib/logger";

// Instantiate Yahoo Finance client
const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

export const dynamic = "force-dynamic";

interface PriceResult {
  ticker: string;
  price: number | null;
  error?: string;
}

// Type for quote result
interface QuoteResult {
  symbol: string;
  regularMarketPrice?: number;
}

async function fetchStockPrices(tickers: string[]) {
  const results: PriceResult[] = [];

  try {
    const quotes = await yahooFinance.quote(tickers) as QuoteResult | QuoteResult[];

    // Handle single quote or array
    const quotesArray = Array.isArray(quotes) ? quotes : [quotes];

    for (const quote of quotesArray) {
      const ticker = quote.symbol;
      const price = quote.regularMarketPrice;

      if (price !== undefined && price !== null) {
        results.push({ ticker, price });
      } else {
        results.push({ ticker, price: null, error: "Price not available" });
      }
    }

    // Handle any tickers that didn't return results
    const fetchedTickers = new Set(quotesArray.map((q) => q.symbol));
    for (const ticker of tickers) {
      if (!fetchedTickers.has(ticker)) {
        results.push({ ticker, price: null, error: "Not found" });
      }
    }
  } catch (e) {
    // If bulk fetch fails, try individual fetches
    for (const ticker of tickers) {
      try {
        const quote = await yahooFinance.quote(ticker) as QuoteResult;
        const price = quote.regularMarketPrice;
        if (price !== undefined && price !== null) {
          results.push({ ticker, price });
        } else {
          results.push({ ticker, price: null, error: "Price not available" });
        }
      } catch {
        results.push({ ticker, price: null, error: String(e) });
      }
    }
  }

  // Convert to map for easy lookup
  const priceMap: Record<string, number | null> = {};
  for (const r of results) {
    priceMap[r.ticker] = r.price;
  }

  return { prices: priceMap };
}

// GET /api/stocks/prices?tickers=AAPL,MSFT,GOOGL
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tickersParam = searchParams.get("tickers");

  if (!tickersParam) {
    return NextResponse.json(
      { error: "tickers parameter required" },
      { status: 400 }
    );
  }

  const tickers = tickersParam
    .split(",")
    .map((t) => t.trim().toUpperCase())
    .filter(Boolean)
    .sort(); // Sort for consistent cache key

  if (tickers.length === 0) {
    return NextResponse.json({ error: "No valid tickers" }, { status: 400 });
  }

  const cacheKey = `${CACHE_KEYS.STOCK_PRICES}:${tickers.join(",")}`;
  const fresh = searchParams.get("fresh") === "true";

  try {
    if (!fresh) {
      const cached = await getCache<Record<string, unknown>>(cacheKey, 300);
      if (cached && !cached.isStale) {
        return NextResponse.json({
          ...cached.data,
          cached: true,
          cacheAge: cached.updatedAt,
        });
      }
      if (cached) {
        fetchStockPrices(tickers)
          .then((data) => setCache(cacheKey, data))
          .catch((e) => logger.error("api/stocks/prices", "Background stock prices refresh failed", { error: e }));
        return NextResponse.json({
          ...cached.data,
          cached: true,
          cacheAge: cached.updatedAt,
          isStale: true,
        });
      }
    }

    const data = await fetchStockPrices(tickers);
    await setCache(cacheKey, data);
    return NextResponse.json({ ...data, cached: false });
  } catch (e) {
    logger.error("api/stocks/prices", "Stock prices API error", { error: e });
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
