import { NextResponse } from "next/server";
import { getCache, setCache } from "@/lib/cache/market-cache";
import { computeGavekalHistory, type GavekalHistoricalEntry } from "@/lib/markets/gavekal";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const CACHE_KEY = "gavekal:history";
const CACHE_MAX_AGE = 6 * 60 * 60; // 6 hours

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const maWeeks = searchParams.get("maWeeks")
    ? parseInt(searchParams.get("maWeeks")!, 10)
    : undefined;
  const historyYears = searchParams.get("years")
    ? parseInt(searchParams.get("years")!, 10)
    : undefined;

  const cacheKey =
    maWeeks || historyYears
      ? `${CACHE_KEY}:${maWeeks ?? 365}:${historyYears ?? 10}`
      : CACHE_KEY;

  try {
    const cached = await getCache<GavekalHistoricalEntry[]>(cacheKey, CACHE_MAX_AGE);

    if (cached && !cached.isStale) {
      return NextResponse.json(cached.data);
    }

    const data = await computeGavekalHistory(
      maWeeks || historyYears ? { maWeeks, historyYears } : undefined,
    );
    await setCache(cacheKey, data);

    return NextResponse.json(data);
  } catch (error) {
    logger.error("api/markets/gavekal/history", "Error in GET", { error });

    const stale = await getCache<GavekalHistoricalEntry[]>(cacheKey, CACHE_MAX_AGE * 4);
    if (stale) {
      return NextResponse.json(stale.data);
    }

    return NextResponse.json(
      { error: "Failed to fetch Gavekal history" },
      { status: 500 },
    );
  }
}
