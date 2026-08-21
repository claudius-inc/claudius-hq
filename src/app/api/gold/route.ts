import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { goldAnalysis } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { logger } from "@/lib/logger";
import { getGoldData } from "@/lib/markets/gold";

export const dynamic = "force-dynamic";

// GET /api/gold - Returns current analysis, live price, and recent flows.
// Never serves stale data: `getGoldData` blocks on a fresh fetch once the
// cache passes its TTL. The 60s TTL only dedups rapid refreshes so we don't
// hammer Yahoo/FRED. `?fresh=true` forces a live fetch, bypassing the TTL.
export async function GET(request: NextRequest) {
  try {
    const fresh = request.nextUrl.searchParams.get("fresh") === "true";

    const data = await getGoldData(fresh ? 0 : 60);
    if (!data) {
      return NextResponse.json(
        { error: "Gold data unavailable" },
        { status: 503 },
      );
    }
    return NextResponse.json(data);
  } catch (e) {
    logger.error("api/gold", "Gold API error", { error: e });
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// POST /api/gold - Update analysis (admin)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      keyLevels,
      scenarios,
      thesisNotes,
      ath,
      athDate,
      cyclePhase,
      catalysts,
    } = body;

    const existing = await db
      .select()
      .from(goldAnalysis)
      .orderBy(desc(goldAnalysis.id))
      .limit(1);

    const data = {
      keyLevels: keyLevels ? JSON.stringify(keyLevels) : null,
      scenarios: scenarios ? JSON.stringify(scenarios) : null,
      thesisNotes: thesisNotes || null,
      ath: ath || null,
      athDate: athDate || null,
      cyclePhase: cyclePhase ?? null,
      catalysts: catalysts ? JSON.stringify(catalysts) : null,
      updatedAt: new Date().toISOString(),
    };

    if (existing.length > 0) {
      await db
        .update(goldAnalysis)
        .set(data)
        .where(eq(goldAnalysis.id, existing[0].id));
    } else {
      await db.insert(goldAnalysis).values(data);
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    logger.error("api/gold", "Gold analysis update error", { error: e });
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
