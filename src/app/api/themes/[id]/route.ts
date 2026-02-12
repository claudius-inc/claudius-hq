import { NextRequest, NextResponse } from "next/server";
import db, { ensureDB } from "@/lib/db";
import YahooFinance from "yahoo-finance2";
import { Theme, ThemeWithPerformance, ThemePerformance, ThemeStockStatus } from "@/lib/types";

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
  target_price: number | null;
  status: ThemeStockStatus | null;
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

    const result = await yahooFinance.historical(ticker, {
      period1: startDate,
      period2: endDate,
      interval: "1d",
    }) as HistoricalRow[];

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
  const performances: ThemePerformance[] = [];

  for (const row of stockRows) {
    const { ticker, target_price, status, notes } = row;
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
      if (currentPrice !== null && target_price !== null && target_price > 0) {
        priceGapPercent = ((currentPrice - target_price) / target_price) * 100;
      }

      performances.push({
        ticker,
        name: companyName,
        performance_1w: calcPerformance(prices1w.start, prices1w.end),
        performance_1m: calcPerformance(prices1m.start, prices1m.end),
        performance_3m: calcPerformance(prices3m.start, prices3m.end),
        current_price: currentPrice,
        target_price,
        status: status || "watching",
        notes,
        price_gap_percent: priceGapPercent,
      });
    } catch {
      performances.push({
        ticker,
        name: null,
        performance_1w: null,
        performance_1m: null,
        performance_3m: null,
        current_price: null,
        target_price,
        status: status || "watching",
        notes,
        price_gap_percent: null,
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

    // Get theme stocks with watchlist data
    const stocksResult = await db.execute({
      sql: "SELECT ticker, target_price, status, notes FROM theme_stocks WHERE theme_id = ? ORDER BY ticker",
      args: [id],
    });

    const stockRows = stocksResult.rows.map((r) => r as unknown as StockDbRow);
    const tickers = stockRows.map((r) => r.ticker);

    // Get stock performances with watchlist data
    const stockPerfs = await getStockPerformances(stockRows);

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
