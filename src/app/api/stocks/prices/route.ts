import { NextRequest, NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";

// Instantiate Yahoo Finance client
const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

export const dynamic = "force-dynamic";

// Cache prices for 5 minutes
const priceCache = new Map<string, { price: number; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

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
    .filter(Boolean);

  if (tickers.length === 0) {
    return NextResponse.json({ error: "No valid tickers" }, { status: 400 });
  }

  const results: PriceResult[] = [];
  const tickersToFetch: string[] = [];

  // Check cache first
  for (const ticker of tickers) {
    const cached = priceCache.get(ticker);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      results.push({ ticker, price: cached.price });
    } else {
      tickersToFetch.push(ticker);
    }
  }

  // Fetch uncached prices
  if (tickersToFetch.length > 0) {
    try {
      const quotes = await yahooFinance.quote(tickersToFetch) as QuoteResult | QuoteResult[];
      
      // Handle single quote or array
      const quotesArray = Array.isArray(quotes) ? quotes : [quotes];
      
      for (const quote of quotesArray) {
        const ticker = quote.symbol;
        const price = quote.regularMarketPrice;

        if (price !== undefined && price !== null) {
          priceCache.set(ticker, { price, timestamp: Date.now() });
          results.push({ ticker, price });
        } else {
          results.push({ ticker, price: null, error: "Price not available" });
        }
      }

      // Handle any tickers that didn't return results
      const fetchedTickers = new Set(quotesArray.map((q) => q.symbol));
      for (const ticker of tickersToFetch) {
        if (!fetchedTickers.has(ticker)) {
          results.push({ ticker, price: null, error: "Not found" });
        }
      }
    } catch (e) {
      // If bulk fetch fails, try individual fetches
      for (const ticker of tickersToFetch) {
        try {
          const quote = await yahooFinance.quote(ticker) as QuoteResult;
          const price = quote.regularMarketPrice;
          if (price !== undefined && price !== null) {
            priceCache.set(ticker, { price, timestamp: Date.now() });
            results.push({ ticker, price });
          } else {
            results.push({ ticker, price: null, error: "Price not available" });
          }
        } catch {
          results.push({ ticker, price: null, error: String(e) });
        }
      }
    }
  }

  // Convert to map for easy lookup
  const priceMap: Record<string, number | null> = {};
  for (const r of results) {
    priceMap[r.ticker] = r.price;
  }

  return NextResponse.json({ prices: priceMap });
}
