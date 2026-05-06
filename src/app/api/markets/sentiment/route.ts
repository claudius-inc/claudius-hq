import { NextRequest, NextResponse } from "next/server";
import { getCache, setCache, CACHE_KEYS } from "@/lib/cache/market-cache";
import { logger } from "@/lib/logger";
import { fetchSentimentData } from "@/lib/markets/sentiment";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const fresh = request.nextUrl.searchParams.get("fresh") === "true";

    if (!fresh) {
      const cached = await getCache<Record<string, unknown>>(CACHE_KEYS.SENTIMENT, 1800); // 30 min
      if (cached && !cached.isStale) {
        return NextResponse.json({
          ...cached.data,
          cached: true,
          cacheAge: cached.updatedAt,
        });
      }
      if (cached) {
        fetchSentimentData()
          .then((data) => setCache(CACHE_KEYS.SENTIMENT, data))
          .catch((e) => logger.error("api/markets/sentiment", "Background sentiment refresh failed", { error: e }));
        return NextResponse.json({
          ...cached.data,
          cached: true,
          cacheAge: cached.updatedAt,
          isStale: true,
        });
      }
    }

    const data = await fetchSentimentData();
    await setCache(CACHE_KEYS.SENTIMENT, data);
    return NextResponse.json({ ...data, cached: false });
  } catch (e) {
    logger.error("api/markets/sentiment", "Failed to get sentiment data", { error: e });
    return NextResponse.json({
      vix: { value: null, change: null, changePercent: null, level: null },
      volatilityContext: null,
      error: String(e),
      updatedAt: new Date().toISOString(),
    }, { status: 500 });
  }
}
