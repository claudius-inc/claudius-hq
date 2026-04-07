"use client";

import useSWR from "swr";
import { GavekalQuadrant } from "./GavekalQuadrant";
import { fetcher, ssrHydratedConfig } from "@/lib/swr-config";
import type { GavekalData } from "@/lib/gavekal";

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
