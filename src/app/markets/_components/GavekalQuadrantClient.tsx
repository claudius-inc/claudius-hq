"use client";

import useSWR from "swr";
import { GavekalQuadrant } from "./GavekalQuadrant";
import { fetcher, ssrHydratedConfig } from "@/lib/swr-config";
import type { GavekalData } from "@/lib/markets/gavekal";

/**
 * Client-side SWR wrapper around GavekalQuadrant. Server fetches the
 * initial data and passes it as `initialData`; this component then
 * re-fetches in the background on mount + tab focus, and exposes
 * `isValidating` to the inner panel via the existing `refreshing` prop.
 */
export function GavekalQuadrantClient({
  initialData,
}: {
  initialData: GavekalData | null;
}) {
  const { data, isValidating } = useSWR<GavekalData>(
    "/api/markets/gavekal",
    fetcher,
    {
      ...ssrHydratedConfig,
      fallbackData: initialData ?? undefined,
      // Poll every 6h even without tab focus.
      // Gavekal ratios use weekly data + 7yr MAs so they change slowly,
      // but the quadrant can flip (as happened Mar→Apr 2026 when the
      // dashboard showed Inflationary Bust for 2 weeks due to stale cache).
      refreshInterval: 6 * 60 * 60 * 1000,
    },
  );

  return (
    <GavekalQuadrant
      data={data ?? null}
      loading={!data}
      refreshing={isValidating}
    />
  );
}
