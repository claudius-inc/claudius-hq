import { NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";
import { getCache, setCache, CACHE_KEYS } from "@/lib/cache/market-cache";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

interface SilverPriceResponse {
  price: number | null;
  changePercent: number | null;
  goldSilverRatio: number | null;
  goldPrice: number | null;
  updatedAt: string;
}

interface QuoteResult {
  regularMarketPrice?: number;
  regularMarketChangePercent?: number;
}

async function fetchSilverPriceData(): Promise<SilverPriceResponse> {
  // Fetch silver and gold futures in parallel
  const [silverQuote, goldQuote] = await Promise.all([
    yahooFinance.quote("SI=F").catch(() => null) as Promise<QuoteResult | null>,
    yahooFinance.quote("GC=F").catch(() => null) as Promise<QuoteResult | null>,
  ]);

  const silverPrice = silverQuote?.regularMarketPrice ?? null;
  const silverChange = silverQuote?.regularMarketChangePercent ?? null;
  const goldPrice = goldQuote?.regularMarketPrice ?? null;

  const goldSilverRatio =
    silverPrice && goldPrice
      ? Math.round((goldPrice / silverPrice) * 10) / 10
      : null;

  return {
    price: silverPrice,
    changePercent: silverChange,
    goldSilverRatio,
    goldPrice,
    updatedAt: new Date().toISOString(),
  };
}

export async function GET() {
  try {
    // Stale-while-revalidate pattern (same as /api/gold)
    const cached = await getCache<SilverPriceResponse>(
      CACHE_KEYS.SILVER_PRICE,
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
      // Return stale, refresh in background
      fetchSilverPriceData()
        .then((data) => setCache(CACHE_KEYS.SILVER_PRICE, data))
        .catch((e) =>
          logger.error("api/silver-price", "Background silver refresh failed", {
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

    // No cache at all — fetch fresh
    const data = await fetchSilverPriceData();
    await setCache(CACHE_KEYS.SILVER_PRICE, data);
    return NextResponse.json({ ...data, cached: false });
  } catch (error) {
    logger.error("api/silver-price", "Silver price API error", { error });
    return NextResponse.json(
      {
        price: null,
        changePercent: null,
        goldSilverRatio: null,
        goldPrice: null,
        updatedAt: new Date().toISOString(),
        error: "Failed to fetch silver price",
      },
      { status: 500 },
    );
  }
}
