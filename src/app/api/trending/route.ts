import { NextRequest, NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";
import { getCache, setCache, CACHE_KEYS } from "@/lib/cache/market-cache";
import { db, themes, themeStocks } from "@/db";
import { eq } from "drizzle-orm";
import { logger } from "@/lib/logger";

const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

export const dynamic = "force-dynamic";

interface HistoricalRow {
  date: Date;
  close: number;
}

interface TrendingItem {
  name: string;
  type: "sector" | "theme" | "commodity" | "crypto";
  ticker?: string;
  price: number | null;
  change1w: number | null;
  change1wPrev: number | null;
  acceleration: number | null;
  trend: "accelerating" | "decelerating" | "stable";
}

// Sector ETFs
const SECTOR_ETFS = [
  { ticker: "XLK", name: "Technology" },
  { ticker: "XLF", name: "Financial" },
  { ticker: "XLY", name: "Consumer Disc." },
  { ticker: "XLC", name: "Communication" },
  { ticker: "XLV", name: "Healthcare" },
  { ticker: "XLI", name: "Industrials" },
  { ticker: "XLP", name: "Consumer Staples" },
  { ticker: "XLE", name: "Energy" },
  { ticker: "XLB", name: "Materials" },
  { ticker: "XLRE", name: "Real Estate" },
  { ticker: "XLU", name: "Utilities" },
];

// Commodities
const COMMODITIES = [
  { ticker: "GC=F", name: "Gold" },
  { ticker: "CL=F", name: "WTI Oil" },
  { ticker: "SI=F", name: "Silver" },
];

// Crypto
const CRYPTO = [
  { ticker: "BTC-USD", name: "Bitcoin" },
  { ticker: "ETH-USD", name: "Ethereum" },
];

// Get price changes for this week and previous week
async function getWeeklyChanges(ticker: string): Promise<{
  price: number | null;
  change1w: number | null;
  change1wPrev: number | null;
}> {
  try {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 21); // 3 weeks back

    const chartResult = await yahooFinance.chart(ticker, {
      period1: startDate,
      period2: endDate,
      interval: "1d",
    });
    const result = chartResult.quotes as HistoricalRow[];

    if (!result || result.length < 10) {
      return { price: null, change1w: null, change1wPrev: null };
    }

    const latestPrice = result[result.length - 1]?.close;
    
    // Find price 7 days ago
    const oneWeekAgoDate = new Date();
    oneWeekAgoDate.setDate(oneWeekAgoDate.getDate() - 7);
    let oneWeekAgoPrice = null;
    for (let i = result.length - 1; i >= 0; i--) {
      if (new Date(result[i].date) <= oneWeekAgoDate) {
        oneWeekAgoPrice = result[i].close;
        break;
      }
    }

    // Find price 14 days ago
    const twoWeeksAgoDate = new Date();
    twoWeeksAgoDate.setDate(twoWeeksAgoDate.getDate() - 14);
    let twoWeeksAgoPrice = null;
    for (let i = result.length - 1; i >= 0; i--) {
      if (new Date(result[i].date) <= twoWeeksAgoDate) {
        twoWeeksAgoPrice = result[i].close;
        break;
      }
    }

    let change1w = null;
    let change1wPrev = null;

    if (latestPrice && oneWeekAgoPrice) {
      change1w = ((latestPrice - oneWeekAgoPrice) / oneWeekAgoPrice) * 100;
    }

    if (oneWeekAgoPrice && twoWeeksAgoPrice) {
      change1wPrev = ((oneWeekAgoPrice - twoWeeksAgoPrice) / twoWeeksAgoPrice) * 100;
    }

    return { price: latestPrice, change1w, change1wPrev };
  } catch (e) {
    logger.error("api/trending", `Failed to get weekly changes for ${ticker}`, { error: e });
    return { price: null, change1w: null, change1wPrev: null };
  }
}

// Calculate theme aggregate performance
async function getThemePerformance(): Promise<TrendingItem[]> {
  try {
    // Get all themes with their stocks
    const allThemes = await db.select().from(themes);
    const results: TrendingItem[] = [];

    for (const theme of allThemes.slice(0, 5)) { // Limit to top 5 themes
      const stocks = await db
        .select()
        .from(themeStocks)
        .where(eq(themeStocks.themeId, theme.id));

      if (stocks.length === 0) continue;

      // Get performance for each stock
      const stockPerfs = await Promise.all(
        stocks.slice(0, 5).map((s) => getWeeklyChanges(s.ticker))
      );

      // Calculate average
      const validPerfs = stockPerfs.filter((p) => p.change1w !== null);
      if (validPerfs.length === 0) continue;

      const avgChange1w = validPerfs.reduce((sum, p) => sum + (p.change1w || 0), 0) / validPerfs.length;
      const validPrevPerfs = stockPerfs.filter((p) => p.change1wPrev !== null);
      const avgChange1wPrev = validPrevPerfs.length > 0
        ? validPrevPerfs.reduce((sum, p) => sum + (p.change1wPrev || 0), 0) / validPrevPerfs.length
        : null;

      const acceleration = avgChange1wPrev !== null ? avgChange1w - avgChange1wPrev : null;

      results.push({
        name: theme.name,
        type: "theme",
        price: null,
        change1w: avgChange1w,
        change1wPrev: avgChange1wPrev,
        acceleration,
        trend: acceleration !== null
          ? acceleration > 1 ? "accelerating" : acceleration < -1 ? "decelerating" : "stable"
          : "stable",
      });
    }

    return results;
  } catch (e) {
    logger.error("api/trending", "Failed to get theme performance", { error: e });
    return [];
  }
}

