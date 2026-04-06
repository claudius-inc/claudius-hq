import { NextResponse } from "next/server";
import { getCache, setCache } from "@/lib/market-cache";
import { computeGavekalQuadrant, type GavekalData } from "@/lib/gavekal";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

// v5: ratio chart histories now sourced from monthly historical pipeline (1971+)
const CACHE_KEY = "gavekal:quadrant:v5";
const CACHE_MAX_AGE = 6 * 60 * 60; // 6 hours — ratios move slowly

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const maWeeks = searchParams.get("maWeeks")
    ? parseInt(searchParams.get("maWeeks")!, 10)
    : undefined;
  const historyYears = searchParams.get("years")
    ? parseInt(searchParams.get("years")!, 10)
    : undefined;

  // Use custom cache key if non-default params
  const cacheKey =
    maWeeks || historyYears
      ? `${CACHE_KEY}:${maWeeks ?? 365}:${historyYears ?? 10}`
      : CACHE_KEY;

  try {
    const cached = await getCache<GavekalData>(cacheKey, CACHE_MAX_AGE);

    if (cached && !cached.isStale) {
      return NextResponse.json(cached.data);
    }

    const data = await computeGavekalQuadrant(
      maWeeks || historyYears ? { maWeeks, historyYears } : undefined,
    );
    await setCache(cacheKey, data);

    return NextResponse.json(data);
  } catch (error) {
    logger.error("api/markets/gavekal", "Error in GET", { error });

    // Return stale cache on error
    const stale = await getCache<GavekalData>(cacheKey, CACHE_MAX_AGE * 4);
    if (stale) {
      return NextResponse.json(stale.data);
    }

    return NextResponse.json(
      { error: "Failed to fetch Gavekal data" },
      { status: 500 },
    );
  }
}
