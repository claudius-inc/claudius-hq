import { NextRequest, NextResponse } from "next/server";
import { db, clarityJournals } from "@/db";
import { eq, sql, inArray } from "drizzle-orm";

// GET /api/clarity-journal/counts?holdingIds=1,2,3
// Returns { counts: { "1": 2, "2": 0, "3": 5 } }
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const holdingIdsParam = url.searchParams.get("holdingIds");
    
    if (!holdingIdsParam) {
      return NextResponse.json({ error: "holdingIds required" }, { status: 400 });
    }

    const holdingIds = holdingIdsParam.split(",").map((id) => parseInt(id)).filter((id) => !isNaN(id));
    
    if (holdingIds.length === 0) {
      return NextResponse.json({ counts: {} });
    }

    // Get counts for each holding
    const results = await db
      .select({
        holdingId: clarityJournals.holdingId,
        count: sql<number>`count(*)`,
      })
      .from(clarityJournals)
      .where(inArray(clarityJournals.holdingId, holdingIds))
      .groupBy(clarityJournals.holdingId);

    // Build counts map
    const counts: Record<string, number> = {};
    for (const id of holdingIds) {
      counts[id.toString()] = 0;
    }
    for (const row of results) {
      if (row.holdingId !== null) {
        counts[row.holdingId.toString()] = row.count;
      }
    }

    return NextResponse.json({ counts });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
