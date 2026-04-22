import { NextResponse } from "next/server";
import { rawClient } from "@/db";

// Revalidate every 30 minutes
export const revalidate = 1800;

// GET /api/tags/performance - Get pre-computed tag performance data
export async function GET() {
  try {
    const result = await rawClient.execute(
      `SELECT tag, period, avg_return, median_return, stock_count, top_stock, top_stock_return, updated_at
       FROM tag_performance
       ORDER BY period, avg_return DESC`
    );

    // Group by period
    const periods: Record<string, typeof result.rows> = {
      "1W": [],
      "1M": [],
      "3M": [],
    };

    let lastUpdated = "";

    for (const row of result.rows) {
      const period = row.period as string;
      if (periods[period]) {
        periods[period].push(row);
      }
      if ((row.updated_at as string) > lastUpdated) {
        lastUpdated = row.updated_at as string;
      }
    }

    return NextResponse.json({
      periods,
      last_updated: lastUpdated || null,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
