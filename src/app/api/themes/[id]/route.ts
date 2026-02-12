import { NextRequest, NextResponse } from "next/server";
import db, { ensureDB } from "@/lib/db";
import yahooFinance from "yahoo-finance2";
import { Theme, ThemeWithPerformance, ThemePerformance } from "@/lib/types";

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

    const result = await yahooFinance.historical(ticker, {
      period1: startDate,
      period2: endDate,
      interval: "1d",
    });

    if (!result || result.length === 0) {
      return { start: null, end: null };
    }

    const rows = result as HistoricalRow[];
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

// Get all stock performances for a theme
async function getStockPerformances(tickers: string[]): Promise<ThemePerformance[]> {
  const performances: ThemePerformance[] = [];

  for (const ticker of tickers) {
    try {
      const [prices1w, prices1m, prices3m, quote] = await Promise.all([
        getHistoricalPrices(ticker, "1w"),
        getHistoricalPrices(ticker, "1m"),
        getHistoricalPrices(ticker, "3m"),
        yahooFinance.quote(ticker).catch(() => null),
      ]);

      performances.push({
        ticker,
        performance_1w: calcPerformance(prices1w.start, prices1w.end),
        performance_1m: calcPerformance(prices1m.start, prices1m.end),
        performance_3m: calcPerformance(prices3m.start, prices3m.end),
        current_price: (quote as { regularMarketPrice?: number })?.regularMarketPrice ?? null,
      });
    } catch {
      performances.push({
        ticker,
        performance_1w: null,
        performance_1m: null,
        performance_3m: null,
        current_price: null,
      });
    }
  }

  return performances;
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

// Find the best performing stock (leader) by 1M performance
function findLeader(stockPerfs: ThemePerformance[]): { ticker: string; performance_1m: number | null } | null {
  const sorted = stockPerfs
    .filter((s) => s.performance_1m !== null)
    .sort((a, b) => (b.performance_1m ?? 0) - (a.performance_1m ?? 0));
  
  if (sorted.length === 0) return null;
  return {
    ticker: sorted[0].ticker,
    performance_1m: sorted[0].performance_1m,
  };
}

// GET /api/themes/[id] - Get theme details with all stocks
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await ensureDB();
    const { id } = await params;

    // Get theme
    const themeResult = await db.execute({
      sql: "SELECT * FROM themes WHERE id = ?",
      args: [id],
    });

    if (themeResult.rows.length === 0) {
      return NextResponse.json({ error: "Theme not found" }, { status: 404 });
    }

    const theme = themeResult.rows[0] as unknown as Theme;

    // Get theme stocks
    const stocksResult = await db.execute({
      sql: "SELECT ticker FROM theme_stocks WHERE theme_id = ? ORDER BY ticker",
      args: [id],
    });

    const tickers = stocksResult.rows.map((r) => (r as { ticker: string }).ticker);

    // Get stock performances
    const stockPerfs = await getStockPerformances(tickers);

    // Sort by 1M performance
    stockPerfs.sort((a, b) => (b.performance_1m ?? -999) - (a.performance_1m ?? -999));

    const themeWithPerformance: ThemeWithPerformance = {
      ...theme,
      stocks: tickers,
      performance_1w: calcBasketPerformance(stockPerfs, "performance_1w"),
      performance_1m: calcBasketPerformance(stockPerfs, "performance_1m"),
      performance_3m: calcBasketPerformance(stockPerfs, "performance_3m"),
      leader: findLeader(stockPerfs),
      stock_performances: stockPerfs,
    };

    return NextResponse.json({ theme: themeWithPerformance });
  } catch (e) {
    console.error("Failed to get theme:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// DELETE /api/themes/[id] - Delete a theme
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await ensureDB();
    const { id } = await params;

    // Delete theme (cascade will delete theme_stocks)
    const result = await db.execute({
      sql: "DELETE FROM themes WHERE id = ?",
      args: [id],
    });

    if (result.rowsAffected === 0) {
      return NextResponse.json({ error: "Theme not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("Failed to delete theme:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
