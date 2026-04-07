import { db, themes, themeStocks, stockPricesDaily } from "@/db";
import YahooFinance from "yahoo-finance2";
import { and, eq, gte, desc } from "drizzle-orm";
import { logger } from "@/lib/logger";
import { getCrowdingScores, aggregateCrowdingScores, CrowdingScore } from "@/lib/crowding";

const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

const LOG_SRC = "lib/themes";

interface HistoricalRow {
  date: Date;
  close: number;
}

interface DailyPoint {
  date: string;
  close: number;
}

/**
 * Load ~3 months of daily closes for a ticker, DB-first with Yahoo fallback.
 *
 * Past closes are immutable, so we materialize them in `stock_prices_daily`
 * and only fall back to Yahoo when the cache is sparse or doesn't extend far
 * enough back. New rows are appended on each Yahoo refetch — over time the
 * fallback fires only for tickers we haven't seen recently.
 */
async function loadDailyPriceWindow(
  ticker: string,
  daysBack: number,
): Promise<DailyPoint[]> {
  const fromDate = new Date();
  fromDate.setDate(fromDate.getDate() - daysBack - 1);
  const fromDateStr = fromDate.toISOString().split("T")[0];

  // Try DB first
  let dbRows: DailyPoint[] = [];
  try {
    dbRows = await db
      .select({
        date: stockPricesDaily.date,
        close: stockPricesDaily.close,
      })
      .from(stockPricesDaily)
      .where(
        and(
          eq(stockPricesDaily.ticker, ticker),
          gte(stockPricesDaily.date, fromDateStr),
        ),
      )
      .orderBy(stockPricesDaily.date);
  } catch (e) {
    logger.warn(LOG_SRC, `DB read failed for ${ticker}`, { error: e });
  }

  // ~63 trading days in ~90 calendar days. Require at least 60% coverage
  // before trusting the DB; otherwise we fall back to Yahoo and re-store.
  const expectedTradingDays = Math.floor(daysBack * 0.6);
  if (dbRows.length >= expectedTradingDays) {
    return dbRows;
  }

  // Cache miss / sparse — fetch from Yahoo and persist.
  try {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysBack);

    const chartResult = await yahooFinance.chart(ticker, {
      period1: startDate,
      period2: endDate,
      interval: "1d",
    });
    const quotes = chartResult.quotes as HistoricalRow[];
    if (!quotes || quotes.length === 0) return dbRows; // best-effort

    const points: DailyPoint[] = quotes
      .filter((q) => q.close !== null && q.close !== undefined)
      .map((q) => ({
        date: q.date.toISOString().split("T")[0],
        close: q.close,
      }));

    // Persist in background — don't block the response.
    storeStockPrices(ticker, points).catch((e) =>
      logger.warn(LOG_SRC, `Background store failed for ${ticker}`, {
        error: e,
      }),
    );

    return points;
  } catch (e) {
    logger.warn(LOG_SRC, `Yahoo fetch failed for ${ticker}`, { error: e });
    return dbRows; // fall back to whatever we had (possibly empty)
  }
}

async function storeStockPrices(ticker: string, points: DailyPoint[]) {
  if (points.length === 0) return;
  // Drizzle's onConflictDoNothing relies on the unique index we created
  // on (ticker, date). Batch in groups to stay under the SQLite param cap.
  const BATCH = 100;
  for (let i = 0; i < points.length; i += BATCH) {
    const batch = points.slice(i, i + BATCH).map((p) => ({
      ticker,
      date: p.date,
      close: p.close,
    }));
    await db.insert(stockPricesDaily).values(batch).onConflictDoNothing();
  }
}

/**
 * Pick the close at-or-just-before the target date from a sorted DailyPoint
 * array. Used to translate "1w/1m/3m ago" into a real trading-day close
 * regardless of weekends and holidays.
 */
function closeAtOrBefore(
  points: DailyPoint[],
  targetDate: Date,
): number | null {
  if (points.length === 0) return null;
  const targetStr = targetDate.toISOString().split("T")[0];
  // Walk from the end backwards (smallest array, most recent first).
  for (let i = points.length - 1; i >= 0; i--) {
    if (points[i].date <= targetStr) return points[i].close;
  }
  return null;
}

interface PerfTriple {
  performance_1w: number | null;
  performance_1m: number | null;
  performance_3m: number | null;
}

/**
 * Get 1w/1m/3m returns for a single ticker. Internally fetches ONE 3-month
 * window (DB-first) and derives all three periods from it — drops the call
 * count from 3 Yahoo chart() per ticker to 0 (warm) or 1 (cold).
 */
async function getTickerPerformance(ticker: string): Promise<PerfTriple> {
  const points = await loadDailyPriceWindow(ticker, 95); // a bit > 3 months

  if (points.length === 0) {
    return {
      performance_1w: null,
      performance_1m: null,
      performance_3m: null,
    };
  }

  const today = new Date();
  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(today.getDate() - 7);
  const oneMonthAgo = new Date();
  oneMonthAgo.setMonth(today.getMonth() - 1);
  const threeMonthsAgo = new Date();
  threeMonthsAgo.setMonth(today.getMonth() - 3);

  const end = points[points.length - 1].close;
  const start1w = closeAtOrBefore(points, oneWeekAgo);
  const start1m = closeAtOrBefore(points, oneMonthAgo);
  const start3m = closeAtOrBefore(points, threeMonthsAgo);

  return {
    performance_1w: calcPerformance(start1w, end),
    performance_1m: calcPerformance(start1m, end),
    performance_3m: calcPerformance(start3m, end),
  };
}

// Legacy single-period helper kept for `fetchThemePrices()` below which
// returns one period at a time. Now goes through the same DB-first cache.
async function getHistoricalPrices(
  ticker: string,
  period: "1w" | "1m" | "3m",
): Promise<{ start: number | null; end: number | null }> {
  const points = await loadDailyPriceWindow(ticker, 95);
  if (points.length === 0) return { start: null, end: null };

  const end = points[points.length - 1].close;
  const targetDate = new Date();
  if (period === "1w") targetDate.setDate(targetDate.getDate() - 7);
  else if (period === "1m") targetDate.setMonth(targetDate.getMonth() - 1);
  else targetDate.setMonth(targetDate.getMonth() - 3);

  return { start: closeAtOrBefore(points, targetDate), end };
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
        // ONE DB read (or 1 Yahoo fallback) per ticker, derives all 3 periods.
        // Was previously 3 Yahoo chart() calls per ticker.
        perfMap.set(ticker, await getTickerPerformance(ticker));
      } catch (e) {
        logger.warn(LOG_SRC, `Failed to fetch prices for ${ticker}`, {
          error: e,
        });
        perfMap.set(ticker, {
          performance_1w: null,
          performance_1m: null,
          performance_3m: null,
        });
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