async function fetchTrendingData(): Promise<TrendingItem[]> {
  const results: TrendingItem[] = [];

  // Fetch sectors
  const sectorPromises = SECTOR_ETFS.map(async (sector) => {
    const data = await getWeeklyChanges(sector.ticker);
    const acceleration = data.change1w !== null && data.change1wPrev !== null
      ? data.change1w - data.change1wPrev
      : null;

    return {
      name: sector.name,
      type: "sector" as const,
      ticker: sector.ticker,
      price: data.price,
      change1w: data.change1w,
      change1wPrev: data.change1wPrev,
      acceleration,
      trend: acceleration !== null
        ? acceleration > 1 ? "accelerating" as const : acceleration < -1 ? "decelerating" as const : "stable" as const
        : "stable" as const,
    };
  });

  // Fetch commodities
  const commodityPromises = COMMODITIES.map(async (commodity) => {
    const data = await getWeeklyChanges(commodity.ticker);
    const acceleration = data.change1w !== null && data.change1wPrev !== null
      ? data.change1w - data.change1wPrev
      : null;

    return {
      name: commodity.name,
      type: "commodity" as const,
      ticker: commodity.ticker,
      price: data.price,
      change1w: data.change1w,
      change1wPrev: data.change1wPrev,
      acceleration,
      trend: acceleration !== null
        ? acceleration > 1 ? "accelerating" as const : acceleration < -1 ? "decelerating" as const : "stable" as const
        : "stable" as const,
    };
  });

  // Fetch crypto
  const cryptoPromises = CRYPTO.map(async (crypto) => {
    const data = await getWeeklyChanges(crypto.ticker);
    const acceleration = data.change1w !== null && data.change1wPrev !== null
      ? data.change1w - data.change1wPrev
      : null;

    return {
      name: crypto.name,
      type: "crypto" as const,
      ticker: crypto.ticker,
      price: data.price,
      change1w: data.change1w,
      change1wPrev: data.change1wPrev,
      acceleration,
      trend: acceleration !== null
        ? acceleration > 1 ? "accelerating" as const : acceleration < -1 ? "decelerating" as const : "stable" as const
        : "stable" as const,
    };
  });

  // Fetch all in parallel
  const [sectors, commodities, crypto, themes] = await Promise.all([
    Promise.all(sectorPromises),
    Promise.all(commodityPromises),
    Promise.all(cryptoPromises),
    getThemePerformance(),
  ]);

  results.push(...sectors, ...commodities, ...crypto, ...themes);

  // Sort by absolute acceleration (biggest movers first)
  results.sort((a, b) => {
    const accA = Math.abs(a.acceleration || 0);
    const accB = Math.abs(b.acceleration || 0);
    return accB - accA;
  });

  return results;
}

export async function GET(request: NextRequest) {
  try {
    const fresh = request.nextUrl.searchParams.get("fresh") === "true";
    const limit = parseInt(request.nextUrl.searchParams.get("limit") || "10", 10);

    // Check cache first (unless forcing fresh)
    if (!fresh) {
      const cached = await getCache<TrendingItem[]>(CACHE_KEYS.TRENDING, 600); // 10 min max age
      if (cached && !cached.isStale) {
        return NextResponse.json({
          items: cached.data.slice(0, limit),
          total: cached.data.length,
          updatedAt: cached.updatedAt,
          cached: true,
        });
      }

      // Return stale data immediately, refresh in background
      if (cached) {
        fetchTrendingData()
          .then((data) => setCache(CACHE_KEYS.TRENDING, data))
          .catch((e) => logger.error("api/trending", "Background trending refresh failed", { error: e }));

        return NextResponse.json({
          items: cached.data.slice(0, limit),
          total: cached.data.length,
          updatedAt: cached.updatedAt,
          cached: true,
          isStale: true,
        });
      }
    }

    // Fetch fresh data
    const data = await fetchTrendingData();
    
    // Update cache
    await setCache(CACHE_KEYS.TRENDING, data);

    return NextResponse.json({
      items: data.slice(0, limit),
      total: data.length,
      updatedAt: new Date().toISOString(),
      cached: false,
    });
  } catch (e) {
    logger.error("api/trending", "Trending API error", { error: e });
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
