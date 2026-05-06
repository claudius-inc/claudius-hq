/**
 * Expected Returns API — thin wrapper around `fetchExpectedReturnsData`.
 *
 * The actual computation lives in src/lib/valuation/fetch-expected-returns.ts
 * so it can also be invoked directly from Server Components during SSR.
 */
import { NextResponse } from "next/server";
import { getCache, setCache } from "@/lib/cache/market-cache";
import { logger } from "@/lib/logger";
import type { ExpectedReturnsResponse } from "@/lib/valuation/types";
import { fetchExpectedReturnsData } from "@/lib/valuation/fetch-expected-returns";

export const dynamic = "force-dynamic";

const CACHE_KEY = "valuation:expected-returns";
const CACHE_MAX_AGE = 15 * 60; // 15 minutes

export async function GET() {
  try {
    const cached = await getCache<ExpectedReturnsResponse>(
      CACHE_KEY,
      CACHE_MAX_AGE,
    );

    if (cached) {
      if (cached.isStale) {
        // Background refresh; don't await
        fetchExpectedReturnsData()
          .then((data) => setCache(CACHE_KEY, data))
          .catch((e) =>
            logger.warn(
              "api/valuation/expected-returns",
              "Background refresh failed",
              { error: e },
            ),
          );
      }
      return NextResponse.json(cached.data);
    }

    const data = await fetchExpectedReturnsData();
    await setCache(CACHE_KEY, data);
    return NextResponse.json(data);
  } catch (error) {
    logger.error("api/valuation/expected-returns", "Error in GET", { error });

    const cached = await getCache<ExpectedReturnsResponse>(
      CACHE_KEY,
      CACHE_MAX_AGE * 4,
    );
    if (cached) {
      return NextResponse.json({
        ...cached.data,
        status: "partial",
        error: "Using cached data due to error",
      });
    }

    return NextResponse.json(
      {
        assets: [],
        relativeRanking: [],
        tacticalSummary: {
          alignment: "mixed",
          message: "Unable to calculate - data unavailable",
          aligned: [],
          divergent: [],
        },
        updatedAt: new Date().toISOString(),
        status: "error",
        error: "Failed to fetch valuation data",
      },
      { status: 500 },
    );
  }
}
