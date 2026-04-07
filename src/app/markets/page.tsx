"use client";

import { useState, useEffect } from "react";
import { mutate } from "swr";
import { PageHero } from "@/components/PageHero";
import { detectRegime } from "./_components/helpers";

import { MarketMood } from "./_components/MarketMood";
import { HardAssets } from "./_components/HardAssets";
import { Indicators } from "./_components/Indicators";
import { GavekalQuadrant } from "./_components/GavekalQuadrant";
import { CompactValuationStrip } from "./_components/CompactValuationStrip";
import { ThemeLeaderboardLite } from "./_components/ThemeLeaderboardLite";
import { MacroToggle } from "./_components/MacroToggle";
import type { ExpectedReturnsResponse } from "@/lib/valuation/types";
import type {
  MacroIndicator,
  RegimeData,
  SentimentData,
  BreadthData,
  CongressData,
  InsiderData,
  YieldSpread,
  CrowdingData,
  GavekalData,
} from "./_components/types";

export default function StocksDashboard() {
  const [macroIndicators, setMacroIndicators] = useState<MacroIndicator[]>([]);
  const [sentimentData, setSentimentData] = useState<SentimentData | null>(
    null,
  );
  const [regimeData, setRegimeData] = useState<RegimeData | null>(null);
  const [breadthData, setBreadthData] = useState<BreadthData | null>(null);
  const [congressData, setCongressData] = useState<CongressData | null>(null);
  const [insiderData, setInsiderData] = useState<InsiderData | null>(null);
  const [yieldSpreads, setYieldSpreads] = useState<YieldSpread[]>([]);
  const [crowdingData, setCrowdingData] = useState<CrowdingData | null>(null);
  const [expectedReturns, setExpectedReturns] = useState<ExpectedReturnsResponse | null>(null);
  const [gavekalData, setGavekalData] = useState<GavekalData | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState({
    macro: true,
    sentiment: true,
    regime: true,
    breadth: true,
    congress: true,
    insider: true,
    gavekal: true,
  });

  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Refetch key data when tab becomes visible (fixes stale data issue)
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        mutate("/api/gold");
        mutate("/api/macro");
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, []);

  useEffect(() => {
    fetch("/api/markets/sentiment")
      .then((res) => res.json())
      .then((data) => {
        setSentimentData(data);
      })
      .catch(console.error)
      .finally(() => setLoading((prev) => ({ ...prev, sentiment: false })));

    fetch("/api/markets/breadth")
      .then((res) => res.json())
      .then((data) => {
        setBreadthData(data);
      })
      .catch(console.error)
      .finally(() => setLoading((prev) => ({ ...prev, breadth: false })));

    fetch("/api/markets/congress")
      .then((res) => res.json())
      .then((data) => {
        setCongressData(data);
      })
      .catch(console.error)
      .finally(() => setLoading((prev) => ({ ...prev, congress: false })));

    fetch("/api/markets/insider")
      .then((res) => res.json())
      .then((data) => {
        setInsiderData(data);
      })
      .catch(console.error)
      .finally(() => setLoading((prev) => ({ ...prev, insider: false })));

    fetch("/api/valuation/expected-returns")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setExpectedReturns(data))
      .catch(console.error);

    fetch("/api/markets/regime")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setCrowdingData(data))
      .catch(console.error);

    fetch("/api/markets/gavekal")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setGavekalData(data))
      .catch(console.error)
      .finally(() => setLoading((prev) => ({ ...prev, gavekal: false })));

    // Single macro fetch for both indicators state AND regime detection
    // Gold data for regime comes from /api/gold (also used by HardAssets SWR, deduped by cache)
    Promise.all([
      fetch("/api/macro").then((res) => (res.ok ? res.json() : null)),
      fetch("/api/gold").then((res) => (res.ok ? res.json() : null)),
    ])
      .then(
        ([macroData, goldData]: [
          { indicators?: MacroIndicator[]; yieldSpreads?: YieldSpread[] } | null,
          { realYields?: { value: number }; dxy?: { price: number } } | null,
        ]) => {
          // Set macro indicators state (previously done by separate fetch)
          const indicators = macroData?.indicators || [];
          setMacroIndicators(indicators);
          setYieldSpreads(macroData?.yieldSpreads || []);

          // Regime detection
          const findIndicator = (id: string) => {
            const ind = indicators.find((i) => i.id === id);
            return ind?.data?.current ?? null;
          };

          const realYield = goldData?.realYields?.value ?? null;
          const debtToGdp = findIndicator("debt-to-gdp");
          const deficitToGdp = findIndicator("deficit-to-gdp");
          const dxy = goldData?.dxy?.price ?? null;

          const absDeficit = deficitToGdp ? Math.abs(deficitToGdp) : null;
          const regime = detectRegime({ realYield, debtToGdp, deficitToGdp: absDeficit });
          regime.indicators.dxy = dxy;
          setRegimeData(regime);
        },
      )
      .catch(console.error)
      .finally(() => setLoading((prev) => ({ ...prev, macro: false, regime: false })));
  }, []);

  return (
    <>
      <PageHero
        title="Markets Dashboard"
        subtitle="Portfolio overview, research, and market signals"
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 items-start">
        <div className="col-span-full">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-stretch">
            <div className="lg:col-span-2 h-full">
              <GavekalQuadrant data={gavekalData} loading={loading.gavekal} />
            </div>
            <div className="lg:col-span-1 h-full">
              <CompactValuationStrip />
            </div>
          </div>
        </div>

        <div className="col-span-full">
          <ThemeLeaderboardLite />
        </div>

        <MarketMood
          sentimentData={sentimentData}
          breadthData={breadthData}
          crowdingData={crowdingData}
          congressData={congressData}
          insiderData={insiderData}
          expandedIds={expandedIds}
          toggleExpanded={toggleExpanded}
        />

        <HardAssets expectedReturns={expectedReturns} />

        <MacroToggle
          macroIndicators={macroIndicators}
          yieldSpreads={yieldSpreads}
          loading={loading.macro}
          expandedIds={expandedIds}
          toggleExpanded={toggleExpanded}
        />
      </div>

    </>
  );
}
