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

// Get all stock performances for a theme
async function getStockPerformances(tickers: string[]): Promise<ThemePerformance[]> {
  const performances: ThemePerformance[] = [];

  for (const ticker of tickers) {
    try {
      const [prices1w, prices1m, prices3m, quote] = await Promise.all([
        getHistoricalPrices(ticker, "1w"),
        getHistoricalPrices(ticker, "1m"),
        getHistoricalPrices(ticker, "3m"),
        (yahooFinance.quote(ticker) as Promise<{ regularMarketPrice?: number }>).catch(() => null),
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

// GET /api/themes - List all themes with performance
export async function GET() {
  try {
    await ensureDB();

    // Get all themes
    const themesResult = await db.execute("SELECT * FROM themes ORDER BY name");
    const themes = themesResult.rows as unknown as Theme[];

    // Get all theme stocks
    const stocksResult = await db.execute("SELECT * FROM theme_stocks");
    const allStocks = stocksResult.rows as unknown as { theme_id: number; ticker: string }[];

    // Group stocks by theme
    const stocksByTheme = new Map<number, string[]>();
    for (const stock of allStocks) {
      const existing = stocksByTheme.get(stock.theme_id) || [];
      existing.push(stock.ticker);
      stocksByTheme.set(stock.theme_id, existing);
    }

    // Get unique tickers across all themes
    const allTickers = Array.from(new Set(allStocks.map((s) => s.ticker)));

    // Fetch performances for all tickers at once
    const allPerformances = await getStockPerformances(allTickers);
    const perfMap = new Map(allPerformances.map((p) => [p.ticker, p]));

    // Build themed response
    const themesWithPerformance: ThemeWithPerformance[] = themes.map((theme) => {
      const tickers = stocksByTheme.get(theme.id) || [];
      const stockPerfs = tickers
        .map((t) => perfMap.get(t))
        .filter((p): p is ThemePerformance => p !== undefined);

      return {
        ...theme,
        stocks: tickers,
        performance_1w: calcBasketPerformance(stockPerfs, "performance_1w"),
        performance_1m: calcBasketPerformance(stockPerfs, "performance_1m"),
        performance_3m: calcBasketPerformance(stockPerfs, "performance_3m"),
        leader: findLeader(stockPerfs),
      };
    });

    // Sort by 1M performance (descending)
    themesWithPerformance.sort((a, b) => (b.performance_1m ?? -999) - (a.performance_1m ?? -999));

    return NextResponse.json({ themes: themesWithPerformance });
  } catch (e) {
    console.error("Failed to get themes:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// POST /api/themes - Create a new theme
export async function POST(request: NextRequest) {
  try {
    await ensureDB();

    const body = await request.json();
    const { name, description } = body;

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    const result = await db.execute({
      sql: "INSERT INTO themes (name, description) VALUES (?, ?)",
      args: [name.trim(), description?.trim() || ""],
    });

    const theme = {
      id: Number(result.lastInsertRowid),
      name: name.trim(),
      description: description?.trim() || "",
      created_at: new Date().toISOString(),
    };

    return NextResponse.json({ theme }, { status: 201 });
  } catch (e) {
    const error = String(e);
    if (error.includes("UNIQUE constraint")) {
      return NextResponse.json({ error: "Theme with this name already exists" }, { status: 409 });
    }
    console.error("Failed to create theme:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
