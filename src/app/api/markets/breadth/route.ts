import { NextRequest, NextResponse } from "next/server";
import { getCache, setCache, CACHE_KEYS } from "@/lib/market-cache";
import { logger } from "@/lib/logger";
import { fetchBreadthData } from "@/lib/breadth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const fresh = request.nextUrl.searchParams.get("fresh") === "true";

    if (!fresh) {
      const cached = await getCache<Record<string, unknown>>(CACHE_KEYS.BREADTH, 900);
      if (cached && !cached.isStale) {
        return NextResponse.json({
          ...cached.data,
          cached: true,
          cacheAge: cached.updatedAt,
        });
      }
      if (cached) {
        fetchBreadthData()
          .then((data) => setCache(CACHE_KEYS.BREADTH, data))
          .catch((e) => logger.error("api/markets/breadth", "Background breadth refresh failed", { error: e }));
        return NextResponse.json({
          ...cached.data,
          cached: true,
          cacheAge: cached.updatedAt,
          isStale: true,
        });
      }
    }

    const data = await fetchBreadthData();
    await setCache(CACHE_KEYS.BREADTH, data);
    return NextResponse.json({ ...data, cached: false });
  } catch (e) {
    logger.error("api/markets/breadth", "Breadth API error", { error: e });
    return NextResponse.json({
      advanceDecline: { advances: null, declines: null, unchanged: null, ratio: null, netAdvances: null },
      newHighsLows: { newHighs: null, newLows: null, ratio: null, netHighs: null },
      level: "neutral",
      interpretation: "Data unavailable",
      mcclellan: { oscillator: null, signal: null },
      error: String(e),
      updatedAt: new Date().toISOString(),
    });
  }
}
