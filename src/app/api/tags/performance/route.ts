import { NextResponse } from "next/server";
import { db, stockTags, tagPerformance } from "@/db";
import { sql } from "drizzle-orm";

// Revalidate every 30 minutes
export const revalidate = 1800;

// GET /api/tags/performance - Get pre-computed tag performance data
export async function GET() {
  try {
    const rows = await db
      .select()
      .from(tagPerformance)
      .orderBy(tagPerformance.period, sql`${tagPerformance.avgReturn} desc`);

    // Group by period
    const periods: Record<string, typeof rows> = {
      "1W": [],
      "1M": [],
      "3M": [],
    };

    let lastUpdated = "";

    for (const row of rows) {
      const period = row.period as string;
      if (periods[period]) {
        periods[period].push(row);
      }
      if (row.updatedAt > lastUpdated) {
        lastUpdated = row.updatedAt;
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
