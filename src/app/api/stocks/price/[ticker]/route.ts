import { NextRequest, NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";

// Instantiate Yahoo Finance client
const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

export const dynamic = "force-dynamic";

// Cache prices for 5 minutes
const priceCache = new Map<string, { price: number; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Type for quote result
interface QuoteResult {
  regularMarketPrice?: number;
  currency?: string;
  marketState?: string;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await params;
  const upperTicker = ticker.toUpperCase();

  try {
    // Check cache
    const cached = priceCache.get(upperTicker);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return NextResponse.json({
        ticker: upperTicker,
        price: cached.price,
        cached: true,
      });
    }

    // Fetch from Yahoo Finance
    const quote = await yahooFinance.quote(upperTicker) as QuoteResult;
    const price = quote.regularMarketPrice;

    if (price === undefined || price === null) {
      return NextResponse.json(
        { error: "Price not available" },
        { status: 404 }
      );
    }

    // Update cache
    priceCache.set(upperTicker, { price, timestamp: Date.now() });

    return NextResponse.json({
      ticker: upperTicker,
      price,
      currency: quote.currency,
      marketState: quote.marketState,
      cached: false,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
