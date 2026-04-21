import { NextRequest, NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { db, themes, themeStocks } from "@/db";
import { eq } from "drizzle-orm";
import YahooFinance from "yahoo-finance2";
import { ThemeWithPerformance, ThemePerformance, ThemeStockStatus } from "@/lib/types";
import { logger } from "@/lib/logger";

// Instantiate Yahoo Finance client
const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

// Revalidate every hour
export const revalidate = 3600;

interface HistoricalRow {
  date: Date;
  close: number;
}

interface StockDbRow {
  ticker: string;
  targetPrice: number | null;
  status: string | null;
  notes: string | null;
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

// Quote result type
interface QuoteResult {
  regularMarketPrice?: number;
  shortName?: string;
  longName?: string;
}

// Get all stock performances for a theme with watchlist data
async function getStockPerformances(stockRows: StockDbRow[]): Promise<ThemePerformance[]> {
  return Promise.all(
    stockRows.map(async (row) => {
      const { ticker, targetPrice, status, notes } = row;
      try {
        const [prices1w, prices1m, prices3m, quote] = await Promise.all([
          getHistoricalPrices(ticker, "1w"),
          getHistoricalPrices(ticker, "1m"),
          getHistoricalPrices(ticker, "3m"),
          (yahooFinance.quote(ticker) as Promise<QuoteResult>).catch(() => null),
        ]);

        const quoteData = quote as QuoteResult | null;
        const currentPrice = quoteData?.regularMarketPrice ?? null;
        const companyName = quoteData?.shortName || quoteData?.longName || null;

        // Calculate price gap to target
        let priceGapPercent: number | null = null;
        if (currentPrice !== null && targetPrice !== null && targetPrice > 0) {
          priceGapPercent = ((currentPrice - targetPrice) / targetPrice) * 100;
        }

        return {
          ticker,
          name: companyName,
          performance_1w: calcPerformance(prices1w.start, prices1w.end),
          performance_1m: calcPerformance(prices1m.start, prices1m.end),
          performance_3m: calcPerformance(prices3m.start, prices3m.end),
          current_price: currentPrice,
          target_price: targetPrice,
          status: ((status as ThemeStockStatus) || "watching") as ThemeStockStatus,
          notes,
          price_gap_percent: priceGapPercent,
        };
      } catch {
        return {
          ticker,
          name: null,
          performance_1w: null,
          performance_1m: null,
          performance_3m: null,
          current_price: null,
          target_price: targetPrice,
          status: ((status as ThemeStockStatus) || "watching") as ThemeStockStatus,
          notes,
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

// GET /api/themes/[id] - Get theme details with all stocks
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const numericId = parseInt(id, 10);

    if (isNaN(numericId)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    // Get theme
    const [theme] = await db.select().from(themes).where(eq(themes.id, numericId));

    if (!theme) {
      return NextResponse.json({ error: "Theme not found" }, { status: 404 });
    }

    // Get theme stocks with watchlist data
    const stocks = await db
      .select({
        ticker: themeStocks.ticker,
        targetPrice: themeStocks.targetPrice,
        status: themeStocks.status,
        notes: themeStocks.notes,
      })
      .from(themeStocks)
      .where(eq(themeStocks.themeId, numericId))
      .orderBy(themeStocks.ticker);

    const tickers = stocks.map((r) => r.ticker);

    // Get stock performances with watchlist data
    const stockPerfs = await getStockPerformances(stocks);

    // Sort by 1M performance
    stockPerfs.sort((a, b) => (b.performance_1m ?? -999) - (a.performance_1m ?? -999));

    const themeWithPerformance: ThemeWithPerformance = {
      id: theme.id,
      name: theme.name,
      description: theme.description || "",
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
      stock_performances: stockPerfs,
    };

    return NextResponse.json({ theme: themeWithPerformance });
  } catch (e) {
    logger.error("api/themes/[id]", "Failed to get theme", { error: e });
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// PATCH /api/themes/[id] - Update theme name/description
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const numericId = parseInt(id, 10);

    if (isNaN(numericId)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    const body = await request.json();
    const { name, description } = body;

    const updateData: Record<string, string | null> = {};
    if (name !== undefined && typeof name === "string" && name.trim()) {
      updateData.name = name.trim();
    }
    if (description !== undefined) {
      updateData.description = typeof description === "string" ? description : null;
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    const [existing] = await db.select().from(themes).where(eq(themes.id, numericId));
    if (!existing) {
      return NextResponse.json({ error: "Theme not found" }, { status: 404 });
    }

    await db.update(themes).set(updateData).where(eq(themes.id, numericId));

    revalidatePath("/markets/themes");
    revalidateTag("themes");
    logger.info("api/themes/[id]", `Updated theme ${numericId}`);

    return NextResponse.json({ success: true });
  } catch (e) {
    logger.error("api/themes/[id]", "Failed to update theme", { error: e });
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// DELETE /api/themes/[id] - Delete a theme
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const numericId = parseInt(id, 10);

    if (isNaN(numericId)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    // Check if theme exists
    const [existing] = await db.select({ id: themes.id }).from(themes).where(eq(themes.id, numericId));

    if (!existing) {
      return NextResponse.json({ error: "Theme not found" }, { status: 404 });
    }

    // Delete theme (cascade will delete theme_stocks due to FK constraint)
    await db.delete(themes).where(eq(themes.id, numericId));

    // Invalidate theme pages
    revalidatePath("/markets/themes");
    revalidateTag("themes");
    revalidatePath(`/markets/themes/${numericId}`);
    logger.info("api/themes/[id]", `Revalidated /markets/themes and /markets/themes/${numericId} after theme deletion`);

    return NextResponse.json({ success: true });
  } catch (e) {
    logger.error("api/themes/[id]", "Failed to delete theme", { error: e });
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
