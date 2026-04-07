import { Suspense } from "react";
import { MarketsClient } from "./_components/MarketsClient";
import { GavekalQuadrant } from "./_components/GavekalQuadrant";
import { GavekalQuadrantClient } from "./_components/GavekalQuadrantClient";
import { computeGavekalQuadrant, type GavekalData } from "@/lib/gavekal";
import { getCache, setCache } from "@/lib/market-cache";
import { logger } from "@/lib/logger";
import { fetchSentimentData } from "@/lib/sentiment";
import { fetchBreadthData } from "@/lib/breadth";
import { fetchValuationData } from "@/lib/valuation";
import { fetchThemePerformanceAll } from "@/lib/themes";
import { fetchMacroData } from "@/lib/fetch-macro-data";
import { fetchGoldData, fetchGoldDataLite } from "@/lib/gold";
import { fetchCongressData } from "@/lib/congress";
import { fetchInsiderData } from "@/lib/insider";
import { fetchExpectedReturnsData } from "@/lib/valuation/fetch-expected-returns";
import { fetchRegimePanelData } from "@/lib/regime-panel";

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

async function fetchAllInitialData() {
  // Each fetch is wrapped in `.catch(() => null)` so a single failure can't
  // break the whole page render. SWR on the client will retry on mount.
  return Promise.all([
    fetchSentimentData().catch(() => null),
    fetchBreadthData().catch(() => null),
    fetchRegimePanelData().catch(() => null),
    fetchValuationData().catch(() => null),
    fetchThemePerformanceAll().catch(() => null),
    fetchMacroData().catch(() => null),
    fetchGoldDataLite().catch(() => null),
    fetchCongressData().catch(() => null),
    fetchInsiderData().catch(() => null),
    fetchExpectedReturnsData().catch(() => null),
    fetchGoldData().catch(() => null),
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
    crowding,
    valuation,
    themes,
    macro,
    goldLite,
    congress,
    insider,
    expectedReturns,
    gold,
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
      // Loose type cast: the lib's CrowdingLevel includes "early" which the
      // frontend's CrowdingData type doesn't list. Runtime-compatible; the
      // SWR refetch on mount will normalize. Same pattern for macro/congress/insider.
      initialCrowding={
        crowding as React.ComponentProps<typeof MarketsClient>["initialCrowding"]
      }
      initialValuation={valuation}
      initialThemes={themes}
      initialMacro={
        macro as React.ComponentProps<typeof MarketsClient>["initialMacro"]
      }
      initialGoldLite={goldLite}
      initialCongress={congress}
      initialInsider={insider}
      initialExpectedReturns={expectedReturns}
      initialGold={gold}
    />
  );
}
