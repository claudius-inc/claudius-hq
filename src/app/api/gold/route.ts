import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { goldAnalysis } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { getCache, setCache, CACHE_KEYS } from "@/lib/market-cache";
import { logger } from "@/lib/logger";
import { fetchGoldData } from "@/lib/gold";

export const dynamic = "force-dynamic";

// GET /api/gold - Returns current analysis, live price, and recent flows
export async function GET(request: NextRequest) {
  try {
    const fresh = request.nextUrl.searchParams.get("fresh") === "true";

    if (!fresh) {
      // Reduced TTL from 300s to 60s for fresher data
      const cached = await getCache<Record<string, unknown>>(
        CACHE_KEYS.GOLD,
        60,
      );
      if (cached && !cached.isStale) {
        return NextResponse.json({
          ...cached.data,
          cached: true,
          cacheAge: cached.updatedAt,
        });
      }
      if (cached) {
        fetchGoldData()
          .then((data) => setCache(CACHE_KEYS.GOLD, data))
          .catch((e) =>
            logger.error("api/gold", "Background gold refresh failed", {
              error: e,
            }),
          );
        return NextResponse.json({
          ...cached.data,
          cached: true,
          cacheAge: cached.updatedAt,
          isStale: true,
        });
      }
    }

    const data = await fetchGoldData();
    await setCache(CACHE_KEYS.GOLD, data);
    return NextResponse.json({ ...data, cached: false });
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
