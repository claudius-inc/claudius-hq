import { NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";

// Instantiate Yahoo Finance client
const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

// Sector ETF mappings
const SECTOR_ETFS: Record<string, { ticker: string; name: string }> = {
  technology: { ticker: "XLK", name: "Technology" },
  financials: { ticker: "XLF", name: "Financial Services" },
  consumer_cyclical: { ticker: "XLY", name: "Consumer Cyclical" },
  communication: { ticker: "XLC", name: "Communication Services" },
  healthcare: { ticker: "XLV", name: "Healthcare" },
  industrials: { ticker: "XLI", name: "Industrials" },
  consumer_defensive: { ticker: "XLP", name: "Consumer Defensive" },
  energy: { ticker: "XLE", name: "Energy" },
  materials: { ticker: "XLB", name: "Basic Materials" },
  real_estate: { ticker: "XLRE", name: "Real Estate" },
  utilities: { ticker: "XLU", name: "Utilities" },
};

// SPY for relative strength calculation
const MARKET_ETF = "SPY";

// Revalidate every 15 minutes
export const revalidate = 900;

interface HistoricalRow {
  date: Date;
  close: number;
}

// Get price change for a period
async function getPriceChange(
  ticker: string,
  days: number
): Promise<{ startPrice: number | null; endPrice: number | null; change: number | null }> {
  try {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days - 5); // Extra buffer for weekends

    const result = await yahooFinance.historical(ticker, {
      period1: startDate,
      period2: endDate,
      interval: "1d",
    }) as HistoricalRow[];

    if (!result || result.length < 2) {
      return { startPrice: null, endPrice: null, change: null };
    }

    // Find the price from ~days ago
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() - days);
    
    // Get the row closest to target date
    let startIdx = 0;
    for (let i = 0; i < result.length; i++) {
      if (new Date(result[i].date) <= targetDate) {
        startIdx = i;
      } else {
        break;
      }
    }

    const startPrice = result[startIdx]?.close ?? null;
    const endPrice = result[result.length - 1]?.close ?? null;

    if (startPrice === null || endPrice === null || startPrice === 0) {
      return { startPrice, endPrice, change: null };
    }

    const change = ((endPrice - startPrice) / startPrice) * 100;
    return { startPrice, endPrice, change };
  } catch (e) {
    console.error(`Failed to get price change for ${ticker}:`, e);
    return { startPrice: null, endPrice: null, change: null };
  }
}

// Get current price
async function getCurrentPrice(ticker: string): Promise<number | null> {
  try {
    const quote = await yahooFinance.quote(ticker) as { regularMarketPrice?: number };
    return quote?.regularMarketPrice ?? null;
  } catch {
    return null;
  }
}

export interface SectorMomentum {
  id: string;
  name: string;
  ticker: string;
  price: number | null;
  change_1d: number | null;
  change_1w: number | null;
  change_1m: number | null;
  change_3m: number | null;
  change_6m: number | null;
  composite_score: number | null;
  relative_strength_1m: number | null;
  momentum_trend: "accelerating" | "decelerating" | "stable" | null;
}

// GET /api/sectors/momentum
export async function GET() {
  try {
    // Get SPY performance for relative strength
    const [spy1w, spy1m, spy3m] = await Promise.all([
      getPriceChange(MARKET_ETF, 7),
      getPriceChange(MARKET_ETF, 30),
      getPriceChange(MARKET_ETF, 90),
    ]);

    // Get all sector data in parallel
    const sectorPromises = Object.entries(SECTOR_ETFS).map(async ([id, { ticker, name }]) => {
      const [price, d1, w1, m1, m3, m6] = await Promise.all([
        getCurrentPrice(ticker),
        getPriceChange(ticker, 1),
        getPriceChange(ticker, 7),
        getPriceChange(ticker, 30),
        getPriceChange(ticker, 90),
        getPriceChange(ticker, 180),
      ]);

      // Calculate composite score: 1W (20%) + 1M (50%) + 3M (30%)
      let compositeScore: number | null = null;
      if (w1.change !== null && m1.change !== null && m3.change !== null) {
        compositeScore = (w1.change * 0.2) + (m1.change * 0.5) + (m3.change * 0.3);
      }

      // Calculate relative strength vs SPY (1M)
      let relativeStrength: number | null = null;
      if (m1.change !== null && spy1m.change !== null) {
        relativeStrength = m1.change - spy1m.change;
      }

      // Determine momentum trend
      let momentumTrend: "accelerating" | "decelerating" | "stable" | null = null;
      if (w1.change !== null && m1.change !== null) {
        // Normalize 1W to monthly rate for comparison
        const weeklyAnnualized = w1.change * 4;
        const diff = weeklyAnnualized - m1.change;
        if (diff > 2) {
          momentumTrend = "accelerating";
        } else if (diff < -2) {
          momentumTrend = "decelerating";
        } else {
          momentumTrend = "stable";
        }
      }

      return {
        id,
        name,
        ticker,
        price,
        change_1d: d1.change,
        change_1w: w1.change,
        change_1m: m1.change,
        change_3m: m3.change,
        change_6m: m6.change,
        composite_score: compositeScore,
        relative_strength_1m: relativeStrength,
        momentum_trend: momentumTrend,
      } as SectorMomentum;
    });

    const sectors = await Promise.all(sectorPromises);

    // Sort by composite score (descending)
    sectors.sort((a, b) => (b.composite_score ?? -999) - (a.composite_score ?? -999));

    return NextResponse.json({
      sectors,
      market: {
        ticker: MARKET_ETF,
        change_1w: spy1w.change,
        change_1m: spy1m.change,
        change_3m: spy3m.change,
      },
      updated_at: new Date().toISOString(),
    });
  } catch (e) {
    console.error("Failed to get sector momentum:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
