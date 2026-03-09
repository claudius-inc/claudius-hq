import { NextRequest, NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";
import { getCache, setCache, CACHE_KEYS } from "@/lib/market-cache";
import { logger } from "@/lib/logger";

const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

export const dynamic = "force-dynamic";

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

const MAYER_BACKTEST = [
  { date: "Dec 2018", price: 3200, mayer: 0.57, return6mo: 134, return12mo: 127 },
  { date: "Mar 2020", price: 5000, mayer: 0.52, return6mo: 86, return12mo: 1060 },
  { date: "Nov 2022", price: 15800, mayer: 0.55, return6mo: 51, return12mo: 137 },
];

const BACKTEST_TOUCHES = [
  { date: "Jan 2015", price: 200, duration: "Weeks at MA", peakPrice: 20000, returnPct: 9600 },
  { date: "Dec 2018", price: 3100, duration: "Days", peakPrice: 20000, returnPct: 530 },
  { date: "Mar 2020", price: 5400, duration: "3 days", peakPrice: 64000, returnPct: 1160 },
  { date: "Jun 2022", price: 22000, duration: "4 months", peakPrice: 126000, returnPct: 616 },
];

async function fetchBtcData() {
  // Fetch live quote
  const quote = (await yahooFinance.quote("BTC-USD")) as QuoteResult;
  const livePrice = quote.regularMarketPrice || 0;
  const change24h = quote.regularMarketChange || 0;
  const changePercent = quote.regularMarketChangePercent || 0;

  // Fetch weekly historical data (~5 years to get 200+ weeks)
  const endDate = new Date();

  let weeklyPrices: { date: string; close: number; wma200: number | null }[] = [];
  let wma200 = 0;

  try {
    const fullStart = new Date("2013-01-01");
    const historical = (await yahooFinance.historical("BTC-USD", {
      period1: fullStart,
      period2: endDate,
      interval: "1wk",
    })) as HistoricalRow[];

    historical.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

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

    weeklyPrices = result.filter((r) => r.wma200 !== null);
    wma200 = weeklyPrices.length > 0 ? weeklyPrices[weeklyPrices.length - 1].wma200! : 0;
  } catch (e) {
    logger.error("api/btc", "Error fetching BTC historical", { error: e });
  }

  const distancePercent = wma200 > 0 ? ((livePrice - wma200) / wma200) * 100 : 0;

  // Fetch full daily history for Mayer Multiple (200-day SMA)
  let sma200d = 0;
  let mayerMultiple = 0;
  const yearlyPeakMayer: { year: number; peak: number }[] = [];
  try {
    const dailyStart = new Date("2012-01-01");
    const dailyHistory = (await yahooFinance.historical("BTC-USD", {
      period1: dailyStart,
      period2: endDate,
      interval: "1d",
    })) as HistoricalRow[];

    dailyHistory.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const peakByYear: Record<number, number> = {};
    for (let i = 199; i < dailyHistory.length; i++) {
      const close = dailyHistory[i].close ?? 0;
      if (close <= 0) continue;
      let sum = 0;
      for (let j = i - 199; j <= i; j++) {
        sum += dailyHistory[j].close ?? 0;
      }
      const sma = sum / 200;
      if (sma <= 0) continue;
      const mayer = close / sma;
      const year = new Date(dailyHistory[i].date).getFullYear();
      if (!peakByYear[year] || mayer > peakByYear[year]) {
        peakByYear[year] = mayer;
      }
      if (i === dailyHistory.length - 1) {
        sma200d = Math.round(sma);
        mayerMultiple = mayer;
      }
    }

    for (const [year, peak] of Object.entries(peakByYear)) {
      yearlyPeakMayer.push({ year: parseInt(year), peak: Math.round(peak * 100) / 100 });
    }
    yearlyPeakMayer.sort((a, b) => a.year - b.year);
  } catch (e) {
    logger.error("api/btc", "Error fetching daily BTC data for Mayer", { error: e });
  }

  return {
    livePrice,
    change24h,
    changePercent,
    wma200,
    distancePercent,
    weeklyPrices,
    backtestTouches: BACKTEST_TOUCHES,
    sma200d,
    mayerMultiple: Math.round(mayerMultiple * 100) / 100,
    yearlyPeakMayer,
    mayerBacktest: MAYER_BACKTEST,
  };
}

export async function GET(request: NextRequest) {
  try {
    const fresh = request.nextUrl.searchParams.get("fresh") === "true";

    if (!fresh) {
      const cached = await getCache<Record<string, unknown>>(CACHE_KEYS.BTC, 300);
      if (cached && !cached.isStale) {
        return NextResponse.json({
          ...cached.data,
          cached: true,
          cacheAge: cached.updatedAt,
        });
      }
      if (cached) {
        fetchBtcData()
          .then((data) => setCache(CACHE_KEYS.BTC, data))
          .catch((e) => logger.error("api/btc", "Background BTC refresh failed", { error: e }));
        return NextResponse.json({
          ...cached.data,
          cached: true,
          cacheAge: cached.updatedAt,
          isStale: true,
        });
      }
    }

    const data = await fetchBtcData();
    await setCache(CACHE_KEYS.BTC, data);
    return NextResponse.json({ ...data, cached: false });
  } catch (e) {
    logger.error("api/btc", "BTC API error", { error: e });
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
