import { db, themes, themeStocks, stockPricesDaily } from "@/db";
import YahooFinance from "yahoo-finance2";
import { and, eq, gte } from "drizzle-orm";
import { logger } from "@/lib/logger";
import { getCrowdingScores, aggregateCrowdingScores, CrowdingScore } from "@/lib/crowding";

const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

const LOG_SRC = "lib/themes";

// How many calendar days of history we want available for the 3-month
// comparison. ~95 calendar days ≈ 60-65 trading days, which is enough to
// look up the close from "today − 7 / 30 / 90 days ago".
const HISTORY_WINDOW_DAYS = 95;
// Minimum trading-day rows that count as "cache is warm enough" for a
// ticker. Below this, do a one-time chart() backfill.
const MIN_CACHED_ROWS = 50;

interface HistoricalRow {
  date: Date;
  close: number;
}

interface DailyPoint {
  date: string;
  close: number;
}

// ── DB-only history read ────────────────────────────────────────────────────
//
// Past closes are immutable, so we read whatever's in the DB unconditionally.
// Freshness comes from the live `quote()` call in `fetchLiveQuotes`, not from
// re-running `chart()` on every refresh.

async function loadHistoricalCloses(ticker: string): Promise<DailyPoint[]> {
  const fromDate = new Date();
  fromDate.setDate(fromDate.getDate() - HISTORY_WINDOW_DAYS - 1);
  const fromDateStr = fromDate.toISOString().split("T")[0];

  try {
    return await db
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
    return [];
  }
}

/**
 * One-time backfill from Yahoo `chart()` for a ticker we haven't seen.
 * Subsequent requests for this ticker read from the DB and use a live
 * `quote()` for today's close — no more `chart()` calls per ticker.
 */
async function backfillTickerHistory(
  ticker: string,
): Promise<DailyPoint[]> {
  try {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - HISTORY_WINDOW_DAYS);

    const chartResult = await yahooFinance.chart(ticker, {
      period1: startDate,
      period2: endDate,
      interval: "1d",
    });
    const quotes = chartResult.quotes as HistoricalRow[];
    if (!quotes || quotes.length === 0) return [];

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
    logger.warn(LOG_SRC, `Yahoo chart() backfill failed for ${ticker}`, {
      error: e,
    });
    return [];
  }
}

async function storeStockPrices(ticker: string, points: DailyPoint[]) {
  if (points.length === 0) return;
  // Drizzle's onConflictDoNothing relies on the unique index on (ticker, date).
  // Batch in groups to stay under the SQLite param cap.
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

// ── Live quote batching ─────────────────────────────────────────────────────
//
// Yahoo's quote() accepts string | string[] but the batched call is
// all-or-nothing — one bad ticker fails the whole array. We chunk to ~20 and
// fall back to per-ticker quotes inside a chunk on failure so a single bad
// symbol doesn't kill its peers.

interface YahooQuoteShape {
  symbol?: string;
  regularMarketPrice?: number;
}

async function fetchLiveQuotes(
  tickers: string[],
): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  if (tickers.length === 0) return result;

  const CHUNK = 20;
  const chunks: string[][] = [];
  for (let i = 0; i < tickers.length; i += CHUNK) {
    chunks.push(tickers.slice(i, i + CHUNK));
  }

  // Fire all chunks in parallel — Yahoo handles ~8 concurrent requests fine.
  await Promise.all(
    chunks.map(async (chunk) => {
      try {
        const quotes = (await yahooFinance.quote(chunk)) as
          | YahooQuoteShape
          | YahooQuoteShape[];
        const arr = Array.isArray(quotes) ? quotes : [quotes];
        for (const q of arr) {
          if (q?.symbol && q.regularMarketPrice != null) {
            result.set(q.symbol, q.regularMarketPrice);
          }
        }
      } catch (e) {
        logger.warn(LOG_SRC, "Batch quote failed, falling back per-ticker", {
          error: e,
          chunkSize: chunk.length,
        });
        // One bad ticker shouldn't kill the chunk — try each individually.
        await Promise.all(
          chunk.map(async (t) => {
            try {
              const q = (await yahooFinance.quote(t)) as
                | YahooQuoteShape
                | YahooQuoteShape[];
              const single = Array.isArray(q) ? q[0] : q;
              if (single?.regularMarketPrice != null) {
                result.set(t, single.regularMarketPrice);
              }
            } catch {
              /* skip — null perf for this ticker */
            }
          }),
        );
      }
    }),
  );

  return result;
}

