import { NextResponse } from "next/server";
import { getCache, setCache, clearCache } from "@/lib/cache/market-cache";
import { computeGavekalQuadrant, type GavekalData } from "@/lib/markets/gavekal";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // Yahoo API fetches for 4 symbols can be slow

// v13: supports ?refresh=1 to force-recompute and bypass stale cache.
// Also increased maxDuration to 60s to prevent Yahoo API timeouts.
const CACHE_KEY = "gavekal:quadrant:v13";
const CACHE_MAX_AGE = 6 * 60 * 60; // 6 hours — ratios move slowly

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const forceRefresh = searchParams.get("refresh") === "1";
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
    // Cache-bust: ?refresh=1 deletes the cached entry and recomputes.
    if (forceRefresh) {
      await clearCache(cacheKey).catch(() => {});
    }

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
