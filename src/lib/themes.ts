import { db, themes, themeStocks } from "@/db";
import YahooFinance from "yahoo-finance2";
import { logger } from "@/lib/logger";
import { getCrowdingScores, aggregateCrowdingScores, CrowdingScore } from "@/lib/crowding";

const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

interface HistoricalRow {
  date: Date;
  close: number;
}

async function getHistoricalPrices(
  ticker: string,
  period: "1w" | "1m" | "3m"
): Promise<{ start: number | null; end: number | null }> {
  try {
    const endDate = new Date();
    const startDate = new Date();

    if (period === "1w") {
      startDate.setDate(startDate.getDate() - 7);
    } else if (period === "1m") {
      startDate.setMonth(startDate.getMonth() - 1);
    } else {
      startDate.setMonth(startDate.getMonth() - 3);
    }

    const chartResult = await yahooFinance.chart(ticker, {
      period1: startDate,
      period2: endDate,
      interval: "1d",
    });
    const result = chartResult.quotes as HistoricalRow[];

    if (!result || result.length === 0) {
      return { start: null, end: null };
    }

    return {
      start: result[0]?.close ?? null,
      end: result[result.length - 1]?.close ?? null,
    };
  } catch {
    return { start: null, end: null };
  }
}

function calcPerformance(start: number | null, end: number | null): number | null {
  if (start === null || end === null || start === 0) return null;
  return ((end - start) / start) * 100;
}

export interface ThemeLite {
  id: number;
  name: string;
  description: string;
  created_at: string;
  stocks: string[];
}

export async function fetchThemesLite(): Promise<{ themes: ThemeLite[] }> {
  const allThemes = await db.select().from(themes).orderBy(themes.name);
  const allStocks = await db.select().from(themeStocks);

  const stocksByTheme = new Map<number, string[]>();
  for (const stock of allStocks) {
    const existing = stocksByTheme.get(stock.themeId) || [];
    existing.push(stock.ticker);
    stocksByTheme.set(stock.themeId, existing);
  }

  const themesLite = allThemes.map((theme) => ({
    id: theme.id,
    name: theme.name,
    description: theme.description || "",
    created_at: theme.createdAt || "",
    stocks: stocksByTheme.get(theme.id) || [],
  }));

  return { themes: themesLite };
}

export interface ThemePerformanceRow {
  id: number;
  name: string;
  stockCount: number;
  performance_1w: number | null;
  performance_1m: number | null;
  performance_3m: number | null;
  crowdingScore: number | null;
}

export interface ThemePerformanceResponse {
  themes: ThemePerformanceRow[];
  updated_at: string;
}

interface TickerPerf {
  performance_1w: number | null;
  performance_1m: number | null;
  performance_3m: number | null;
}

/**
 * Aggregated performance for ALL themes. Dedupes tickers across themes
 * (a stock in N themes is fetched once), batches Yahoo calls with bounded
 * concurrency, and returns one row per theme.
 */
export async function fetchThemePerformanceAll(): Promise<ThemePerformanceResponse> {
  const { themes: liteThemes } = await fetchThemesLite();

  // Dedupe tickers across all themes
  const tickerSet = new Set<string>();
  for (const t of liteThemes) {
    for (const ticker of t.stocks) tickerSet.add(ticker);
  }
  const allTickers = Array.from(tickerSet);

  // Crowding scores in one batch call
  const crowdingMap = await getCrowdingScores(allTickers);

  // Bounded-concurrency per-ticker price fetch (Yahoo throttles aggressive fan-outs)
  const CONCURRENCY = 10;
  const perfMap = new Map<string, TickerPerf>();

  let cursor = 0;
  async function worker() {
    while (cursor < allTickers.length) {
      const idx = cursor++;
      const ticker = allTickers[idx];
      try {
        const [p1w, p1m, p3m] = await Promise.all([
          getHistoricalPrices(ticker, "1w"),
          getHistoricalPrices(ticker, "1m"),
          getHistoricalPrices(ticker, "3m"),
        ]);
        perfMap.set(ticker, {
          performance_1w: calcPerformance(p1w.start, p1w.end),
          performance_1m: calcPerformance(p1m.start, p1m.end),
          performance_3m: calcPerformance(p3m.start, p3m.end),
        });
      } catch (e) {
        logger.warn("themes", `Failed to fetch prices for ${ticker}`, { error: e });
        perfMap.set(ticker, { performance_1w: null, performance_1m: null, performance_3m: null });
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, allTickers.length) }, worker));

  // Aggregate per theme
  const rows: ThemePerformanceRow[] = liteThemes.map((theme) => {
    const perfs_1w: number[] = [];
    const perfs_1m: number[] = [];
    const perfs_3m: number[] = [];
    const themeCrowding: CrowdingScore[] = [];

    for (const ticker of theme.stocks) {
      const p = perfMap.get(ticker);
      if (p?.performance_1w != null) perfs_1w.push(p.performance_1w);
      if (p?.performance_1m != null) perfs_1m.push(p.performance_1m);
      if (p?.performance_3m != null) perfs_3m.push(p.performance_3m);

      const c = crowdingMap.get(ticker);
      if (c) themeCrowding.push(c);
    }

    const avg = (arr: number[]) =>
      arr.length > 0 ? Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 100) / 100 : null;

    const aggregated = aggregateCrowdingScores(themeCrowding);

    return {
      id: theme.id,
      name: theme.name,
      stockCount: theme.stocks.length,
      performance_1w: avg(perfs_1w),
      performance_1m: avg(perfs_1m),
      performance_3m: avg(perfs_3m),
      crowdingScore: aggregated.score,
    };
  });

  return {
    themes: rows,
    updated_at: new Date().toISOString(),
  };
}

