import { NextRequest, NextResponse } from "next/server";
import { rawClient } from "@/db";
import YahooFinance from "yahoo-finance2";

const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

// Revalidate every 30 minutes
export const revalidate = 1800;

interface HistoricalRow {
  date: Date;
  close: number;
}

interface QuoteResult {
  symbol?: string;
  regularMarketPrice?: number;
  shortName?: string;
  longName?: string;
}

// Batch fetch quotes
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
      } catch {
        // Skip failed chunks
      }
    }),
  );

  return result;
}

// Fetch 90 days of historical data
async function fetchHistorical(ticker: string): Promise<HistoricalRow[]> {
  try {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 95); // 90 days + buffer

    const chartResult = await yahooFinance.chart(ticker, {
      period1: startDate,
      period2: endDate,
      interval: "1d",
    }) as any;
    const quotes = (chartResult.quotes || []) as HistoricalRow[];
    return quotes.filter((q) => q.close != null && q.close > 0);
  } catch {
    return [];
  }
}

// Calculate return from historical data
function calcReturn(rows: HistoricalRow[], daysAgo: number): number | null {
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

  if (!start || !end || start === 0) return null;
  return ((end - start) / start) * 100;
}

// GET /api/tags/stocks?tag=uranium — Get stocks for a tag with their returns
export async function GET(request: NextRequest) {
  const tag = request.nextUrl.searchParams.get("tag");
  if (!tag) {
    return NextResponse.json({ error: "tag parameter required" }, { status: 400 });
  }

  try {
    // Find all tickers with this tag
    const rows = await rawClient.execute("SELECT ticker, tags FROM stock_tags");
    const tickers: string[] = [];

    for (const row of rows.rows) {
      try {
        const tags: string[] = JSON.parse(row.tags as string);
        if (tags.includes(tag)) {
          tickers.push(row.ticker as string);
        }
      } catch {
        // skip
      }
    }

    if (tickers.length === 0) {
      return NextResponse.json({ stocks: [] });
    }

    // Step 1: Batch fetch all quotes
    const quoteMap = await fetchBatchQuotes(tickers);

    // Step 2: Fetch historical data and compute returns with concurrency limit
    const CONCURRENCY = 8;
    let cursor = 0;
    const results: Array<{
      ticker: string;
      name: string | null;
      price: number | null;
      return_1w: number | null;
      return_1m: number | null;
      return_3m: number | null;
    }> = [];

    const worker = async () => {
      while (cursor < tickers.length) {
        const idx = cursor++;
        const ticker = tickers[idx];

        const historical = await fetchHistorical(ticker);
        const quote = quoteMap.get(ticker);

        results[idx] = {
          ticker,
          name: quote?.shortName || quote?.longName || null,
          price: quote?.regularMarketPrice ?? null,
          return_1w: calcReturn(historical, 7),
          return_1m: calcReturn(historical, 30),
          return_3m: calcReturn(historical, 90),
        };
      }
    };

    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, tickers.length) }, worker));

    // Sort by 1M return desc
    results.sort((a, b) => (b.return_1m ?? -999) - (a.return_1m ?? -999));

    return NextResponse.json({ stocks: results });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
