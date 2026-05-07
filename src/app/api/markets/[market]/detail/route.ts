/**
 * GET /api/markets/{market}/detail
 *
 * Returns market-level context per market. Returned shape varies:
 *  - US  → US_MARKET_CONTEXT (sentiment + breadth, market-wide)
 *  - SGX → SGX_FLAGS         (GLC / S-Chip distribution — structural,
 *                             not flow, but factually accurate)
 *  - CN  → CN_CONNECT        (Stock Connect inflows / outflows from
 *                             watchlist sample, with caveat)
 *  - HK / JP → PLACEHOLDER   (proper market-level flow fetchers pending)
 *  - LSE / KS → PLACEHOLDER  (no fetcher wired)
 *
 * Caches the response in `market_cache` for 5 minutes keyed by market.
 */

import { NextRequest, NextResponse } from "next/server";
import { db, scannerUniverse, tickerMetrics } from "@/db";
import { WATCHLIST_MARKETS, type WatchlistMarket } from "@/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { getCache, setCache } from "@/lib/cache/market-cache";
import { logger } from "@/lib/logger";
import {
  fetchSGMarketFlags,
  fetchCNStockConnectSignals,
} from "@/lib/scanner/signals";
import { fetchSentimentData } from "@/lib/markets/sentiment";
import { fetchBreadthData } from "@/lib/markets/breadth";

export const dynamic = "force-dynamic";

const CACHE_MAX_AGE = 5 * 60; // 5 minutes
const TICKER_CAP = 20;

function isWatchlistMarket(value: string): value is WatchlistMarket {
  return (WATCHLIST_MARKETS as readonly string[]).includes(value);
}

type SentimentData = Awaited<ReturnType<typeof fetchSentimentData>>;
type BreadthData = Awaited<ReturnType<typeof fetchBreadthData>>;

interface USMarketContextAggregate {
  type: "US_MARKET_CONTEXT";
  sentiment: SentimentData | null;
  breadth: BreadthData | null;
  asOf: string;
}

interface SGXFlagsAggregate {
  type: "SGX_FLAGS";
  glcCount: number;
  schipCount: number;
  glcByParent: Record<string, number>;
  glcs: Array<{ ticker: string; name: string | null; parent: string | null }>;
  schips: Array<{ ticker: string; name: string | null }>;
}

interface CNConnectAggregate {
  type: "CN_CONNECT";
  totalNorthboundHolding: number;
  totalDailyChange: number;
  averagePercentOfFloat: number;
  topInflows: Array<{
    ticker: string;
    name: string | null;
    percentOfFloat: number;
    dailyChange: number;
  }>;
  topOutflows: Array<{
    ticker: string;
    name: string | null;
    percentOfFloat: number;
    dailyChange: number;
  }>;
  caveat: string;
}

interface PlaceholderAggregate {
  type: "PLACEHOLDER";
  message: string;
}

type SignalAggregate =
  | USMarketContextAggregate
  | SGXFlagsAggregate
  | CNConnectAggregate
  | PlaceholderAggregate;

interface MarketDetailResponse {
  market: WatchlistMarket;
  tickerCount: number; // number of watchlist tickers actually queried (0 when not used)
  signals: SignalAggregate;
  generatedAt: string;
}

interface UniverseRow {
  ticker: string;
  name: string | null;
}

/**
 * Pick the top N enabled tickers in a market, ranked by `momentumScore`
 * desc (nulls last). The momentum join is left so tickers without a
 * computed metric still appear at the bottom.
 */
async function pickTickers(
  market: WatchlistMarket,
  cap: number,
): Promise<UniverseRow[]> {
  const rows = await db
    .select({
      ticker: scannerUniverse.ticker,
      name: scannerUniverse.name,
      momentumScore: tickerMetrics.momentumScore,
    })
    .from(scannerUniverse)
    .leftJoin(tickerMetrics, eq(tickerMetrics.ticker, scannerUniverse.ticker))
    .where(
      and(
        eq(scannerUniverse.market, market),
        eq(scannerUniverse.enabled, true),
      ),
    )
    .orderBy(desc(tickerMetrics.momentumScore));

  return rows.slice(0, cap).map((r) => ({ ticker: r.ticker, name: r.name }));
}

async function buildUSContextAggregate(): Promise<USMarketContextAggregate> {
  const contextCacheKey = "markets:detail:US:context";
  const cached = await getCache<{
    sentiment: SentimentData | null;
    breadth: BreadthData | null;
    asOf: string;
  }>(contextCacheKey, CACHE_MAX_AGE);

  if (cached && !cached.isStale) {
    return { type: "US_MARKET_CONTEXT", ...cached.data };
  }

  const [sentimentResult, breadthResult] = await Promise.allSettled([
    fetchSentimentData(),
    fetchBreadthData(),
  ]);

  const sentiment =
    sentimentResult.status === "fulfilled" ? sentimentResult.value : null;
  const breadth =
    breadthResult.status === "fulfilled" ? breadthResult.value : null;

  if (sentimentResult.status === "rejected") {
    logger.warn("api/markets/detail", "US sentiment fetch failed", {
      error: sentimentResult.reason,
    });
  }
  if (breadthResult.status === "rejected") {
    logger.warn("api/markets/detail", "US breadth fetch failed", {
      error: breadthResult.reason,
    });
  }

  const payload = {
    sentiment,
    breadth,
    asOf: new Date().toISOString(),
  };

  await setCache(contextCacheKey, payload);

  return { type: "US_MARKET_CONTEXT", ...payload };
}

