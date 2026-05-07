/**
 * GET /api/markets/{market}/detail
 *
 * Aggregates the per-market signal type across the watchlist tickers in
 * that market. Returned shape varies by market:
 *  - US  → US_INSIDER     (cluster buys, totals, top buyers)
 *  - HK  → HK_SHORT       (avg short turnover, top shorts)
 *  - JP  → JP_GOVERNANCE  (high-catalyst names, PBR<1 counts)
 *  - SGX → SGX_FLAGS      (GLC / S-Chip distribution)
 *  - CN  → CN_CONNECT     (Stock Connect inflows / outflows)
 *  - LSE / KS → PLACEHOLDER (no fetcher wired yet)
 *
 * Caches the aggregated response in `market_cache` for 5 minutes keyed
 * by market.
 *
 * Performance note: per-ticker signal fetching is bounded to the top 20
 * watchlist tickers by `momentumScore` to keep cold-cache latency
 * predictable. The US insider fetcher in particular scrapes OpenInsider
 * with no shared cache, so 100+ tickers would push us past 30s+. HK / JP
 * / SGX / CN fetchers are either daily-cached or synchronous and would
 * be cheaper, but we cap them too for consistency.
 */

import { NextRequest, NextResponse } from "next/server";
import { db, scannerUniverse, tickerMetrics } from "@/db";
import { WATCHLIST_MARKETS, type WatchlistMarket } from "@/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { getCache, setCache } from "@/lib/cache/market-cache";
import { logger } from "@/lib/logger";
import {
  fetchUSInsiderSignals,
  fetchHKShortSellingSignals,
  fetchJPGovernanceSignals,
  fetchSGMarketFlags,
  fetchCNStockConnectSignals,
} from "@/lib/scanner/signals";

export const dynamic = "force-dynamic";

const CACHE_MAX_AGE = 5 * 60; // 5 minutes
const TICKER_CAP = 20;

function isWatchlistMarket(value: string): value is WatchlistMarket {
  return (WATCHLIST_MARKETS as readonly string[]).includes(value);
}

interface USInsiderAggregate {
  type: "US_INSIDER";
  totalBuyValue: number;
  totalSellValue: number;
  clusterBuyCount: number;
  netInsiderActivity: number;
  topBuyers: Array<{
    ticker: string;
    name: string | null;
    totalBuyValue: number;
    insiderBuyCount: number;
    isClusterBuy: boolean;
  }>;
  asOf: string;
}

interface HKShortAggregate {
  type: "HK_SHORT";
  averageShortTurnoverRatio: number;
  topShorts: Array<{
    ticker: string;
    name: string | null;
    shortTurnoverRatio: number;
    shortVolume: number;
  }>;
  dataDate: string;
}

interface JPGovernanceAggregate {
  type: "JP_GOVERNANCE";
  highCatalystCount: number;
  pbrBelowOneCount: number;
  capitalEfficiencyPlanCount: number;
  topCatalysts: Array<{
    ticker: string;
    name: string | null;
    score: number;
    hasPBRBelowOne: boolean;
    hasCapitalEfficiencyPlan: boolean;
  }>;
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
}

interface PlaceholderAggregate {
  type: "PLACEHOLDER";
  message: string;
}

type SignalAggregate =
  | USInsiderAggregate
  | HKShortAggregate
  | JPGovernanceAggregate
  | SGXFlagsAggregate
  | CNConnectAggregate
  | PlaceholderAggregate;

