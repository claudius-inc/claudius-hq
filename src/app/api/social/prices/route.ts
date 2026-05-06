import { NextRequest, NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";
import { logger } from "@/lib/logger";
import { normalizeTickerForYahoo } from "@/lib/markets/yahoo-utils";

const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

export const dynamic = "force-dynamic";

interface HistoricalRow {
  date: Date;
  close: number;
}

interface QuoteResult {
  symbol?: string;
  regularMarketPrice?: number;
  regularMarketChangePercent?: number;
  shortName?: string;
  longName?: string;
  previousClose?: number;
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
        const quotes = (await yahooFinance.quote(chunk.map(normalizeTickerForYahoo))) as
          | QuoteResult
          | QuoteResult[];
        const arr = Array.isArray(quotes) ? quotes : [quotes];

        // Build a lookup map for this chunk
        const tickerMap = new Map<string, string>();
        for (const t of chunk) {
          const normalized = normalizeTickerForYahoo(t);
          tickerMap.set(normalized.toUpperCase(), t);
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
        logger.warn("api/social/prices", "Batch quote failed, falling back per-ticker", {
          error: e,
          chunkSize: chunk.length,
        });
        await Promise.all(
          chunk.map(async (t) => {
            try {
              const q = (await yahooFinance.quote(normalizeTickerForYahoo(t))) as QuoteResult;
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

// Fetch historical data for a ticker (90 days covers all periods)
async function fetchHistorical(ticker: string): Promise<HistoricalRow[]> {
  try {
    const now = new Date();
    const chart = await yahooFinance.chart(normalizeTickerForYahoo(ticker), {
      period1: new Date(now.getTime() - 95 * 86400000), // 95 days for 3m + buffer
      period2: now,
      interval: "1d",
    });
    const rows = ((chart?.quotes || []) as HistoricalRow[]).filter((r) => r.close != null && r.close > 0);
    return rows;
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

async function getPrices(ticker: string, quoteData: QuoteResult | undefined) {
  try {
    const historical = await fetchHistorical(ticker);

    // Sparkline data: last 30 days
    const sparkline = historical.slice(-30).map((r) => ({
      date: r.date.toISOString().split("T")[0],
      close: r.close,
    }));

    return {
      ticker,
      name: quoteData?.shortName || quoteData?.longName || null,
      current_price: quoteData?.regularMarketPrice ?? null,
      change_1d: quoteData?.regularMarketChangePercent ?? null,
      performance_1w: calcPerformance(historical, 7),
      performance_1m: calcPerformance(historical, 30),
      performance_3m: calcPerformance(historical, 90),
      sparkline,
    };
  } catch {
    return {
      ticker,
      name: quoteData?.shortName || quoteData?.longName || null,
      current_price: quoteData?.regularMarketPrice ?? null,
      change_1d: quoteData?.regularMarketChangePercent ?? null,
      performance_1w: null,
      performance_1m: null,
      performance_3m: null,
      sparkline: [],
    };
  }
}

// GET /api/social/prices?tickers=AAPL,MRVL
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const tickersParam = searchParams.get("tickers");
    if (!tickersParam) {
      const response = NextResponse.json({ prices: {} });
      response.headers.set("Cache-Control", "s-maxage=120, stale-while-revalidate=600");
      return response;
    }

    const tickers = tickersParam
      .split(",")
      .map((t) => t.trim().toUpperCase())
      .filter(Boolean)
      .slice(0, 50);

    // Step 1: Batch fetch all quotes
    const quoteMap = await fetchBatchQuotes(tickers);

    // Step 2: Fetch historical data in parallel (concurrency limited to avoid rate limits)
    const CONCURRENCY = 8;
    const results: Array<Awaited<ReturnType<typeof getPrices>>> = [];
    let cursor = 0;

    const worker = async () => {
      while (cursor < tickers.length) {
        const idx = cursor++;
        const ticker = tickers[idx];
        const result = await getPrices(ticker, quoteMap.get(ticker));
        results[idx] = result; // Preserve order
      }
    };

    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, tickers.length) }, worker));

    const prices: Record<string, (typeof results)[0]> = {};
    for (const r of results) {
      if (r) prices[r.ticker] = r;
    }

    const response = NextResponse.json({ prices });
    response.headers.set("Cache-Control", "s-maxage=120, stale-while-revalidate=600");
    return response;
  } catch (e) {
    logger.error("api/social/prices", "Failed to get prices", { error: e });
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
