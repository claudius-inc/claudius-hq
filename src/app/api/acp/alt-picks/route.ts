/**
 * POST /api/acp/alt-picks
 * 
 * Altcoin screening endpoint using CoinGecko data.
 * Returns top N altcoins ranked by composite score.
 * 
 * Scoring weights: Momentum 50% + Volume 25% + Market Cap 25%
 */

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";

// ─── Scoring Functions (inlined) ─────────────────────────────────────────────

interface AltMetrics {
  priceChange24h: number;
  priceChange7d: number;
  priceChange30d: number;
  volume24h: number;
  marketCap: number;
  marketCapRank: number;
}

function calculateAltMomentumScore(metrics: AltMetrics): number {
  const w24h = 0.5, w7d = 0.3, w30d = 0.2;
  
  // Normalize to 0-10 scale (cap at ±50%)
  const norm24h = Math.min(10, Math.max(0, (metrics.priceChange24h + 50) / 10));
  const norm7d = Math.min(10, Math.max(0, (metrics.priceChange7d + 50) / 10));
  const norm30d = Math.min(10, Math.max(0, (metrics.priceChange30d + 50) / 10));
  
  return norm24h * w24h + norm7d * w7d + norm30d * w30d;
}

function calculateAltVolumeScore(metrics: AltMetrics): number {
  const volumeRatio = metrics.volume24h / (metrics.marketCap || 1);
  
  // Volume/MCap ratio of 0.1 (10%) = score of 10
  return Math.min(10, volumeRatio * 100);
}

function calculateAltMarketRankScore(rank: number): number {
  // Top 10 = 10, Top 50 = 8, Top 100 = 6, Top 250 = 4, else = 2
  if (rank <= 10) return 10;
  if (rank <= 50) return 8;
  if (rank <= 100) return 6;
  if (rank <= 250) return 4;
  return 2;
}

function calculateAltCompositeScore(scores: { momentum: number; volume: number; marketRank: number }): number {
  // Weights: Momentum 50%, Volume 25%, Market Rank 25%
  return scores.momentum * 0.5 + scores.volume * 0.25 + scores.marketRank * 0.25;
}

