import { NextRequest, NextResponse } from "next/server";
import { db, stockTags } from "@/db";
import YahooFinance from "yahoo-finance2";

const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

// Revalidate every 30 minutes
export const revalidate = 1800;

interface HistoricalRow {
  date: Date;
  close: number;
}

async function getReturn(ticker: string, days: number): Promise<number | null> {
  try {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const chartResult = await yahooFinance.chart(ticker, {
      period1: startDate,
      period2: endDate,
      interval: "1d",
    }) as any;
    const quotes = (chartResult.quotes || []) as HistoricalRow[];
    if (!quotes || quotes.length < 2) return null;

    const start = quotes[0].close;
    const end = quotes[quotes.length - 1].close;
    if (!start || start === 0 || !end) return null;

    return ((end - start) / start) * 100;
  } catch {
    return null;
  }
}

// GET /api/tags/stocks?tag=uranium — Get stocks for a tag with their returns
export async function GET(request: NextRequest) {
  const tag = request.nextUrl.searchParams.get("tag");
  if (!tag) {
    return NextResponse.json({ error: "tag parameter required" }, { status: 400 });
  }

  try {
    // Find all tickers with this tag
    const rows = await db.select().from(stockTags);
    const tickers: string[] = [];

    for (const row of rows) {
      try {
        const tags: string[] = JSON.parse(row.tags);
        if (tags.includes(tag)) {
          tickers.push(row.ticker);
        }
      } catch {
        // skip
      }
    }

    if (tickers.length === 0) {
      return NextResponse.json({ stocks: [] });
    }

    // Fetch returns (max 10 concurrent to avoid rate limits)
    const batchSize = 10;
    const stocks = [];

    for (let i = 0; i < tickers.length; i += batchSize) {
      const batch = tickers.slice(i, i + batchSize);
      const results = await Promise.all(
        batch.map(async (ticker) => {
          const [r1w, r1m, r3m] = await Promise.all([
            getReturn(ticker, 7),
            getReturn(ticker, 30),
            getReturn(ticker, 90),
          ]);
          return { ticker, return_1w: r1w, return_1m: r1m, return_3m: r3m };
        })
      );
      stocks.push(...results);

      if (i + batchSize < tickers.length) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    // Sort by 1M return desc
    stocks.sort((a, b) => (b.return_1m ?? -999) - (a.return_1m ?? -999));

    return NextResponse.json({ stocks });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