function buildSGAggregate(rows: UniverseRow[]): SGXFlagsAggregate {
  // Synchronous fetcher
  const fetched = rows.map((r) => ({
    ticker: r.ticker,
    name: r.name,
    signals: fetchSGMarketFlags(r.ticker),
  }));

  const glcs: SGXFlagsAggregate["glcs"] = [];
  const schips: SGXFlagsAggregate["schips"] = [];
  const glcByParent: Record<string, number> = {};

  for (const f of fetched) {
    if (f.signals.isGLC) {
      const parent = f.signals.glcParent ?? "Unknown";
      glcs.push({ ticker: f.ticker, name: f.name, parent });
      glcByParent[parent] = (glcByParent[parent] ?? 0) + 1;
    }
    if (f.signals.isSChip) {
      schips.push({ ticker: f.ticker, name: f.name });
    }
  }

  return {
    type: "SGX_FLAGS",
    glcCount: glcs.length,
    schipCount: schips.length,
    glcByParent,
    glcs,
    schips,
  };
}

async function buildCNAggregate(rows: UniverseRow[]): Promise<CNConnectAggregate> {
  const fetched = await Promise.all(
    rows.map(async (r) => ({
      ticker: r.ticker,
      name: r.name,
      signals: await fetchCNStockConnectSignals(r.ticker),
    })),
  );

  const valid = fetched.filter((f) => f.signals !== null);

  let totalNorthboundHolding = 0;
  let totalDailyChange = 0;
  let percentSum = 0;
  for (const f of valid) {
    const s = f.signals!;
    totalNorthboundHolding += s.northboundHolding;
    totalDailyChange += s.dailyChange;
    percentSum += s.percentOfFloat;
  }

  const averagePercentOfFloat =
    valid.length > 0 ? percentSum / valid.length : 0;

  const ranked = valid.map((f) => ({
    ticker: f.ticker,
    name: f.name,
    percentOfFloat: f.signals!.percentOfFloat,
    dailyChange: f.signals!.dailyChange,
  }));

  const topInflows = ranked
    .filter((r) => r.dailyChange > 0)
    .sort((a, b) => b.dailyChange - a.dailyChange)
    .slice(0, 5);

  const topOutflows = ranked
    .filter((r) => r.dailyChange < 0)
    .sort((a, b) => a.dailyChange - b.dailyChange) // most negative first
    .slice(0, 5);

  return {
    type: "CN_CONNECT",
    totalNorthboundHolding,
    totalDailyChange,
    averagePercentOfFloat,
    topInflows,
    topOutflows,
    caveat:
      "Watchlist sample (20 tickers); market-wide source via HKEX northbound feed pending",
  };
}

async function buildAggregate(
  market: WatchlistMarket,
  rows: UniverseRow[],
): Promise<{ signals: SignalAggregate; tickerCount: number }> {
  switch (market) {
    case "US":
      return { signals: await buildUSContextAggregate(), tickerCount: 0 };
    case "SGX":
      return { signals: buildSGAggregate(rows), tickerCount: rows.length };
    case "CN":
      return { signals: await buildCNAggregate(rows), tickerCount: rows.length };
    case "HK":
      return {
        signals: {
          type: "PLACEHOLDER",
          message:
            "Market-level flow data (south-bound flow, HIBOR, HSI dividend yield) not yet wired",
        },
        tickerCount: 0,
      };
    case "JP":
      return {
        signals: {
          type: "PLACEHOLDER",
          message:
            "Market-level flow data (USD/JPY, BOJ stance, foreign equity buying) not yet wired",
        },
        tickerCount: 0,
      };
    case "KS":
    case "LSE":
    default:
      return {
        signals: {
          type: "PLACEHOLDER",
          message: "Per-market signals not yet wired for this market",
        },
        tickerCount: 0,
      };
  }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ market: string }> },
) {
  const { market: marketParam } = await params;
  const market = marketParam.toUpperCase();

  if (!isWatchlistMarket(market)) {
    return NextResponse.json(
      { error: `Unknown market '${marketParam}'` },
      { status: 400 },
    );
  }

  const cacheKey = `markets:detail:${market}`;

  try {
    const cached = await getCache<MarketDetailResponse>(cacheKey, CACHE_MAX_AGE);
    if (cached && !cached.isStale) {
      return NextResponse.json(cached.data);
    }

    // Only pick tickers for markets that still need them (SGX, CN).
    const needsTickers = market === "SGX" || market === "CN";
    const rows = needsTickers ? await pickTickers(market, TICKER_CAP) : [];
    const { signals, tickerCount } = await buildAggregate(market, rows);

    const response: MarketDetailResponse = {
      market,
      tickerCount,
      signals,
      generatedAt: new Date().toISOString(),
    };

    await setCache(cacheKey, response);

    return NextResponse.json(response);
  } catch (error) {
    logger.error("api/markets/detail", `Error building detail for ${market}`, {
      error,
    });

    // Try to serve stale-but-still-cached data on error
    const stale = await getCache<MarketDetailResponse>(cacheKey, CACHE_MAX_AGE * 12);
    if (stale) {
      return NextResponse.json(stale.data);
    }

    return NextResponse.json(
      { error: "Failed to build market detail" },
      { status: 500 },
    );
  }
}