export async function fetchThemePrices(tickers: string[]) {
  const limitedTickers = tickers.slice(0, 20);

  const crowdingMap = await getCrowdingScores(limitedTickers);

  const results = await Promise.all(
    limitedTickers.map(async (ticker) => {
      try {
        const [prices1w, prices1m, prices3m, quote] = await Promise.all([
          getHistoricalPrices(ticker, "1w"),
          getHistoricalPrices(ticker, "1m"),
          getHistoricalPrices(ticker, "3m"),
          (yahooFinance.quote(ticker) as Promise<{ regularMarketPrice?: number; shortName?: string }>).catch(() => null),
        ]);

        const quoteData = quote as { regularMarketPrice?: number; shortName?: string } | null;
        const crowding = crowdingMap.get(ticker);

        return {
          ticker,
          name: quoteData?.shortName ?? null,
          performance_1w: calcPerformance(prices1w.start, prices1w.end),
          performance_1m: calcPerformance(prices1m.start, prices1m.end),
          performance_3m: calcPerformance(prices3m.start, prices3m.end),
          current_price: quoteData?.regularMarketPrice ?? null,
          crowdingScore: crowding?.score,
          crowdingLevel: crowding?.level,
        };
      } catch {
        return {
          ticker,
          name: null,
          performance_1w: null,
          performance_1m: null,
          performance_3m: null,
          current_price: null,
        };
      }
    })
  );

  const priceMap: Record<string, (typeof results)[0]> = {};
  for (const r of results) {
    priceMap[r.ticker] = r;
  }

  const validPerfs = {
    "1w": results.filter((r) => r.performance_1w !== null).map((r) => r.performance_1w!),
    "1m": results.filter((r) => r.performance_1m !== null).map((r) => r.performance_1m!),
    "3m": results.filter((r) => r.performance_3m !== null).map((r) => r.performance_3m!),
  };

  const basketPerformance = {
    performance_1w: validPerfs["1w"].length > 0
      ? validPerfs["1w"].reduce((a, b) => a + b, 0) / validPerfs["1w"].length
      : null,
    performance_1m: validPerfs["1m"].length > 0
      ? validPerfs["1m"].reduce((a, b) => a + b, 0) / validPerfs["1m"].length
      : null,
    performance_3m: validPerfs["3m"].length > 0
      ? validPerfs["3m"].reduce((a, b) => a + b, 0) / validPerfs["3m"].length
      : null,
  };

  const findLeader = (period: "performance_1w" | "performance_1m" | "performance_3m") => {
    const sorted = results
      .filter((r) => r[period] !== null)
      .sort((a, b) => (b[period] ?? 0) - (a[period] ?? 0));
    if (sorted.length === 0) return null;
    return { ticker: sorted[0].ticker, value: sorted[0][period]! };
  };

  const crowdingScores = limitedTickers
    .map((t) => crowdingMap.get(t))
    .filter((s): s is CrowdingScore => s !== undefined);
  const aggregatedCrowding = aggregateCrowdingScores(crowdingScores);

  return {
    prices: priceMap,
    basket: {
      ...basketPerformance,
      leaders: {
        "1w": findLeader("performance_1w"),
        "1m": findLeader("performance_1m"),
        "3m": findLeader("performance_3m"),
      },
      crowdingScore: aggregatedCrowding.score,
      crowdingLevel: aggregatedCrowding.level,
    },
  };
}
