"use client";

import { useState, useEffect } from "react";
import { PageHero } from "@/components/PageHero";
import { detectRegime } from "./_components/helpers";
import { RegimeStrip } from "./_components/RegimeStrip";
import { AIInsights } from "./_components/AIInsights";
import { Barometers } from "./_components/Barometers";
import { Sentiment } from "./_components/Sentiment";
import { SmartMoney } from "./_components/SmartMoney";
import { Indicators } from "./_components/Indicators";
import { HardAssets } from "./_components/HardAssets";
import type {
  Position,
  Summary,
  MacroIndicator,
  MarketEtf,
  RegimeData,
  SentimentData,
  BreadthData,
  CongressData,
  InsiderData,
  InsightsData,
  YieldSpread,
} from "./_components/types";

export default function StocksDashboard() {
  const [portfolioData, setPortfolioData] = useState<{
    positions: Position[];
    summary: Summary | null;
    baseCurrency: string;
  } | null>(null);
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
  const [insightsData, setInsightsData] = useState<InsightsData | null>(null);
  const [generating, setGenerating] = useState(false);
  const [insightsError, setInsightsError] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState({
    portfolio: true,
    macro: true,
    sentiment: true,
    etfs: true,
    regime: true,
    breadth: true,
    congress: true,
    insider: true,
    insights: true,
  });

  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const regenerateInsights = async () => {
    setGenerating(true);
    setInsightsError(null);
    try {
      const res = await fetch("/api/macro/insights/generate", {
        method: "POST",
      });
      if (res.ok) {
        const data = await res.json();
        setInsightsData(data);
        setExpandedIds((prev) => new Set(prev).add("ai-insights"));
      } else {
        const error = await res.json();
        setInsightsError(error.error || "Failed to generate insights");
      }
    } catch (e) {
      console.error("Error generating insights:", e);
      setInsightsError("Failed to generate insights");
    } finally {
      setGenerating(false);
    }
  };

  useEffect(() => {
    fetch("/api/ibkr/positions")
      .then((res) => res.json())
      .then((data) => {
        setPortfolioData({
          positions: data.positions || [],
          summary: data.summary || null,
          baseCurrency: data.baseCurrency || "SGD",
        });
      })
      .catch(console.error)
      .finally(() => setLoading((prev) => ({ ...prev, portfolio: false })));

    fetch("/api/macro")
      .then((res) => res.json())
      .then((data) => {
        setMacroIndicators(data.indicators || []);
        setYieldSpreads(data.yieldSpreads || []);
      })
      .catch(console.error)
      .finally(() => setLoading((prev) => ({ ...prev, macro: false })));

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

    fetch("/api/macro/insights")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) setInsightsData(data);
      })
      .catch(console.error)
      .finally(() => setLoading((prev) => ({ ...prev, insights: false })));

    Promise.all([
      fetch("/api/macro").then((res) => (res.ok ? res.json() : null)),
      fetch("/api/gold").then((res) => (res.ok ? res.json() : null)),
    ])
      .then(
        ([macroData, goldData]: [
          { indicators?: { id: string; data?: { current: number } }[] } | null,
          { realYields?: { value: number }; dxy?: { price: number } } | null,
        ]) => {
          const indicators = macroData?.indicators || [];
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
      .finally(() => setLoading((prev) => ({ ...prev, regime: false })));
  }, []);

  return (
    <>
      <PageHero
        title="Markets Dashboard"
        subtitle="Portfolio overview, research, and market signals"
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 items-start">
        <RegimeStrip
          regimeData={regimeData}
          loading={{ regime: loading.regime, sentiment: loading.sentiment }}
        />

        <AIInsights
          insightsData={insightsData}
          generating={generating}
          insightsError={insightsError}
          loadingInsights={loading.insights}
          expandedIds={expandedIds}
          toggleExpanded={toggleExpanded}
          regenerateInsights={regenerateInsights}
        />

        <div className="space-y-4">
          <Barometers
            marketEtfs={marketEtfs}
            loading={loading.etfs}
            expandedIds={expandedIds}
            toggleExpanded={toggleExpanded}
          />
          <SmartMoney
            congressData={congressData}
            insiderData={insiderData}
            expandedIds={expandedIds}
            toggleExpanded={toggleExpanded}
          />
        </div>

        <HardAssets />

        <Sentiment
          sentimentData={sentimentData}
          breadthData={breadthData}
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
    </>
  );
}
