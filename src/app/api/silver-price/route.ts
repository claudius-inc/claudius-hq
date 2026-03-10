import { NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";

export const dynamic = "force-dynamic";
export const revalidate = 60; // 1 minute

const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

interface SilverPriceResponse {
  price: number | null;
  changePercent: number | null;
  goldSilverRatio: number | null;
  goldPrice: number | null;
  updatedAt: string;
}

interface QuoteResult {
  regularMarketPrice?: number;
  regularMarketChangePercent?: number;
}

export async function GET() {
  try {
    // Fetch silver and gold futures
    let silverPrice: number | null = null;
    let silverChange: number | null = null;
    let goldPrice: number | null = null;

    try {
      const silverQuote = await yahooFinance.quote("SI=F") as QuoteResult;
      silverPrice = silverQuote?.regularMarketPrice ?? null;
      silverChange = silverQuote?.regularMarketChangePercent ?? null;
    } catch {
      // Silver quote failed
    }

    try {
      const goldQuote = await yahooFinance.quote("GC=F") as QuoteResult;
      goldPrice = goldQuote?.regularMarketPrice ?? null;
    } catch {
      // Gold quote failed
    }

    // Calculate gold/silver ratio
    const goldSilverRatio = silverPrice && goldPrice 
      ? Math.round((goldPrice / silverPrice) * 10) / 10 
      : null;

    const response: SilverPriceResponse = {
      price: silverPrice,
      changePercent: silverChange,
      goldSilverRatio,
      goldPrice,
      updatedAt: new Date().toISOString(),
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("Silver price API error:", error);
    return NextResponse.json({
      price: null,
      changePercent: null,
      goldSilverRatio: null,
      goldPrice: null,
      updatedAt: new Date().toISOString(),
      error: "Failed to fetch silver price",
    }, { status: 500 });
  }
}
