"use client";

import { useState, useEffect } from "react";
import { mutate } from "swr";
import { PageHero } from "@/components/PageHero";
import { detectRegime } from "./_components/helpers";
import { RegimeStrip } from "./_components/RegimeStrip";

import { Barometers } from "./_components/Barometers";
import { Sentiment } from "./_components/Sentiment";
import { SmartMoney } from "./_components/SmartMoney";
import { Indicators } from "./_components/Indicators";
import { HardAssets } from "./_components/HardAssets";
import { RegimeDetail } from "./_components/RegimeDetail";
import { PlaybookSection } from "./_components/playbook/PlaybookSection";
import { ValuationCards } from "./_components/ValuationCards";
import type { ExpectedReturnsResponse } from "@/lib/valuation/types";
import type {
  MacroIndicator,
  MarketEtf,
  RegimeData,
  SentimentData,
  BreadthData,
  CongressData,
  InsiderData,
  YieldSpread,
  CrowdingData,
} from "./_components/types";

export default function StocksDashboard() {
  const [macroIndicators, setMacroIndicators] = useState<MacroIndicator[]>([]);
  const [sentimentData, setSentimentData] = useState<SentimentData | null>(
    null,
  );
  const [marketEtfs, setMarketEtfs] = useState<MarketEtf[]>([]);
  const [regimeData, setRegimeData] = useState<RegimeData | null>(null);
  const [breadthData, setBreadthData] = useState<BreadthData | null>(null);
  const [congressData, setCongressData] = useState<CongressData | null>(null);
  const [insiderData, setInsiderData] = useState<InsiderData | null>(null);
  const [yieldSpreads, setYieldSpreads] = useState<YieldSpread[]>([]);
  const [crowdingData, setCrowdingData] = useState<CrowdingData | null>(null);
  const [expectedReturns, setExpectedReturns] = useState<ExpectedReturnsResponse | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [regimeDetailOpen, setRegimeDetailOpen] = useState(false);
  const [loading, setLoading] = useState({
    macro: true,
    sentiment: true,
    etfs: true,
    regime: true,
    breadth: true,
    congress: true,
    insider: true,
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
    fetch("/api/macro/etfs")
      .then((res) => res.json())
      .then((data) => {
        setMarketEtfs(data.etfs || []);
      })
      .catch(console.error)
      .finally(() => setLoading((prev) => ({ ...prev, etfs: false })));

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
          <RegimeStrip
            regimeData={regimeData}
            loading={{ regime: loading.regime, sentiment: loading.sentiment }}
            onOpenDetail={() => setRegimeDetailOpen(true)}
            expectedReturns={expectedReturns}
          />
        </div>

        <ValuationCards />

        <PlaybookSection
          macroIndicators={macroIndicators}
          yieldSpreads={yieldSpreads}
          marketEtfs={marketEtfs}
          sentimentData={sentimentData}
          breadthData={breadthData}
          congressData={congressData}
          insiderData={insiderData}
          regimeData={regimeData}
          loading={loading.macro || loading.sentiment || loading.breadth || loading.regime}
        />

        <div className="space-y-4">
          <Barometers
            marketEtfs={marketEtfs}
            loading={loading.etfs}
            expandedIds={expandedIds}
            toggleExpanded={toggleExpanded}
            expectedReturns={expectedReturns}
          />
          <SmartMoney
            congressData={congressData}
            insiderData={insiderData}
            expandedIds={expandedIds}
            toggleExpanded={toggleExpanded}
          />
        </div>

        <HardAssets expectedReturns={expectedReturns} />

        <Sentiment
          sentimentData={sentimentData}
          breadthData={breadthData}
          crowdingData={crowdingData}
          expandedIds={expandedIds}
          toggleExpanded={toggleExpanded}
        />

        <Indicators
          macroIndicators={macroIndicators}
          yieldSpreads={yieldSpreads}
          loading={loading.macro}
          expandedIds={expandedIds}
          toggleExpanded={toggleExpanded}
        />
      </div>

      <RegimeDetail
        open={regimeDetailOpen}
        onClose={() => setRegimeDetailOpen(false)}
        regimeData={regimeData}
        macroIndicators={macroIndicators}
        expectedReturns={expectedReturns}
      />
    </>
  );
}
