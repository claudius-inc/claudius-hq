import { NextResponse } from "next/server";
import { getCache, setCache } from "@/lib/market-cache";
import { computeGavekalQuadrant, type GavekalData } from "@/lib/gavekal";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const CACHE_KEY = "gavekal:quadrant";
const CACHE_MAX_AGE = 6 * 60 * 60; // 6 hours — ratios move slowly

export async function GET() {
  try {
    const cached = await getCache<GavekalData>(CACHE_KEY, CACHE_MAX_AGE);

    if (cached && !cached.isStale) {
      return NextResponse.json(cached.data);
    }

    const data = await computeGavekalQuadrant();
    await setCache(CACHE_KEY, data);

    return NextResponse.json(data);
  } catch (error) {
    logger.error("api/markets/gavekal", "Error in GET", { error });

    // Return stale cache on error
    const stale = await getCache<GavekalData>(CACHE_KEY, CACHE_MAX_AGE * 4);
    if (stale) {
      return NextResponse.json(stale.data);
    }

    return NextResponse.json(
      { error: "Failed to fetch Gavekal data" },
      { status: 500 },
    );
  }
}
