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
  { date: "Jun 2022", price: 15588, duration: "4 months", peakPrice: 126000, returnPct: 708 },
];

interface Wma200Data {
  weeklyPrices: { date: string; close: number; wma200: number | null }[];
  wma200: number;
}

interface Sma200Data {
  sma200d: number;
  mayerMultiple: number;
  yearlyPeakMayer: { year: number; peak: number }[];
}

/**
 * Compute WMA200 from weekly chart data, with 1h caching.
 */
async function getWma200Data(): Promise<Wma200Data> {
  const cached = await getCache<Wma200Data>(CACHE_KEYS.BTC_WMA200, 3600);
  if (cached && !cached.isStale) return cached.data;

  const endDate = new Date();
  const fullStart = new Date("2013-01-01");

  const historical = (
    await yahooFinance.chart("BTC-USD", {
      period1: fullStart,
      period2: endDate,
      interval: "1wk",
    })
  ).quotes as HistoricalRow[];

  historical.sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  );

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

  const weeklyPrices = result.filter((r) => r.wma200 !== null);
  const wma200 =
    weeklyPrices.length > 0 ? weeklyPrices[weeklyPrices.length - 1].wma200! : 0;

  const data: Wma200Data = { weeklyPrices, wma200 };
  await setCache(CACHE_KEYS.BTC_WMA200, data);
  return data;
}

/**
 * Compute SMA200 / Mayer Multiple from daily chart data, with 1h caching.
 */
async function getSma200Data(): Promise<Sma200Data> {
  const cached = await getCache<Sma200Data>(CACHE_KEYS.BTC_SMA200, 3600);
  if (cached && !cached.isStale) return cached.data;

  const endDate = new Date();
  const dailyStart = new Date("2012-01-01");

  const dailyHistory = (
    await yahooFinance.chart("BTC-USD", {
      period1: dailyStart,
      period2: endDate,
      interval: "1d",
    })
  ).quotes as HistoricalRow[];

  dailyHistory.sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  );

  const peakByYear: Record<number, number> = {};
  let sma200d = 0;
  let mayerMultiple = 0;

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

  const yearlyPeakMayer = Object.entries(peakByYear)
    .map(([year, peak]) => ({ year: parseInt(year), peak: Math.round(peak * 100) / 100 }))
    .sort((a, b) => a.year - b.year);

  const data: Sma200Data = {
    sma200d,
    mayerMultiple: Math.round(mayerMultiple * 100) / 100,
    yearlyPeakMayer,
  };
  await setCache(CACHE_KEYS.BTC_SMA200, data);
  return data;
}

async function fetchBtcData() {
  // Fetch live quote + cached indicator data in parallel
  const [quote, wmaData, smaData] = await Promise.all([
    yahooFinance.quote("BTC-USD") as Promise<QuoteResult>,
    getWma200Data().catch((e) => {
      logger.error("api/btc", "Error fetching WMA200 data", { error: e });
      return { weeklyPrices: [], wma200: 0 } as Wma200Data;
    }),
    getSma200Data().catch((e) => {
      logger.error("api/btc", "Error fetching SMA200 data", { error: e });
      return { sma200d: 0, mayerMultiple: 0, yearlyPeakMayer: [] } as Sma200Data;
    }),
  ]);

  const livePrice = quote.regularMarketPrice || 0;
  const change24h = quote.regularMarketChange || 0;
  const changePercent = quote.regularMarketChangePercent || 0;

  const distancePercent =
    wmaData.wma200 > 0
      ? ((livePrice - wmaData.wma200) / wmaData.wma200) * 100
      : 0;

  return {
    livePrice,
    change24h,
    changePercent,
    wma200: wmaData.wma200,
    distancePercent,
    weeklyPrices: wmaData.weeklyPrices,
    backtestTouches: BACKTEST_TOUCHES,
    sma200d: smaData.sma200d,
    mayerMultiple: smaData.mayerMultiple,
    yearlyPeakMayer: smaData.yearlyPeakMayer,
    mayerBacktest: MAYER_BACKTEST,
  };
}

export async function GET(request: NextRequest) {
  try {
    const fresh = request.nextUrl.searchParams.get("fresh") === "true";

    if (!fresh) {
      const cached = await getCache<Record<string, unknown>>(CACHE_KEYS.BTC, 60);
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
          .catch((e) =>
            logger.error("api/btc", "Background BTC refresh failed", {
              error: e,
            }),
          );
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
