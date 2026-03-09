import { NextRequest, NextResponse } from "next/server";
import { fetchMacroData } from "@/lib/fetch-macro-data";
import { getCache, setCache, CACHE_KEYS } from "@/lib/market-cache";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const fresh = request.nextUrl.searchParams.get("fresh") === "true";

    if (!fresh) {
      const cached = await getCache<Record<string, unknown>>(CACHE_KEYS.MACRO, 1800); // 30 min for daily indicators
      if (cached && !cached.isStale) {
        return NextResponse.json({
          ...cached.data,
          cached: true,
          cacheAge: cached.updatedAt,
        });
      }
      if (cached) {
        fetchMacroData()
          .then((data) => setCache(CACHE_KEYS.MACRO, data))
          .catch((e) => console.error("Background macro refresh failed:", e));
        return NextResponse.json({
          ...cached.data,
          cached: true,
          cacheAge: cached.updatedAt,
          isStale: true,
        });
      }
    }

    const data = await fetchMacroData();
    await setCache(CACHE_KEYS.MACRO, data);
    return NextResponse.json({ ...data, cached: false });
  } catch (e) {
    console.error("Macro API error:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
