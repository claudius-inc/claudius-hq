/**
 * Watchlist scoring orchestrator.
 *
 * Fetches data from DB + Yahoo, calls scoreMomentum/scoreTechnical, and writes
 * results back to DB. Separated from watchlist.ts so that the pure scoring
 * functions remain importable in unit tests without loading @/db.
 *
 * Task 5 (CLI) and Task 7 (API route) should import computeWatchlistScores
 * from this module, NOT from @/lib/scanner/watchlist.
 */

import { db, themeStocks, watchlistScores } from "@/db";
import { logger } from "@/lib/logger";
import { sql } from "drizzle-orm";
import { buildScoringInputs } from "@/lib/scanner/watchlist-fetcher";
import { scoreMomentum, scoreTechnical } from "@/lib/scanner/watchlist";
import type { ScoringInputs } from "@/lib/scanner/watchlist";
import type { NewWatchlistScore, WatchlistMarket } from "@/db/schema";

export interface ComputeResult {
  tickersProcessed: number;
  okCount: number;
  partialCount: number;
  failedCount: number;
  allFailed: boolean;
}

function detectMarket(ticker: string): WatchlistMarket {
  const t = ticker.toUpperCase();
  if (t.endsWith(".SI")) return "SGX";
  if (t.endsWith(".HK")) return "HK";
  if (t.endsWith(".T")) return "JP";
  if (t.endsWith(".KS") || t.endsWith(".KQ")) return "KS";
  if (t.endsWith(".SZ") || t.endsWith(".SS")) return "CN";
  return "US";
}

function classifyQuality(inputs: ScoringInputs | null): "ok" | "partial" | "failed" {
  if (inputs === null) return "failed";
  const required = [
    inputs.return12mEx1m, inputs.fiftyTwoWeekHigh, inputs.fiftyTwoWeekLow,
    inputs.closesAbove20SmaPct60d, inputs.sma200, inputs.sma50, inputs.sma20,
    inputs.rsi14, inputs.macdLine, inputs.macdSignal, inputs.avgVol20d,
    inputs.avgVol60d, inputs.adx14, inputs.price,
  ];
  return required.some((v) => v === null) ? "partial" : "ok";
}

export async function computeWatchlistScores(): Promise<ComputeResult> {
  const startedAt = new Date().toISOString();

  const rows = await db.select({ themeId: themeStocks.themeId, ticker: themeStocks.ticker }).from(themeStocks);

  const themesByTicker = new Map<string, number[]>();
  for (const r of rows) {
    if (!r.ticker) continue;
    const arr = themesByTicker.get(r.ticker) ?? [];
    arr.push(r.themeId);
    themesByTicker.set(r.ticker, arr);
  }

  const tickers = Array.from(themesByTicker.keys());

  if (tickers.length === 0) {
    logger.info("watchlist", "No theme stocks tracked; skipping run");
    return { tickersProcessed: 0, okCount: 0, partialCount: 0, failedCount: 0, allFailed: false };
  }

  const newRows: NewWatchlistScore[] = [];
  let okCount = 0, partialCount = 0, failedCount = 0;

  const CONCURRENCY = 8;
  type Fetched = Awaited<ReturnType<typeof buildScoringInputs>>;
  const fetchedByTicker = new Map<string, Fetched | null>();

  for (let i = 0; i < tickers.length; i += CONCURRENCY) {
    const batch = tickers.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      batch.map((t) =>
        buildScoringInputs(t).catch((err) => {
          logger.warn("watchlist", `Fetch failed for ${t}`, { error: String(err) });
          return null;
        }),
      ),
    );
    batch.forEach((t, j) => fetchedByTicker.set(t, results[j]));
  }

  for (const ticker of tickers) {
    const themeIds = themesByTicker.get(ticker) ?? [];
    const fetched = fetchedByTicker.get(ticker) ?? null;

    const quality = classifyQuality(fetched?.inputs ?? null);
    const momentum = fetched ? scoreMomentum(fetched.inputs) : null;
    const technical = fetched ? scoreTechnical(fetched.inputs) : null;

    if (quality === "ok") okCount++;
    else if (quality === "partial") partialCount++;
    else failedCount++;

    newRows.push({
      ticker,
      name: fetched?.name ?? ticker,
      market: detectMarket(ticker),
      price: fetched?.price ?? null,
      momentumScore: momentum,
      technicalScore: technical,
      priceChange1d: fetched?.pc1d ?? null,
      priceChange1w: fetched?.pc1w ?? null,
      priceChange1m: fetched?.pc1m ?? null,
      priceChange3m: fetched?.pc3m ?? null,
      themeIds: JSON.stringify(themeIds.sort((a, b) => a - b)),
      dataQuality: quality,
      computedAt: startedAt,
    });
  }

  if (failedCount === tickers.length) {
    logger.error("watchlist", "Every ticker fetch failed; skipping DB write");
    return {
      tickersProcessed: tickers.length, okCount: 0, partialCount: 0, failedCount,
      allFailed: true,
    };
  }

  await db.transaction(async (tx) => {
    await tx.delete(watchlistScores).where(
      sql`ticker NOT IN (${sql.join(tickers.map((t) => sql`${t}`), sql`, `)})`
    );
    for (const row of newRows) {
      await tx.insert(watchlistScores).values(row).onConflictDoUpdate({
        target: watchlistScores.ticker,
        set: {
          name: row.name,
          market: row.market,
          price: row.price,
          momentumScore: row.momentumScore,
          technicalScore: row.technicalScore,
          priceChange1d: row.priceChange1d,
          priceChange1w: row.priceChange1w,
          priceChange1m: row.priceChange1m,
          priceChange3m: row.priceChange3m,
          themeIds: row.themeIds,
          dataQuality: row.dataQuality,
          computedAt: row.computedAt,
        },
      });
    }
  });

  logger.info("watchlist", `Run complete: ${okCount} ok / ${partialCount} partial / ${failedCount} failed`);

  return {
    tickersProcessed: tickers.length,
    okCount, partialCount, failedCount,
    allFailed: false,
  };
}
