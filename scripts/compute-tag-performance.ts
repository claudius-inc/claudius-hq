import { createClient } from "@libsql/client";
import YahooFinance from "yahoo-finance2";

const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

const db = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

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

async function main() {
  console.log("Fetching all stock tags...");
  const tagRows = await db.execute("SELECT ticker, tags FROM stock_tags");

  // Build ticker -> tags mapping
  const tickerTags: Record<string, string[]> = {};
  for (const row of tagRows.rows) {
    tickerTags[row.ticker as string] = JSON.parse(row.tags as string);
  }

  // Build tag -> tickers mapping
  const tagTickers: Record<string, string[]> = {};
  for (const [ticker, tags] of Object.entries(tickerTags)) {
    for (const tag of tags) {
      if (!tagTickers[tag]) tagTickers[tag] = [];
      tagTickers[tag].push(ticker);
    }
  }

  // Get all unique tickers
  const allTickers = Array.from(new Set(Object.keys(tickerTags)));
  console.log(`Found ${allTickers.length} unique tickers across ${Object.keys(tagTickers).length} tags`);

  // Fetch returns for all tickers (batched, 20 concurrent)
  const returns: Record<string, { "1W": number | null; "1M": number | null; "3M": number | null }> = {};

  const batchSize = 15;
  for (let i = 0; i < allTickers.length; i += batchSize) {
    const batch = allTickers.slice(i, i + batchSize);
    console.log(`Fetching prices ${i + 1}-${Math.min(i + batchSize, allTickers.length)} / ${allTickers.length}`);

    const results = await Promise.all(
      batch.map(async (ticker) => {
        const [r1w, r1m, r3m] = await Promise.all([
          getReturn(ticker, 7),
          getReturn(ticker, 30),
          getReturn(ticker, 90),
        ]);
        return { ticker, "1W": r1w, "1M": r1m, "3M": r3m };
      })
    );

    for (const r of results) {
      returns[r.ticker] = { "1W": r["1W"], "1M": r["1M"], "3M": r["3M"] };
    }

    // Rate limit pause between batches
    if (i + batchSize < allTickers.length) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  // Compute tag performance
  const periods = ["1W", "1M", "3M"] as const;
  let upsertCount = 0;

  for (const [tag, tickers] of Object.entries(tagTickers)) {
    for (const period of periods) {
      const values = tickers
        .map((t) => returns[t]?.[period])
        .filter((v): v is number => v !== null && v !== undefined);

      if (values.length === 0) continue;

      const sorted = [...values].sort((a, b) => a - b);
      const avg = values.reduce((s, v) => s + v, 0) / values.length;
      const median = sorted.length % 2 === 0
        ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
        : sorted[Math.floor(sorted.length / 2)];

      // Find top stock for this tag+period
      let topStock: string | null = null;
      let topReturn: number | null = null;
      for (const t of tickers) {
        const r = returns[t]?.[period];
        if (r !== null && r !== undefined && (topReturn === null || r > topReturn)) {
          topStock = t;
          topReturn = r;
        }
      }

      await db.execute({
        sql: `INSERT OR REPLACE INTO tag_performance (tag, period, avg_return, median_return, stock_count, top_stock, top_stock_return, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
        args: [tag, period, avg, median, values.length, topStock, topReturn],
      });
      upsertCount++;
    }
  }

  console.log(`Done! Upserted ${upsertCount} tag-period combinations`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
