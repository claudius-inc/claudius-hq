/**
 * GET /api/markets/{market}/detail
 *
 * Returns market-level context per market. Returned shape varies:
 *  - US  → US_MARKET_CONTEXT     (sentiment + breadth, market-wide)
 *  - SGX → SGX_FLOW              (STI dividend yield − SGS 10y yield —
 *                                 the cleanest "is Singapore equities
 *                                 attractive vs risk-free" signal for an
 *                                 income-heavy market)
 *  - CN  → CN_NORTHBOUND_FLOW    (HK→SH+SZ Stock Connect daily turnover
 *                                 from Eastmoney HSGT; market-wide)
 *  - JP  → JP_FX                 (USD/JPY spot + 50/200-day MAs from
 *                                 Yahoo Finance; the dominant macro
 *                                 variable for Nikkei earnings)
 *  - HK  → HK_FLOW               (southbound (CN→HK) Stock Connect net
 *                                 flow from Eastmoney; market-wide)
 *  - LSE / KS → PLACEHOLDER      (no fetcher wired)
 *
 * Caches the response in `market_cache` for 5 minutes keyed by market.
 */

import { NextRequest, NextResponse } from "next/server";
import { WATCHLIST_MARKETS, type WatchlistMarket } from "@/db/schema";
import { getCache, setCache } from "@/lib/cache/market-cache";
import { logger } from "@/lib/logger";
import { fetchSentimentData } from "@/lib/markets/sentiment";
import { fetchBreadthData } from "@/lib/markets/breadth";
import {
  fetchCNNorthboundFlow,
  type CNNorthboundFlowData,
} from "@/lib/markets/flows/cn";
import { fetchJPFX, type JPFXData } from "@/lib/markets/flows/jp";
import {
  fetchHKSouthboundFlow,
  type HKFlowData,
} from "@/lib/markets/flows/hk";
import { fetchSGXFlow, type SGXFlowData } from "@/lib/markets/flows/sgx";

export const dynamic = "force-dynamic";

const CACHE_MAX_AGE = 5 * 60; // 5 minutes

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

interface SGXFlowAggregate {
  type: "SGX_FLOW";
  flow: SGXFlowData | null;
}

interface CNNorthboundFlowAggregate {
  type: "CN_NORTHBOUND_FLOW";
  flow: CNNorthboundFlowData | null;
}

interface JPFXAggregate {
  type: "JP_FX";
  flow: JPFXData | null;
}

interface HKFlowAggregate {
  type: "HK_FLOW";
  flow: HKFlowData | null;
}

interface PlaceholderAggregate {
  type: "PLACEHOLDER";
  message: string;
}

type SignalAggregate =
  | USMarketContextAggregate
  | SGXFlowAggregate
  | CNNorthboundFlowAggregate
  | JPFXAggregate
  | HKFlowAggregate
  | PlaceholderAggregate;

interface MarketDetailResponse {
  market: WatchlistMarket;
  tickerCount: number; // number of watchlist tickers actually queried (0 when not used)
  signals: SignalAggregate;
  generatedAt: string;
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

async function buildCNAggregate(): Promise<CNNorthboundFlowAggregate> {
  const flow = await fetchCNNorthboundFlow();
  return { type: "CN_NORTHBOUND_FLOW", flow };
}

async function buildJPAggregate(): Promise<JPFXAggregate> {
  const flow = await fetchJPFX();
  return { type: "JP_FX", flow };
}

async function buildHKAggregate(): Promise<HKFlowAggregate> {
  const flow = await fetchHKSouthboundFlow();
  return { type: "HK_FLOW", flow };
}

async function buildSGXAggregate(): Promise<SGXFlowAggregate> {
  const flow = await fetchSGXFlow();
  return { type: "SGX_FLOW", flow };
}

async function buildAggregate(
  market: WatchlistMarket,
): Promise<{ signals: SignalAggregate; tickerCount: number }> {
  switch (market) {
    case "US":
      return { signals: await buildUSContextAggregate(), tickerCount: 0 };
    case "SGX":
      return { signals: await buildSGXAggregate(), tickerCount: 0 };
    case "CN":
      return { signals: await buildCNAggregate(), tickerCount: 0 };
    case "JP":
      return { signals: await buildJPAggregate(), tickerCount: 0 };
    case "HK":
      return { signals: await buildHKAggregate(), tickerCount: 0 };
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

    // None of the current markets requires per-ticker aggregation any
    // more — SGX moved from GLC/S-Chip flags to a yield-spread flow.
    const { signals, tickerCount } = await buildAggregate(market);

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
