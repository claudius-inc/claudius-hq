import { NextRequest, NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { db, themes, themeStocks, stockTags } from "@/db";
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

interface QuoteResult {
  symbol?: string;
  regularMarketPrice?: number;
  shortName?: string;
  longName?: string;
}

// Batch fetch quotes for multiple tickers
async function fetchBatchQuotes(tickers: string[]): Promise<Map<string, QuoteResult>> {
  const result = new Map<string, QuoteResult>();
  if (tickers.length === 0) return result;

  const CHUNK = 20;
  const chunks: string[][] = [];
  for (let i = 0; i < tickers.length; i += CHUNK) {
    chunks.push(tickers.slice(i, i + CHUNK));
  }

  await Promise.all(
    chunks.map(async (chunk) => {
      try {
        const quotes = (await yahooFinance.quote(chunk)) as QuoteResult | QuoteResult[];
        const arr = Array.isArray(quotes) ? quotes : [quotes];

        // Build a lookup map for this chunk
        const tickerMap = new Map<string, string>();
        for (const t of chunk) {
          tickerMap.set(t.toUpperCase(), t);
        }

        for (const q of arr) {
          if (q?.symbol) {
            const symbolUpper = q.symbol.toUpperCase();
            let originalTicker = tickerMap.get(symbolUpper);

            // Store under original ticker if found
            if (originalTicker) {
              result.set(originalTicker, q);
            }
            // Also store under returned symbol as fallback
            result.set(q.symbol, q);
          }
        }
      } catch (e) {
        logger.warn("api/themes/[id]", "Batch quote failed, falling back per-ticker", {
          error: e,
          chunkSize: chunk.length,
        });
        await Promise.all(
          chunk.map(async (t) => {
            try {
              const q = (await yahooFinance.quote(t)) as QuoteResult;
              if (q) result.set(t, q);
            } catch {
              /* skip */
            }
          }),
        );
      }
    }),
  );

  return result;
}

// Fetch 90 days of historical data (enough for all periods)
async function fetchHistorical(ticker: string): Promise<HistoricalRow[]> {
  try {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 95); // 95 days for 3m + buffer

    const chartResult = await yahooFinance.chart(ticker, {
      period1: startDate,
      period2: endDate,
      interval: "1d",
    });
    const result = chartResult.quotes as HistoricalRow[];

    if (!result || result.length === 0) return [];
    return result.filter((r) => r.close != null && r.close > 0);
  } catch {
    return [];
  }
}

// Calculate performance from historical data
function calcPerformance(rows: HistoricalRow[], daysAgo: number): number | null {
  if (rows.length < 2) return null;

  const targetDate = new Date(Date.now() - daysAgo * 86400000);
  const targetDateStr = targetDate.toISOString().split("T")[0];

  // Find the row at or before target date
  let startIdx = -1;
  for (let i = 0; i < rows.length; i++) {
    const rowDateStr = rows[i].date.toISOString().split("T")[0];
    if (rowDateStr <= targetDateStr) {
      startIdx = i;
    } else {
      break;
    }
  }

  if (startIdx === -1) startIdx = 0;

  const start = rows[startIdx]?.close;
  const end = rows[rows.length - 1]?.close;

  if (start == null || end == null || start === 0) return null;
  return ((end - start) / start) * 100;
}

// Get all stock performances for a theme with watchlist data
async function getStockPerformances(
  stockRows: StockDbRow[],
  quoteMap: Map<string, QuoteResult>,
): Promise<ThemePerformance[]> {
  // Fetch historical data in parallel with concurrency limit
  const CONCURRENCY = 8;
  let cursor = 0;
  const results: Map<string, ThemePerformance> = new Map();

  const worker = async () => {
    while (cursor < stockRows.length) {
      const idx = cursor++;
      const row = stockRows[idx];
      const { ticker, targetPrice, status, notes } = row;

      try {
        const quote = quoteMap.get(ticker);
        const historical = await fetchHistorical(ticker);

        const currentPrice = quote?.regularMarketPrice ?? null;
        const companyName = quote?.shortName || quote?.longName || null;

        // Calculate price gap to target
        let priceGapPercent: number | null = null;
        if (currentPrice !== null && targetPrice !== null && targetPrice > 0) {
          priceGapPercent = ((currentPrice - targetPrice) / targetPrice) * 100;
        }

        results.set(ticker, {
          ticker,
          name: companyName,
          performance_1w: calcPerformance(historical, 7),
          performance_1m: calcPerformance(historical, 30),
          performance_3m: calcPerformance(historical, 90),
          current_price: currentPrice,
          target_price: targetPrice,
          status: ((status as ThemeStockStatus) || "watching") as ThemeStockStatus,
          notes,
          price_gap_percent: priceGapPercent,
        });
      } catch {
        results.set(ticker, {
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
        });
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, stockRows.length) }, worker));

  return stockRows.map((row) => results.get(row.ticker)!);
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

    // Fetch tags for all stocks in this theme
    const stockTagMap: Record<string, string[]> = {};
    if (tickers.length > 0) {
      const tagRows = await db
        .select({ ticker: stockTags.ticker, tags: stockTags.tags })
        .from(stockTags);
      for (const row of tagRows) {
        if (tickers.includes(row.ticker)) {
          try {
            stockTagMap[row.ticker] = JSON.parse(row.tags);
          } catch {
            stockTagMap[row.ticker] = [];
          }
        }
      }
    }

    // Batch fetch all quotes first
    const quoteMap = await fetchBatchQuotes(tickers);

    // Get stock performances with watchlist data
    const stockPerfs = await getStockPerformances(stocks, quoteMap);

    // Sort by 1M performance
    stockPerfs.sort((a, b) => (b.performance_1m ?? -999) - (a.performance_1m ?? -999));

    const themeWithPerformance: ThemeWithPerformance = {
      id: theme.id,
      name: theme.name,
      description: theme.description || "",
      tags: (theme.tags as string[]) || [],
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
      stock_tags: stockTagMap,
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
    const { name, description, tags } = body;

    const updateData: Record<string, string | null | string[]> = {};
    if (name !== undefined && typeof name === "string" && name.trim()) {
      updateData.name = name.trim();
    }
    if (description !== undefined) {
      updateData.description = typeof description === "string" ? description : null;
    }
    if (tags !== undefined) {
      const parsed = Array.isArray(tags) ? tags.map((t: string) => String(t).trim().toLowerCase()).filter(Boolean) : [];
      updateData.tags = parsed;
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
