import { NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";
import { calculateGex, interpretGex, formatGex } from "@/lib/gex";
import { logger } from "@/lib/logger";

const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

// Cache GEX data for 5 minutes (options data doesn't change that frequently)
const cache = new Map<string, { data: GexResponse; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

interface GexResponse {
  symbol: string;
  spotPrice: number;
  totalGex: number;
  totalGexFormatted: string;
  callGex: number;
  putGex: number;
  interpretation: {
    label: string;
    meaning: string;
    marketImpact: string;
    color: 'green' | 'amber' | 'red';
  };
  byStrike: {
    strike: number;
    callGex: number;
    putGex: number;
    totalGex: number;
  }[];
  maxPainStrike: number | null;
  flipZone: number | null;
  expirationDate: string;
  lastUpdated: string;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbol = (searchParams.get("symbol") || "SPY").toUpperCase();
  
  // Check cache
  const cached = cache.get(symbol);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return NextResponse.json(cached.data);
  }
  
  try {
    // Fetch options chain from Yahoo Finance
    const optionsData = await yahooFinance.options(symbol);
    
    if (!optionsData || !optionsData.options || optionsData.options.length === 0) {
      return NextResponse.json(
        { error: "No options data available for this symbol" },
        { status: 404 }
      );
    }
    
    const spotPrice = optionsData.quote?.regularMarketPrice || 0;
    
    if (!spotPrice) {
      return NextResponse.json(
        { error: "Could not get spot price" },
        { status: 500 }
      );
    }
    
    // Use the nearest expiration for simplicity (most liquid)
    // For a more complete picture, we'd aggregate across multiple expirations
    const nearestExpiry = optionsData.options[0];
    const expirationDate = optionsData.expirationDates?.[0]?.toISOString() || '';
    
    // Calculate days to expiry
    const expDate = optionsData.expirationDates?.[0];
    const daysToExpiry = expDate 
      ? Math.max(1, Math.ceil((expDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
      : 30;
    
    // Combine calls and puts
    const allOptions = [
      ...(nearestExpiry.calls || []).map(c => ({
        strike: c.strike,
        openInterest: c.openInterest || 0,
        impliedVolatility: c.impliedVolatility || 0.3, // Default 30% if missing
        type: 'call' as const,
      })),
      ...(nearestExpiry.puts || []).map(p => ({
        strike: p.strike,
        openInterest: p.openInterest || 0,
        impliedVolatility: p.impliedVolatility || 0.3,
        type: 'put' as const,
      })),
    ].filter(o => o.openInterest > 0); // Only include options with OI
    
    if (allOptions.length === 0) {
      return NextResponse.json(
        { error: "No options with open interest found" },
        { status: 404 }
      );
    }
    
    // Calculate GEX
    const gexResult = calculateGex(allOptions, spotPrice, daysToExpiry);
    const interpretation = interpretGex(gexResult.totalGex);
    
    // Filter to strikes near the money (±20% from spot)
    const nearMoneyStrikes = gexResult.byStrike.filter(
      s => s.strike >= spotPrice * 0.8 && s.strike <= spotPrice * 1.2
    );
    
    const response: GexResponse = {
      symbol,
      spotPrice: Math.round(spotPrice * 100) / 100,
      totalGex: gexResult.totalGex,
      totalGexFormatted: formatGex(gexResult.totalGex),
      callGex: gexResult.callGex,
      putGex: gexResult.putGex,
      interpretation,
      byStrike: nearMoneyStrikes,
      maxPainStrike: gexResult.maxPainStrike,
      flipZone: gexResult.flipZone,
      expirationDate,
      lastUpdated: new Date().toISOString(),
    };
    
    // Cache the result
    cache.set(symbol, { data: response, timestamp: Date.now() });
    
    return NextResponse.json(response);
  } catch (error) {
    logger.error("gex-api", "Error fetching GEX data", { symbol, error });
    return NextResponse.json(
      { error: "Failed to fetch GEX data" },
      { status: 500 }
    );
  }
}