/**
 * Get 1w/1m/3m returns for a single ticker.
 *
 * Strategy: read all past closes from the DB (immutable, never stale), use
 * the freshly-batched live quote as `end`, and look up `start` for each
 * comparison period via `closeAtOrBefore`. If the DB is sparse for this
 * ticker (first time we've seen it), do a one-time chart() backfill.
 *
 * Today's close is appended back into the DB so tomorrow's request finds it
 * as part of history — keeping the materialized view continuously current
 * without ever needing to refetch past closes.
 */
async function getTickerPerformance(
  ticker: string,
  liveClose: number | null | undefined,
): Promise<PerfTriple> {
  let history = await loadHistoricalCloses(ticker);

  // First time we've seen this ticker (or the DB is sparse) → backfill.
  if (history.length < MIN_CACHED_ROWS) {
    history = await backfillTickerHistory(ticker);
  }

  // The "end" close: prefer the live quote, fall back to the freshest DB row.
  const end =
    liveClose != null
      ? liveClose
      : history.length > 0
        ? history[history.length - 1].close
        : null;

  if (end == null) {
    return {
      performance_1w: null,
      performance_1m: null,
      performance_3m: null,
    };
  }

  // Append today's live close to history so it becomes part of the
  // materialized view going forward. Idempotent via the unique index.
  if (liveClose != null) {
    const todayStr = new Date().toISOString().split("T")[0];
    storeStockPrices(ticker, [{ date: todayStr, close: liveClose }]).catch(
      (e) =>
        logger.warn(LOG_SRC, `Failed to append today's close for ${ticker}`, {
          error: e,
        }),
    );
  }

  // Compute the comparison start dates and look them up in history.
  const today = new Date();
  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(today.getDate() - 7);
  const oneMonthAgo = new Date();
  oneMonthAgo.setMonth(today.getMonth() - 1);
  const threeMonthsAgo = new Date();
  threeMonthsAgo.setMonth(today.getMonth() - 3);

  const start1w = closeAtOrBefore(history, oneWeekAgo);
  const start1m = closeAtOrBefore(history, oneMonthAgo);
  const start3m = closeAtOrBefore(history, threeMonthsAgo);

  return {
    performance_1w: calcPerformance(start1w, end),
    performance_1m: calcPerformance(start1m, end),
    performance_3m: calcPerformance(start3m, end),
  };
}

/**
 * Legacy single-period helper kept for `fetchThemePrices()` below. Goes
 * through the same DB-first store but does NOT use a batched live quote
 * (the caller already fetches its own quotes).
 */
async function getHistoricalPrices(
  ticker: string,
  period: "1w" | "1m" | "3m",
): Promise<{ start: number | null; end: number | null }> {
  let history = await loadHistoricalCloses(ticker);
  if (history.length < MIN_CACHED_ROWS) {
    history = await backfillTickerHistory(ticker);
  }
  if (history.length === 0) return { start: null, end: null };

  const end = history[history.length - 1].close;
  const targetDate = new Date();
  if (period === "1w") targetDate.setDate(targetDate.getDate() - 7);
  else if (period === "1m") targetDate.setMonth(targetDate.getMonth() - 1);
  else targetDate.setMonth(targetDate.getMonth() - 3);

  return { start: closeAtOrBefore(history, targetDate), end };
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

  // Two batched Yahoo calls in parallel: today's live quotes + crowding.
  // Live quotes drive the "end" close for every comparison; the historical
  // "start" closes come from the DB and never need a Yahoo round-trip.
  const [liveQuoteMap, crowdingMap] = await Promise.all([
    fetchLiveQuotes(allTickers),
    getCrowdingScores(allTickers),
  ]);

  // Bounded-concurrency per-ticker DB read + (rare) chart() backfill.
  const CONCURRENCY = 10;
  const perfMap = new Map<string, TickerPerf>();

  let cursor = 0;
  async function worker() {
    while (cursor < allTickers.length) {
      const idx = cursor++;
      const ticker = allTickers[idx];
      try {
        // DB read + live quote drives the comparison. Backfill (1 chart() call)
        // only fires the first time we see this ticker.
        perfMap.set(
          ticker,
          await getTickerPerformance(ticker, liveQuoteMap.get(ticker)),
        );
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
