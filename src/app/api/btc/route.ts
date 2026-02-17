import { NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";

const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

export const dynamic = "force-dynamic";

interface BtcCache {
  data: Record<string, unknown>;
  timestamp: number;
}

let cache: BtcCache | null = null;
const CACHE_TTL = 5 * 60 * 1000;

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

const BACKTEST_TOUCHES = [
  { date: "Jan 2015", price: 200, duration: "Weeks at MA", peakPrice: 20000, returnPct: 9600 },
  { date: "Dec 2018", price: 3100, duration: "Days", peakPrice: 20000, returnPct: 530 },
  { date: "Mar 2020", price: 5400, duration: "3 days", peakPrice: 64000, returnPct: 1160 },
  { date: "Jun 2022", price: 22000, duration: "4 months", peakPrice: 126000, returnPct: 616 },
];

export async function GET() {
  try {
    if (cache && Date.now() - cache.timestamp < CACHE_TTL) {
      return NextResponse.json(cache.data);
    }

    // Fetch live quote
    const quote = (await yahooFinance.quote("BTC-USD")) as QuoteResult;
    const livePrice = quote.regularMarketPrice || 0;
    const change24h = quote.regularMarketChange || 0;
    const changePercent = quote.regularMarketChangePercent || 0;

    // Fetch weekly historical data (~5 years to get 200+ weeks)
    const endDate = new Date();
    const startDate = new Date();
    startDate.setFullYear(startDate.getFullYear() - 5);

    let weeklyPrices: { date: string; close: number; wma200: number | null }[] = [];
    let wma200 = 0;

    try {
      // Fetch full history for 200WMA calculation (need 200 weeks = ~4 years)
      const fullStart = new Date("2013-01-01");
      const historical = (await yahooFinance.historical("BTC-USD", {
        period1: fullStart,
        period2: endDate,
        interval: "1wk",
      })) as HistoricalRow[];

      // Sort by date ascending
      historical.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      // Calculate 200WMA for each point
      const closes = historical.map((h) => h.close ?? 0);
      const result: { date: string; close: number; wma200: number | null }[] = [];

      for (let i = 0; i < closes.length; i++) {
        let wma: number | null = null;
        if (i >= 199) {
          const slice = closes.slice(i - 199, i + 1);
          wma = slice.reduce((a, b) => a + b, 0) / 200;
        }
        result.push({
          date: new Date(historical[i].date).toISOString().split("T")[0],
          close: closes[i],
          wma200: wma ? Math.round(wma) : null,
        });
      }

      // Only return points that have WMA data
      weeklyPrices = result.filter((r) => r.wma200 !== null);
      wma200 = weeklyPrices.length > 0 ? weeklyPrices[weeklyPrices.length - 1].wma200! : 0;
    } catch (e) {
      console.error("Error fetching BTC historical:", e);
    }

    const distancePercent = wma200 > 0 ? ((livePrice - wma200) / wma200) * 100 : 0;

    const data = {
      livePrice,
      change24h,
      changePercent,
      wma200,
      distancePercent,
      weeklyPrices,
      backtestTouches: BACKTEST_TOUCHES,
    };

    cache = { data, timestamp: Date.now() };

    return NextResponse.json(data);
  } catch (e) {
    console.error("BTC API error:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
