"use client";

import { useMemo } from "react";
import useSWR from "swr";
import type {
  MacroIndicator,
  MarketEtf,
  SentimentData,
  BreadthData,
  CongressData,
  InsiderData,
  YieldSpread,
  RegimeData,
} from "../types";
import type {
  PlaybookDataSnapshot,
  BtcSnapshot,
  GoldSnapshot,
  OilSnapshot,
  FxSnapshot,
} from "./types";
import type { SectorMomentum } from "@/app/api/sectors/momentum/route";

const fetcher = (url: string) =>
  fetch(url).then((r) => (r.ok ? r.json() : null));

const swrConfig = {
  refreshInterval: 60000,
  revalidateOnFocus: true,
  dedupingInterval: 10000,
};

interface PlaybookPageData {
  macroIndicators: MacroIndicator[];
  yieldSpreads: YieldSpread[];
  marketEtfs: MarketEtf[];
  sentimentData: SentimentData | null;
  breadthData: BreadthData | null;
  congressData: CongressData | null;
  insiderData: InsiderData | null;
  regimeData: RegimeData | null;
}

export function usePlaybookData(pageData: PlaybookPageData): {
  snapshot: PlaybookDataSnapshot;
  loading: boolean;
} {
  // SWR calls — share cache with HardAssets component
  const { data: btc, isLoading: loadingBtc } = useSWR<BtcSnapshot>(
    "/api/btc",
    fetcher,
    swrConfig,
  );
  const { data: gold, isLoading: loadingGold } = useSWR<GoldSnapshot>(
    "/api/gold",
    fetcher,
    swrConfig,
  );
  const { data: oil, isLoading: loadingOil } = useSWR<OilSnapshot>(
    "/api/oil",
    fetcher,
    swrConfig,
  );
  const { data: sectorData, isLoading: loadingSectors } = useSWR<{
    sectors: SectorMomentum[];
  }>("/api/sectors/momentum", fetcher, swrConfig);
  const { data: fx, isLoading: loadingFx } = useSWR<FxSnapshot>(
    "/api/fx",
    fetcher,
    swrConfig,
  );

  const snapshot = useMemo<PlaybookDataSnapshot>(
    () => ({
      macroIndicators: pageData.macroIndicators,
      yieldSpreads: pageData.yieldSpreads,
      sentiment: pageData.sentimentData,
      breadth: pageData.breadthData,
      marketEtfs: pageData.marketEtfs,
      congress: pageData.congressData,
      insider: pageData.insiderData,
      btc: btc ?? null,
      gold: gold ?? null,
      oil: oil ?? null,
      fx: fx ?? null,
      sectors: sectorData?.sectors ?? [],
      regime: pageData.regimeData,
    }),
    [pageData, btc, gold, oil, fx, sectorData],
  );

  const loading = loadingBtc || loadingGold || loadingOil || loadingFx || loadingSectors;

  return { snapshot, loading };
}
