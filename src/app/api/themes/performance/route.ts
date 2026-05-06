import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { getCache, setCache, CACHE_KEYS } from "@/lib/cache/market-cache";
import { fetchThemePerformanceAll, ThemePerformanceResponse } from "@/lib/markets/themes";

// GET /api/themes/performance
// Returns pre-aggregated performance for ALL themes (no client-side ticker fan-out).
// SWR cache pattern matches /api/sectors/momentum.
export async function GET(request: NextRequest) {
  try {
    const fresh = request.nextUrl.searchParams.get("fresh") === "true";

    if (!fresh) {
      const cached = await getCache<ThemePerformanceResponse>(CACHE_KEYS.THEMES_PERFORMANCE, 900);
      if (cached && !cached.isStale) {
        return NextResponse.json(
          { ...cached.data, cached: true, cacheAge: cached.updatedAt },
          { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } },
        );
      }
      if (cached) {
        fetchThemePerformanceAll()
          .then((data) => setCache(CACHE_KEYS.THEMES_PERFORMANCE, data))
          .catch((e) =>
            logger.error("api/themes/performance", "Background refresh failed", { error: e }),
          );
        return NextResponse.json(
          { ...cached.data, cached: true, cacheAge: cached.updatedAt, isStale: true },
          { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } },
        );
      }
    }

    const data = await fetchThemePerformanceAll();
    await setCache(CACHE_KEYS.THEMES_PERFORMANCE, data);
    return NextResponse.json(
      { ...data, cached: false },
      { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } },
    );
  } catch (e) {
    logger.error("api/themes/performance", "Failed to get theme performance", { error: e });
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
