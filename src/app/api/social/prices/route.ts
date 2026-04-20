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

    const [quotes, chart1m] = await Promise.all([
      yahooFinance.quote(ticker).catch(() => null),
      yahooFinance.chart(ticker, {
        period1: new Date(now.getTime() - 30 * 86400000),
        period2: now,
        interval: "1d",
      }).catch(() => null),
    ]);

    const histRows = ((chart1m?.quotes || []) as HistoricalRow[]).filter((r) => r.close > 0);

    // Sparkline data: last 30 days, normalized for SVG
    const sparkline = histRows.map((r) => ({
      date: r.date.toISOString().split("T")[0],
      close: r.close,
    }));

    // Performance calculations
    const priceData: Record<string, number | null> = { "1w": null, "1m": null, "3m": null };
    for (const p of periods) {
      const chart = await yahooFinance.chart(ticker, {
        period1: p.start,
        period2: now,
        interval: "1d",
      }).catch(() => null);
      const rows = ((chart?.quotes || []) as HistoricalRow[]).filter((r) => r.close > 0);
      if (rows.length >= 2) {
        const first = rows[0].close;
        const last = rows[rows.length - 1].close;
        if (first > 0) {
          priceData[p.key] = ((last - first) / first) * 100;
        }
      }
    }

    const quoteData = quotes as { regularMarketPrice?: number; regularMarketChangePercent?: number; shortName?: string; longName?: string; previousClose?: number } | null;

    return {
      ticker,
      name: quoteData?.shortName || quoteData?.longName || null,
      current_price: quoteData?.regularMarketPrice ?? null,
      change_1d: quoteData?.regularMarketChangePercent ?? null,
      performance_1w: priceData["1w"],
      performance_1m: priceData["1m"],
      performance_3m: priceData["3m"],
      sparkline,
    };
  } catch {
    return {
      ticker,
      name: null,
      current_price: null,
      change_1d: null,
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
      return NextResponse.json({ prices: {} });
    }

    const tickers = tickersParam
      .split(",")
      .map((t) => t.trim().toUpperCase())
      .filter(Boolean);

    // Batch fetch (max 10 at a time to avoid rate limits — sparkline data is heavier)
    const results: Array<Awaited<ReturnType<typeof getPrices>>> = [];
    for (let i = 0; i < Math.min(tickers.length, 30); i += 10) {
      const batch = tickers.slice(i, i + 10);
      const batchResults = await Promise.all(batch.map((t) => getPrices(t)));
      results.push(...batchResults);
    }

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
