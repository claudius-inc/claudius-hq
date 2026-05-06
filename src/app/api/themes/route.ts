import { NextRequest, NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { eq } from "drizzle-orm";
import { db, themes, themeStocks, themeTags, tags as tagsTable } from "@/db";
import YahooFinance from "yahoo-finance2";
import { ThemeWithPerformance, ThemePerformance } from "@/lib/types";
import { logger } from "@/lib/logger";
import { setThemeTags } from "@/lib/markets/tags";
import { getCrowdingScores, aggregateCrowdingScores, CrowdingScore } from "@/lib/markets/crowding";

// Instantiate Yahoo Finance client
const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

// Revalidate every hour
export const revalidate = 3600;

interface HistoricalRow {
  date: Date;
  close: number;
}

// Get historical prices for a ticker
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

    const rows = result;
    return {
      start: rows[0]?.close ?? null,
      end: rows[rows.length - 1]?.close ?? null,
    };
  } catch {
    return { start: null, end: null };
  }
}

// Calculate performance percentage
function calcPerformance(start: number | null, end: number | null): number | null {
  if (start === null || end === null || start === 0) return null;
  return ((end - start) / start) * 100;
}

// Get all stock performances for a theme (for list view, no watchlist data)
async function getStockPerformances(
  tickers: string[],
  crowdingMap?: Map<string, CrowdingScore>
): Promise<ThemePerformance[]> {
  return Promise.all(
    tickers.map(async (ticker) => {
      try {
        const [prices1w, prices1m, prices3m, quote] = await Promise.all([
          getHistoricalPrices(ticker, "1w"),
          getHistoricalPrices(ticker, "1m"),
          getHistoricalPrices(ticker, "3m"),
          (yahooFinance.quote(ticker) as Promise<{ regularMarketPrice?: number; shortName?: string }>).catch(() => null),
        ]);

        const quoteData = quote as { regularMarketPrice?: number; shortName?: string } | null;
        const crowding = crowdingMap?.get(ticker);

        return {
          ticker,
          name: quoteData?.shortName ?? null,
          performance_1w: calcPerformance(prices1w.start, prices1w.end),
          performance_1m: calcPerformance(prices1m.start, prices1m.end),
          performance_3m: calcPerformance(prices3m.start, prices3m.end),
          current_price: quoteData?.regularMarketPrice ?? null,
          target_price: null,
          status: "watching" as const,
          notes: null,
          price_gap_percent: null,
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
          target_price: null,
          status: "watching" as const,
          notes: null,
          price_gap_percent: null,
        };
      }
    })
  );
}

// Calculate theme basket performance (equal-weighted average)
function calcBasketPerformance(
  stockPerfs: ThemePerformance[],
  period: "performance_1w" | "performance_1m" | "performance_3m"
): number | null {
  const validPerfs = stockPerfs
    .map((s) => s[period])
    .filter((p): p is number => p !== null);
  
  if (validPerfs.length === 0) return null;
  return validPerfs.reduce((sum, p) => sum + p, 0) / validPerfs.length;
}

// Find the best performing stock for a given period
function findLeader(stockPerfs: ThemePerformance[], field: "performance_1w" | "performance_1m" | "performance_3m"): { ticker: string; value: number } | null {
  const sorted = stockPerfs
    .filter((s) => s[field] !== null)
    .sort((a, b) => (b[field] ?? 0) - (a[field] ?? 0));

  if (sorted.length === 0) return null;
  return {
    ticker: sorted[0].ticker,
    value: sorted[0][field]!,
  };
}