interface MarketDetailResponse {
  market: WatchlistMarket;
  tickerCount: number; // number of watchlist tickers actually queried
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

async function buildUSAggregate(rows: UniverseRow[]): Promise<USInsiderAggregate> {
  const fetched = await Promise.all(
    rows.map(async (r) => ({
      ticker: r.ticker,
      name: r.name,
      signals: await fetchUSInsiderSignals(r.ticker),
    })),
  );

  let totalBuyValue = 0;
  let totalSellValue = 0;
  let clusterBuyCount = 0;
  let mostRecent: string | undefined;

  const buyers = fetched
    .filter((f) => f.signals !== null)
    .map((f) => {
      const s = f.signals!;
      totalBuyValue += s.totalBuyValue;
      totalSellValue += s.totalSellValue;
      if (s.isClusterBuy) clusterBuyCount += 1;
      if (s.lastTransactionDate && (!mostRecent || s.lastTransactionDate > mostRecent)) {
        mostRecent = s.lastTransactionDate;
      }
      return {
        ticker: f.ticker,
        name: f.name,
        totalBuyValue: s.totalBuyValue,
        insiderBuyCount: s.insiderBuyCount,
        isClusterBuy: s.isClusterBuy,
      };
    });

  const topBuyers = buyers
    .filter((b) => b.totalBuyValue > 0)
    .sort((a, b) => b.totalBuyValue - a.totalBuyValue)
    .slice(0, 5);

  return {
    type: "US_INSIDER",
    totalBuyValue,
    totalSellValue,
    clusterBuyCount,
    netInsiderActivity: totalBuyValue - totalSellValue,
    topBuyers,
    asOf: mostRecent ?? new Date().toISOString().split("T")[0],
  };
}

async function buildHKAggregate(rows: UniverseRow[]): Promise<HKShortAggregate> {
  const fetched = await Promise.all(
    rows.map(async (r) => ({
      ticker: r.ticker,
      name: r.name,
      signals: await fetchHKShortSellingSignals(r.ticker),
    })),
  );

  const valid = fetched.filter((f) => f.signals !== null);
  const ratios = valid.map((f) => f.signals!.shortTurnoverRatio);
  const averageShortTurnoverRatio =
    ratios.length > 0 ? ratios.reduce((a, b) => a + b, 0) / ratios.length : 0;

  const topShorts = valid
    .map((f) => ({
      ticker: f.ticker,
      name: f.name,
      shortTurnoverRatio: f.signals!.shortTurnoverRatio,
      shortVolume: f.signals!.shortVolume,
    }))
    .sort((a, b) => b.shortTurnoverRatio - a.shortTurnoverRatio)
    .slice(0, 5);

  const dataDate = valid[0]?.signals?.dataDate ?? new Date().toISOString().split("T")[0];

  return {
    type: "HK_SHORT",
    averageShortTurnoverRatio,
    topShorts,
    dataDate,
  };
}

function buildJPAggregate(rows: UniverseRow[]): JPGovernanceAggregate {
  // Synchronous fetcher — no Promise.all needed
  const fetched = rows.map((r) => ({
    ticker: r.ticker,
    name: r.name,
    // PBR data isn't stored in scannerUniverse, so we pass undefined
    // (governance score still works, just without the PBR<1 boost).
    signals: fetchJPGovernanceSignals(r.ticker),
  }));

  let highCatalystCount = 0;
  let pbrBelowOneCount = 0;
  let capitalEfficiencyPlanCount = 0;

  const allCatalysts = fetched.map((f) => {
    if (f.signals.governanceCatalystScore >= 7) highCatalystCount += 1;
    if (f.signals.hasPBRBelowOne) pbrBelowOneCount += 1;
    if (f.signals.hasCapitalEfficiencyPlan) capitalEfficiencyPlanCount += 1;
    return {
      ticker: f.ticker,
      name: f.name,
      score: f.signals.governanceCatalystScore,
      hasPBRBelowOne: f.signals.hasPBRBelowOne,
      hasCapitalEfficiencyPlan: f.signals.hasCapitalEfficiencyPlan,
    };
  });

  const topCatalysts = allCatalysts
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  return {
    type: "JP_GOVERNANCE",
    highCatalystCount,
    pbrBelowOneCount,
    capitalEfficiencyPlanCount,
    topCatalysts,
  };
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
  };
}

async function buildAggregate(
  market: WatchlistMarket,
  rows: UniverseRow[],
): Promise<SignalAggregate> {
  switch (market) {
    case "US":
      return buildUSAggregate(rows);
    case "HK":
      return buildHKAggregate(rows);
    case "JP":
      return buildJPAggregate(rows);
    case "SGX":
      return buildSGAggregate(rows);
    case "CN":
      return buildCNAggregate(rows);
    case "KS":
    case "LSE":
    default:
      return {
        type: "PLACEHOLDER",
        message: "Per-market signals not yet wired for this market",
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

    const rows = await pickTickers(market, TICKER_CAP);
    const signals = await buildAggregate(market, rows);

    const response: MarketDetailResponse = {
      market,
      tickerCount: rows.length,
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
