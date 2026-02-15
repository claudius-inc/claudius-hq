import { NextRequest, NextResponse } from "next/server";
import { db, stockReports } from "@/db";
import { desc, sql, inArray } from "drizzle-orm";

// GET /api/stocks/research-status?tickers=BABA,BYD,AAPL
// Returns { [ticker]: { lastResearchDate, reportId } | null }
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const tickersParam = searchParams.get("tickers");

    if (!tickersParam) {
      return NextResponse.json(
        { error: "tickers query param is required" },
        { status: 400 }
      );
    }

    const tickers = tickersParam
      .split(",")
      .map((t) => t.trim().toUpperCase())
      .filter((t) => t.length > 0);

    if (tickers.length === 0) {
      return NextResponse.json({ statuses: {} });
    }

    // Get the most recent report for each ticker using a subquery approach
    // We need to find max(createdAt) for each ticker, then select those rows
    const results = await db
      .select({
        ticker: stockReports.ticker,
        id: stockReports.id,
        createdAt: stockReports.createdAt,
      })
      .from(stockReports)
      .where(inArray(sql`UPPER(${stockReports.ticker})`, tickers))
      .orderBy(desc(stockReports.createdAt));

    // Build a map of ticker -> latest report
    const tickerMap: Record<
      string,
      { lastResearchDate: string; reportId: number }
    > = {};

    for (const row of results) {
      const upperTicker = row.ticker.toUpperCase();
      if (!tickerMap[upperTicker]) {
        tickerMap[upperTicker] = {
          lastResearchDate: row.createdAt || "",
          reportId: row.id,
        };
      }
    }

    // Build response with null for tickers with no research
    const statuses: Record<
      string,
      { lastResearchDate: string; reportId: number } | null
    > = {};
    for (const ticker of tickers) {
      statuses[ticker] = tickerMap[ticker] || null;
    }

    return NextResponse.json({ statuses });
  } catch (e) {
    console.error("Error fetching research status:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