// GET /api/themes - List all themes with performance
export async function GET(request: NextRequest) {
  try {
    // Get all themes
    const allThemes = await db.select().from(themes).orderBy(themes.name);

    // Get all theme stocks
    const allStocks = await db.select().from(themeStocks);

    // Get all theme→tag links once and group by theme.
    const tagLinks = await db
      .select({ themeId: themeTags.themeId, name: tagsTable.name })
      .from(themeTags)
      .innerJoin(tagsTable, eq(tagsTable.id, themeTags.tagId));
    const tagsByTheme = new Map<number, string[]>();
    for (const link of tagLinks) {
      const arr = tagsByTheme.get(link.themeId) || [];
      arr.push(link.name);
      tagsByTheme.set(link.themeId, arr);
    }

    // Group stocks by theme
    const stocksByTheme = new Map<number, string[]>();
    for (const stock of allStocks) {
      const existing = stocksByTheme.get(stock.themeId) || [];
      existing.push(stock.ticker);
      stocksByTheme.set(stock.themeId, existing);
    }

    // Get unique tickers across all themes
    const allTickers = Array.from(new Set(allStocks.map((s) => s.ticker)));

    // Fetch crowding scores for all tickers
    const crowdingMap = await getCrowdingScores(allTickers);

    // Fetch performances for all tickers at once (with crowding)
    const allPerformances = await getStockPerformances(allTickers, crowdingMap);
    const perfMap = new Map(allPerformances.map((p) => [p.ticker, p]));

    // Build themed response
    const themesWithPerformance: ThemeWithPerformance[] = allThemes.map((theme) => {
      const tickers = stocksByTheme.get(theme.id) || [];
      const stockPerfs = tickers
        .map((t) => perfMap.get(t))
        .filter((p): p is ThemePerformance => p !== undefined);

      // Aggregate crowding for theme
      const themeCrowdingScores = tickers
        .map((t) => crowdingMap.get(t))
        .filter((s): s is CrowdingScore => s !== undefined);
      const themeCrowding = aggregateCrowdingScores(themeCrowdingScores);

      return {
        id: theme.id,
        name: theme.name,
        description: theme.description || "",
        tags: tagsByTheme.get(theme.id) || [],
        created_at: theme.createdAt || "",
        stocks: tickers,
        performance_1w: calcBasketPerformance(stockPerfs, "performance_1w"),
        performance_1m: calcBasketPerformance(stockPerfs, "performance_1m"),
        performance_3m: calcBasketPerformance(stockPerfs, "performance_3m"),
        leaders: {
          "1w": findLeader(stockPerfs, "performance_1w"),
          "1m": findLeader(stockPerfs, "performance_1m"),
          "3m": findLeader(stockPerfs, "performance_3m"),
        },
        crowdingScore: themeCrowding.score,
        crowdingLevel: themeCrowding.level,
      };
    });

    // Sort by 1M performance (descending)
    themesWithPerformance.sort((a, b) => (b.performance_1m ?? -999) - (a.performance_1m ?? -999));

    return NextResponse.json(
      { themes: themesWithPerformance },
      {
        headers: {
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
        },
      }
    );
  } catch (e) {
    logger.error("api/themes", "Failed to get themes", { error: e });
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// POST /api/themes - Create a new theme
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, description, tags } = body;

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    const parsedTags = Array.isArray(tags) ? tags.map((t: string) => String(t).trim().toLowerCase()).filter(Boolean) : [];

    const [newTheme] = await db
      .insert(themes)
      .values({
        name: name.trim(),
        description: description?.trim() || "",
      })
      .returning();

    if (newTheme && parsedTags.length > 0) {
      await setThemeTags(newTheme.id, parsedTags);
    }

    // Invalidate theme list pages
    revalidatePath("/markets/themes");
    revalidateTag("themes");
    logger.info("api/themes", "Revalidated /markets/themes after theme creation");

    return NextResponse.json(
      { theme: { ...newTheme, tags: parsedTags } },
      { status: 201 },
    );
  } catch (e) {
    const error = String(e);
    if (error.includes("UNIQUE constraint")) {
      return NextResponse.json({ error: "Theme with this name already exists" }, { status: 409 });
    }
    logger.error("api/themes", "Failed to create theme", { error: e });
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
