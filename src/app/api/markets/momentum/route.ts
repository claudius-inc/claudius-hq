import { NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";

// Instantiate Yahoo Finance client
const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

// Global market ETF mappings
const MARKET_ETFS: Record<string, { ticker: string; name: string; region: string }> = {
  us_sp500: { ticker: "SPY", name: "US S&P 500", region: "Americas" },
  us_nasdaq: { ticker: "QQQ", name: "US NASDAQ 100", region: "Americas" },
  us_smallcap: { ticker: "IWM", name: "US Small Cap", region: "Americas" },
  canada: { ticker: "EWC", name: "Canada", region: "Americas" },
  brazil: { ticker: "EWZ", name: "Brazil", region: "Americas" },
  mexico: { ticker: "EWW", name: "Mexico", region: "Americas" },
  uk: { ticker: "EWU", name: "United Kingdom", region: "Europe" },
  germany: { ticker: "EWG", name: "Germany", region: "Europe" },
  france: { ticker: "EWQ", name: "France", region: "Europe" },
  europe: { ticker: "VGK", name: "Europe (broad)", region: "Europe" },
  japan: { ticker: "EWJ", name: "Japan", region: "Asia Pacific" },
  china: { ticker: "FXI", name: "China Large Cap", region: "Asia Pacific" },
  china_tech: { ticker: "KWEB", name: "China Internet", region: "Asia Pacific" },
  hong_kong: { ticker: "EWH", name: "Hong Kong", region: "Asia Pacific" },
  taiwan: { ticker: "EWT", name: "Taiwan", region: "Asia Pacific" },
  korea: { ticker: "EWY", name: "South Korea", region: "Asia Pacific" },
  singapore: { ticker: "EWS", name: "Singapore", region: "Asia Pacific" },
  india: { ticker: "INDA", name: "India", region: "Asia Pacific" },
  australia: { ticker: "EWA", name: "Australia", region: "Asia Pacific" },
  emerging: { ticker: "EEM", name: "Emerging Markets", region: "Global" },
  world: { ticker: "VT", name: "Total World", region: "Global" },
};

// Benchmark ETF
const BENCHMARK_ETF = "VT";

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
    startDate.setDate(startDate.getDate() - days - 5);

    const result = await yahooFinance.historical(ticker, {
      period1: startDate,
      period2: endDate,
      interval: "1d",
    }) as HistoricalRow[];

    if (!result || result.length < 2) {
      return { startPrice: null, endPrice: null, change: null };
    }

    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() - days);
    
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

export interface MarketMomentum {
  id: string;
  name: string;
  ticker: string;
  region: string;
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

// GET /api/markets/momentum
export async function GET() {
  try {
    // Get benchmark performance
    const [bench1w, bench1m, bench3m] = await Promise.all([
      getPriceChange(BENCHMARK_ETF, 7),
      getPriceChange(BENCHMARK_ETF, 30),
      getPriceChange(BENCHMARK_ETF, 90),
    ]);

    // Get all market data in parallel
    const marketPromises = Object.entries(MARKET_ETFS).map(async ([id, { ticker, name, region }]) => {
      const [price, d1, w1, m1, m3, m6] = await Promise.all([
        getCurrentPrice(ticker),
        getPriceChange(ticker, 1),
        getPriceChange(ticker, 7),
        getPriceChange(ticker, 30),
        getPriceChange(ticker, 90),
        getPriceChange(ticker, 180),
      ]);

      // Composite score: 1W (20%) + 1M (50%) + 3M (30%)
      let compositeScore: number | null = null;
      if (w1.change !== null && m1.change !== null && m3.change !== null) {
        compositeScore = (w1.change * 0.2) + (m1.change * 0.5) + (m3.change * 0.3);
      }

      // Relative strength vs VT (1M)
      let relativeStrength: number | null = null;
      if (m1.change !== null && bench1m.change !== null) {
        relativeStrength = m1.change - bench1m.change;
      }

      // Momentum trend
      let momentumTrend: "accelerating" | "decelerating" | "stable" | null = null;
      if (w1.change !== null && m1.change !== null) {
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
        region,
        price,
        change_1d: d1.change,
        change_1w: w1.change,
        change_1m: m1.change,
        change_3m: m3.change,
        change_6m: m6.change,
        composite_score: compositeScore,
        relative_strength_1m: relativeStrength,
        momentum_trend: momentumTrend,
      } as MarketMomentum;
    });

    const markets = await Promise.all(marketPromises);

    // Sort by composite score (descending)
    markets.sort((a, b) => (b.composite_score ?? -999) - (a.composite_score ?? -999));

    return NextResponse.json({
      markets,
      benchmark: {
        ticker: BENCHMARK_ETF,
        name: "Total World",
        change_1w: bench1w.change,
        change_1m: bench1m.change,
        change_3m: bench3m.change,
      },
      updated_at: new Date().toISOString(),
    });
  } catch (e) {
    console.error("Failed to get market momentum:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
