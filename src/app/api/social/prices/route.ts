import { NextRequest, NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";
import { logger } from "@/lib/logger";

const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

export const dynamic = "force-dynamic";

interface HistoricalRow {
  date: Date;
  close: number;
}

async function getPrices(ticker: string) {
  try {
    const now = new Date();
    const periods: Array<{ start: Date; key: "1w" | "1m" | "3m" }> = [
      { start: new Date(now.getTime() - 7 * 86400000), key: "1w" },
      { start: new Date(now.getTime() - 30 * 86400000), key: "1m" },
      { start: new Date(now.getTime() - 90 * 86400000), key: "3m" },
    ];

    const [quotes, ...histResults] = await Promise.all([
      yahooFinance.quote(ticker).catch(() => null),
      ...periods.map(async (p) => {
        const chart = await yahooFinance.chart(ticker, {
          period1: p.start,
          period2: now,
          interval: "1d",
        });
        const rows = (chart.quotes || []) as HistoricalRow[];
        return { key: p.key, rows };
      }),
    ]);

    const priceData: Record<string, number | null> = { "1w": null, "1m": null, "3m": null };
    for (const h of histResults) {
      if (h.rows.length >= 2) {
        const first = h.rows[0]?.close;
        const last = h.rows[h.rows.length - 1]?.close;
        if (first && last && first > 0) {
          priceData[h.key] = ((last - first) / first) * 100;
        }
      }
    }

    const quoteData = quotes as { regularMarketPrice?: number; shortName?: string; longName?: string } | null;

    return {
      ticker,
      name: quoteData?.shortName || quoteData?.longName || null,
      current_price: quoteData?.regularMarketPrice ?? null,
      performance_1w: priceData["1w"],
      performance_1m: priceData["1m"],
      performance_3m: priceData["3m"],
    };
  } catch {
    return { ticker, name: null, current_price: null, performance_1w: null, performance_1m: null, performance_3m: null };
  }
}

// GET /api/social/prices?tickers=AAPL,MRVL
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const tickersParam = searchParams.get("tickers");
    if (!tickersParam) {
      return NextResponse.json({ prices: {} });
    }

    const tickers = tickersParam
      .split(",")
      .map((t) => t.trim().toUpperCase())
      .filter(Boolean);

    // Batch fetch (max 20 at a time to avoid rate limits)
    const results = await Promise.all(
      tickers.slice(0, 20).map((t) => getPrices(t))
    );

    const prices: Record<string, (typeof results)[0]> = {};
    for (const r of results) {
      prices[r.ticker] = r;
    }

    return NextResponse.json({ prices });
  } catch (e) {
    logger.error("api/social/prices", "Failed to get prices", { error: e });
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
