"use client";

import { useState, useEffect, useMemo, type ReactNode } from "react";
import useSWR, { mutate } from "swr";
import { PageHero } from "@/components/PageHero";
import { fetcher, ssrHydratedConfig } from "@/lib/swr-config";

import { MarketMood } from "./MarketMood";
import { HardAssets } from "./HardAssets";
import { CompactValuationStrip } from "./CompactValuationStrip";
import { ThemeLeaderboardLite } from "./ThemeLeaderboardLite";
import type { ExpectedReturnsResponse } from "@/lib/valuation/types";
import type {
  SentimentData,
  BreadthData,
} from "../_lib/types";

interface MarketsClientProps {
  /** Server-rendered Gavekal section. Composed by the parent server
   *  component so this client tree can host an SSR'd subtree without
   *  importing a server component directly. */
  gavekalSlot: ReactNode;

  // Initial data from SSR — each panel uses its own as `fallbackData` for
  // its useSWR hook so first paint is instant + a background revalidation
  // fires on mount with a per-panel refresh indicator visible.
  initialSentiment: SentimentData | null;
  initialBreadth: BreadthData | null;
  // The following are typed loosely on purpose: the SSR fetchers return
  // shapes that are runtime-compatible with what the panel components
  // need but not necessarily TypeScript-equivalent. SWR's `fallbackData`
  // accepts the loose shape and the next refetch normalizes it.
  initialValuation: unknown;
  initialThemes: unknown;
  initialExpectedReturns: ExpectedReturnsResponse | null;
  initialGold: unknown;
}

export function MarketsClient({
  gavekalSlot,
  initialSentiment,
  initialBreadth,
  initialValuation,
  initialThemes,
  initialExpectedReturns,
  initialGold,
}: MarketsClientProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Refetch on visibility (preserves the existing behavior).
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        mutate("/api/gold");
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibility);
  }, []);

  // ── SWR-managed sources ────────────────────────────────────────────────
  // Each one is seeded with `fallbackData` from SSR so first paint is
  // instant; SWR fires a background revalidation on mount + tab focus.

  const { data: sentimentData, isValidating: validatingSentiment } =
    useSWR<SentimentData>("/api/markets/sentiment", fetcher, {
      ...ssrHydratedConfig,
      fallbackData: initialSentiment ?? undefined,
    });

  const { data: breadthData, isValidating: validatingBreadth } =
    useSWR<BreadthData>("/api/markets/breadth", fetcher, {
      ...ssrHydratedConfig,
      fallbackData: initialBreadth ?? undefined,
    });

  const { data: expectedReturnsData } = useSWR<ExpectedReturnsResponse>(
    "/api/valuation/expected-returns",
    fetcher,
    {
      ...ssrHydratedConfig,
      fallbackData: initialExpectedReturns ?? undefined,
    },
  );

  // Gold data via SWR (seeds from SSR cache)
  useSWR<unknown>(
    "/api/gold",
    fetcher,
    {
      ...ssrHydratedConfig,
      fallbackData: initialGold ?? undefined,
    },
  );

  const moodRefreshing = validatingSentiment || validatingBreadth;

  return (
    <>
      <PageHero title="Markets Dashboard" subtitle="How to allocate" />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 items-start">
        <div className="col-span-full">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-stretch">
            <div className="lg:col-span-2 h-full">{gavekalSlot}</div>
            <div className="lg:col-span-1 h-full">
              <CompactValuationStrip
                initialData={
                  initialValuation as NonNullable<
                    React.ComponentProps<typeof CompactValuationStrip>
                  >["initialData"]
                }
              />
            </div>
          </div>
        </div>

        <div className="col-span-full">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
            <div className="lg:col-span-1">
              <ThemeLeaderboardLite
                initialData={
                  initialThemes as NonNullable<
                    React.ComponentProps<typeof ThemeLeaderboardLite>
                  >["initialData"]
                }
              />
            </div>
            <div className="lg:col-span-1">
              <MarketMood
                sentimentData={sentimentData ?? null}
                breadthData={breadthData ?? null}
                expandedIds={expandedIds}
                toggleExpanded={toggleExpanded}
                refreshing={moodRefreshing}
              />
            </div>
            <div className="lg:col-span-1">
              <HardAssets
                expectedReturns={expectedReturnsData ?? null}
                initialBtc={null}
                initialGold={
                  initialGold as React.ComponentProps<
                    typeof HardAssets
                  >["initialGold"]
                }
                initialSilver={null}
                initialSilverPrice={null}
              />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