function calculateFDVRatio(mcap: number, fdv: number | null): number {
  if (!fdv || fdv === 0) return 1;
  return mcap / fdv;
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface AltPicksRequest {
  count?: number;
  min_market_cap?: number;
  max_market_cap?: number;
  category?: string | null;
  min_score?: number;
}

interface AltPick {
  rank: number;
  id: string;
  symbol: string;
  name: string;
  category: string[];
  composite_score: number;
  scores: {
    momentum: number;
    volume: number;
    market_rank: number;
  };
  metrics: {
    price_change_24h: number | null;
    price_change_7d: number | null;
    price_change_30d: number | null;
    ath_change: number | null;
    volume_24h: number;
    volume_market_cap_ratio: number;
    volume_change_24h: number | null;
    market_cap_rank: number;
    fdv_ratio: number;
  };
  market_cap: number;
  fully_diluted_valuation: number | null;
  circulating_supply: number;
  total_supply: number | null;
  max_supply: number | null;
  last_price: number;
}

interface CoinGeckoMarketData {
  id: string;
  symbol: string;
  name: string;
  current_price: number;
  market_cap: number;
  market_cap_rank: number;
  fully_diluted_valuation: number | null;
  total_volume: number;
  high_24h: number;
  low_24h: number;
  price_change_24h: number;
  price_change_percentage_24h: number;
  price_change_percentage_7d_in_currency?: number;
  price_change_percentage_30d_in_currency?: number;
  market_cap_change_24h: number;
  market_cap_change_percentage_24h: number;
  circulating_supply: number;
  total_supply: number | null;
  max_supply: number | null;
  ath: number;
  ath_change_percentage: number;
  ath_date: string;
  atl: number;
  atl_change_percentage: number;
  atl_date: string;
  roi: unknown;
  last_updated: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const COINGECKO_BASE = "https://api.coingecko.com/api/v3";
const CACHE_TTL = 300; // 5 minutes
const RATE_LIMIT_MS = 1000; // CoinGecko rate limit is ~10-30 req/min for free tier

// Stable coins and wrapped tokens to exclude
const EXCLUDED_SYMBOLS = new Set([
  "usdt", "usdc", "dai", "busd", "tusd", "usdp", "frax", "usdd", "gusd", "paxg",
  "wbtc", "weth", "steth", "wsteth", "reth", "cbeth", "frxeth", "sfrxeth",
  "hbtc", "renbtc", "tbtc", "sbtc", "btcb", "cbtc",
]);

// Category mappings for filtering
const CATEGORY_ALIASES: Record<string, string[]> = {
  "ai": ["artificial-intelligence", "ai-agents", "machine-learning"],
  "defi": ["decentralized-finance-defi", "defi", "lending-borrowing", "dex"],
  "gaming": ["gaming", "play-to-earn", "metaverse", "nft-gaming"],
  "layer1": ["layer-1", "smart-contract-platform", "ethereum-ecosystem"],
  "layer2": ["layer-2", "optimistic-rollups", "zk-rollups"],
  "meme": ["meme-token", "dog-themed-coins"],
  "rwa": ["real-world-assets", "tokenized-securities"],
  "storage": ["distributed-computing", "storage", "filesharing"],
};

// Simple in-memory cache
const cache = new Map<string, { data: unknown; timestamp: number }>();

// ─── Helper Functions ────────────────────────────────────────────────────────

function getCacheKey(category: string | null): string {
  return `scan:alts:${category || "all"}`;
}

function getFromCache<T>(key: string): T | null {
  const cached = cache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL * 1000) {
    return cached.data as T;
  }
  return null;
}

function setCache<T>(key: string, data: T): void {
  cache.set(key, { data, timestamp: Date.now() });
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Fetch coin market data from CoinGecko
 */
async function fetchCoinGeckoMarkets(
  page: number = 1,
  perPage: number = 250
): Promise<CoinGeckoMarketData[]> {
  const params = new URLSearchParams({
    vs_currency: "usd",
    order: "market_cap_desc",
    per_page: perPage.toString(),
    page: page.toString(),
    sparkline: "false",
    price_change_percentage: "24h,7d,30d",
  });

  const headers: HeadersInit = {
    Accept: "application/json",
  };

  // Use API key if available
  const apiKey = process.env.COINGECKO_API_KEY;
  if (apiKey) {
    headers["x-cg-pro-api-key"] = apiKey;
  }

  const response = await fetch(`${COINGECKO_BASE}/coins/markets?${params}`, {
    headers,
    cache: "no-store", // We handle caching ourselves
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`CoinGecko API error: ${response.status} - ${text}`);
  }

  return response.json();
}

/**
 * Fetch category data from CoinGecko
 */
async function fetchCoinsByCategory(category: string): Promise<Set<string>> {
  const expandedCategories = CATEGORY_ALIASES[category.toLowerCase()] || [category];
  const coinIds = new Set<string>();

  for (const cat of expandedCategories) {
    try {
      const params = new URLSearchParams({
        vs_currency: "usd",
        category: cat,
        per_page: "250",
        page: "1",
      });

      const headers: HeadersInit = { Accept: "application/json" };
      const apiKey = process.env.COINGECKO_API_KEY;
      if (apiKey) {
        headers["x-cg-pro-api-key"] = apiKey;
      }

      const response = await fetch(`${COINGECKO_BASE}/coins/markets?${params}`, { headers });
      
      if (response.ok) {
        const coins: CoinGeckoMarketData[] = await response.json();
        for (const coin of coins) {
          coinIds.add(coin.id);
        }
      }
      
      // Rate limit
      await sleep(RATE_LIMIT_MS);
    } catch (error) {
      logger.warn("acp/alt-picks", `Failed to fetch category ${cat}`, { error });
    }
  }

  return coinIds;
}

/**
 * Process and score coins
 */
function processAndScoreCoins(coins: CoinGeckoMarketData[]): AltPick[] {
  // Filter out stable coins, wrapped tokens, and coins with missing data
  const filteredCoins = coins.filter(coin => {
    if (EXCLUDED_SYMBOLS.has(coin.symbol.toLowerCase())) return false;
    if (!coin.market_cap || coin.market_cap === 0) return false;
    if (coin.market_cap_rank === null || coin.market_cap_rank === undefined) return false;
    return true;
  });

  // Score each coin
  const scoredCoins = filteredCoins.map(coin => {
    const volumeMarketCapRatio = coin.market_cap > 0 
      ? coin.total_volume / coin.market_cap 
      : 0;

    const metrics = {
      priceChange24h: coin.price_change_percentage_24h || 0,
      priceChange7d: coin.price_change_percentage_7d_in_currency || 0,
      priceChange30d: coin.price_change_percentage_30d_in_currency || 0,
      athChange: coin.ath_change_percentage || 0,
      volume24h: coin.total_volume,
      marketCap: coin.market_cap,
      marketCapRank: coin.market_cap_rank,
      volumeChange24h: undefined, // CoinGecko doesn't provide this in markets endpoint
      fullyDilutedValuation: coin.fully_diluted_valuation,
    };

    const momentumScore = calculateAltMomentumScore(metrics);
    const volumeScore = calculateAltVolumeScore(metrics);
    const marketRankScore = calculateAltMarketRankScore(metrics.marketCapRank);
    const compositeScore = calculateAltCompositeScore({
      momentum: momentumScore,
      volume: volumeScore,
      marketRank: marketRankScore,
    });

    const fdvRatio = calculateFDVRatio(coin.market_cap, coin.fully_diluted_valuation);

    // Infer category from common patterns
    const inferredCategories: string[] = [];
    const nameLower = coin.name.toLowerCase();
    const symbolLower = coin.symbol.toLowerCase();
    
    if (nameLower.includes("ai") || nameLower.includes("artificial")) inferredCategories.push("ai");
    if (nameLower.includes("meme") || ["doge", "shib", "pepe", "floki", "bonk"].includes(symbolLower)) {
      inferredCategories.push("meme");
    }
    if (nameLower.includes("game") || nameLower.includes("play")) inferredCategories.push("gaming");

    const pick: Omit<AltPick, "rank"> & { _compositeScore: number } = {
      _compositeScore: compositeScore,
      id: coin.id,
      symbol: coin.symbol.toUpperCase(),
      name: coin.name,
      category: inferredCategories.length > 0 ? inferredCategories : ["unknown"],
      composite_score: Math.round(compositeScore * 10) / 10,
      scores: {
        momentum: Math.round(momentumScore * 10) / 10,
        volume: Math.round(volumeScore * 10) / 10,
        market_rank: Math.round(marketRankScore * 10) / 10,
      },
      metrics: {
        price_change_24h: coin.price_change_percentage_24h !== null 
          ? Math.round(coin.price_change_percentage_24h * 10) / 10 
          : null,
        price_change_7d: coin.price_change_percentage_7d_in_currency !== undefined 
          ? Math.round(coin.price_change_percentage_7d_in_currency * 10) / 10 
          : null,
        price_change_30d: coin.price_change_percentage_30d_in_currency !== undefined 
          ? Math.round(coin.price_change_percentage_30d_in_currency * 10) / 10 
          : null,
        ath_change: coin.ath_change_percentage !== null 
          ? Math.round(coin.ath_change_percentage * 10) / 10 
          : null,
        volume_24h: Math.round(coin.total_volume),
        volume_market_cap_ratio: Math.round(volumeMarketCapRatio * 1000) / 1000,
        volume_change_24h: null, // Not available from this endpoint
        market_cap_rank: coin.market_cap_rank,
        fdv_ratio: Math.round(fdvRatio * 100) / 100,
      },
      market_cap: Math.round(coin.market_cap),
      fully_diluted_valuation: coin.fully_diluted_valuation 
        ? Math.round(coin.fully_diluted_valuation) 
        : null,
      circulating_supply: Math.round(coin.circulating_supply),
      total_supply: coin.total_supply !== null ? Math.round(coin.total_supply) : null,
      max_supply: coin.max_supply !== null ? Math.round(coin.max_supply) : null,
      last_price: coin.current_price,
    };

    return pick;
  });

  // Sort by composite score (descending)
  scoredCoins.sort((a, b) => b._compositeScore - a._compositeScore);

  // Add ranks and remove internal score
  return scoredCoins.map((coin, index) => {
    const { _compositeScore: _score, ...rest } = coin;
    void _score; // Explicitly ignore unused variable
    return { ...rest, rank: index + 1 };
  });
}

// ─── Route Handler ───────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // Note: Auth handled by middleware for /api/acp/* routes (public ACP endpoints)
  try {
    const body: AltPicksRequest = await req.json();
    const {
      count = 10,
      min_market_cap = 10_000_000,
      max_market_cap = null,
      category = null,
      min_score = 0,
    } = body;

    // Validate inputs
    if (count < 1 || count > 50) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_COUNT", message: "Count must be between 1 and 50" } },
        { status: 400 }
      );
    }

    // Check cache
    const cacheKey = getCacheKey(category);
    let picks = getFromCache<AltPick[]>(cacheKey);
    let totalScreened: number;

    if (picks) {
      logger.info("acp/alt-picks", `Cache hit for ${cacheKey}`);
      totalScreened = picks.length;
    } else {
      logger.info("acp/alt-picks", `Fetching altcoin data...`);

      // Fetch market data (first 500 coins by market cap)
      const [page1, page2] = await Promise.all([
        fetchCoinGeckoMarkets(1, 250),
        fetchCoinGeckoMarkets(2, 250),
      ]);
      
      let allCoins = [...page1, ...page2];
      
      // If category filter, get category coins and filter
      if (category) {
        const categoryCoins = await fetchCoinsByCategory(category);
        if (categoryCoins.size > 0) {
          allCoins = allCoins.filter(coin => categoryCoins.has(coin.id));
        }
      }
      
      totalScreened = allCoins.length;
      
      // Process and score
      picks = processAndScoreCoins(allCoins);
      
      // Cache results
      setCache(cacheKey, picks);
      
      logger.info("acp/alt-picks", `Screened ${totalScreened} altcoins`);
    }

    // Apply filters
    picks = picks.filter(p => {
      if (p.market_cap < min_market_cap) return false;
      if (max_market_cap !== null && p.market_cap > max_market_cap) return false;
      if (min_score > 0 && p.composite_score < min_score) return false;
      return true;
    });

    // Limit results
    picks = picks.slice(0, count);

    // Re-rank after filtering
    picks = picks.map((p, i) => ({ ...p, rank: i + 1 }));

    return NextResponse.json({
      success: true,
      data: {
        scan_timestamp: new Date().toISOString(),
        total_screened: totalScreened,
        picks,
      },
      meta: {
        weights: {
          momentum: 0.50,
          volume: 0.25,
          market_rank: 0.25,
        },
        cache_ttl_seconds: CACHE_TTL,
      },
    });
  } catch (error) {
    logger.error("acp/alt-picks", "Error processing scan", { error });
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "Failed to process alt picks scan" } },
      { status: 500 }
    );
  }
}

// Also support GET for simple queries
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const count = parseInt(searchParams.get("count") || "10");
  const category = searchParams.get("category") || null;
  const minMarketCap = parseInt(searchParams.get("min_market_cap") || "10000000");
  
  // Create a mock request with the params
  const mockReq = new NextRequest(req.url, {
    method: "POST",
    headers: req.headers,
    body: JSON.stringify({
      count,
      category,
      min_market_cap: minMarketCap,
    }),
  });
  
  return POST(mockReq);
}
