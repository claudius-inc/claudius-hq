import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { cftcPositions } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

// GET /api/cftc?commodity=gold — latest CFTC positions + last 52 weeks for percentile
export async function GET(request: NextRequest) {
  try {
    const commodity = request.nextUrl.searchParams.get("commodity");

    if (commodity) {
      const rows = await db
        .select()
        .from(cftcPositions)
        .where(eq(cftcPositions.commodity, commodity))
        .orderBy(desc(cftcPositions.reportDate))
        .limit(52);

      return NextResponse.json({ commodity, data: rows });
    }

    // Return latest for each commodity
    const commodities = ["gold", "silver", "crude_oil", "sp500"];
    const results: Record<string, unknown> = {};

    for (const c of commodities) {
      const rows = await db
        .select()
        .from(cftcPositions)
        .where(eq(cftcPositions.commodity, c))
        .orderBy(desc(cftcPositions.reportDate))
        .limit(1);

      results[c] = rows[0] ?? null;
    }

    return NextResponse.json(results);
  } catch (e) {
    logger.error("api/cftc", "CFTC data fetch error", { error: e });
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
