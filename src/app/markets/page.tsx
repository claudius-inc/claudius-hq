import { Suspense } from "react";

// ISR: re-render every hour so Gavekal quadrant stays fresh.
// Without this, Vercel treats the page as fully static — SSR data
// (including Gavekal quadrant, sentiment, breadth) only refreshes on deploy.
export const revalidate = 3600;
import { MarketsClient } from "./_components/MarketsClient";
import { GavekalQuadrant } from "./_components/GavekalQuadrant";
import { GavekalQuadrantClient } from "./_components/GavekalQuadrantClient";
import { computeGavekalQuadrant, type GavekalData } from "@/lib/gavekal";
import { getCache, setCache, CACHE_KEYS } from "@/lib/market-cache";
import { logger } from "@/lib/logger";
import { fetchSentimentData } from "@/lib/sentiment";
import { fetchBreadthData } from "@/lib/breadth";
import { fetchValuationData } from "@/lib/valuation";
import { fetchThemePerformanceAll } from "@/lib/themes";
import { fetchGoldData } from "@/lib/gold";
import { fetchExpectedReturnsData } from "@/lib/valuation/fetch-expected-returns";

const GAVEKAL_CACHE_KEY = "gavekal:quadrant:v12";
const GAVEKAL_CACHE_MAX_AGE = 6 * 60 * 60; // 6 hours

async function getGavekalData(): Promise<GavekalData | null> {
  try {
    const cached = await getCache<GavekalData>(
      GAVEKAL_CACHE_KEY,
      GAVEKAL_CACHE_MAX_AGE,
    );
    if (cached && !cached.isStale) return cached.data;

    const fresh = await computeGavekalQuadrant();
    await setCache(GAVEKAL_CACHE_KEY, fresh);
    return fresh;
  } catch (error) {
    logger.error("markets/page", "Failed to load Gavekal data for SSR", {
      error,
    });
    const stale = await getCache<GavekalData>(
      GAVEKAL_CACHE_KEY,
      GAVEKAL_CACHE_MAX_AGE * 4,
    );
    return stale?.data ?? null;
  }
}

/**
 * Cache-first wrapper for SSR fetches. Returns cached data immediately if
 * available (even if stale, triggering a background refresh). Only blocks
 * on the first ever call when there's no cache at all.
 */
async function cachedFetch<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlSeconds: number,
): Promise<T | null> {
  const cached = await getCache<T>(key, ttlSeconds);
  if (cached) {
    if (cached.isStale) {
      // Background refresh — don't block SSR
      fetcher()
        .then((d) => setCache(key, d))
        .catch(() => {});
    }
    return cached.data;
  }
  // No cache at all — fetch and cache
  const data = await fetcher().catch(() => null);
  if (data) await setCache(key, data);
  return data;
}

async function fetchAllInitialData() {
  // All fetches are cache-first. On warm cache, zero external API calls.
  // Each fetcher is wrapped in `.catch(() => null)` via cachedFetch so a
  // single failure can't break the whole page render.
  return Promise.all([
    cachedFetch(CACHE_KEYS.SSR_SENTIMENT, () => fetchSentimentData(), 300),
    cachedFetch(CACHE_KEYS.SSR_BREADTH, () => fetchBreadthData(), 300),
    cachedFetch(CACHE_KEYS.SSR_VALUATION, () => fetchValuationData(), 300),
    cachedFetch(CACHE_KEYS.SSR_THEMES, () => fetchThemePerformanceAll(), 300),
    // Gold: just read from the gold API route cache (populated by /api/gold)
    // No external calls in SSR — client SWR handles freshness
    getCache<unknown>(CACHE_KEYS.GOLD, 120).then((c) => c?.data ?? null),
    cachedFetch(CACHE_KEYS.SSR_EXPECTED, () => fetchExpectedReturnsData(), 300),
  ]);
}

async function GavekalSection() {
  const data = await getGavekalData();
  // Use the SWR-wrapped client variant so the panel can refresh on mount
  // and show its refresh indicator. SSR seeds the initial value.
  return <GavekalQuadrantClient initialData={data} />;
}

export default async function StocksDashboard() {
  const [
    sentiment,
    breadth,
    valuation,
    themes,
    gold,
    expectedReturns,
  ] = await fetchAllInitialData();

  return (
    <MarketsClient
      gavekalSlot={
        <Suspense fallback={<GavekalQuadrant data={null} loading={true} />}>
          <GavekalSection />
        </Suspense>
      }
      initialSentiment={sentiment}
      initialBreadth={breadth}
      initialValuation={valuation}
      initialThemes={themes}
      initialExpectedReturns={expectedReturns}
      initialGold={gold}
    />
  );
}
