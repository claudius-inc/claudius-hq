"use client";

import { useState, useCallback } from "react";
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
  YieldSpread,
} from "./_components/types";

export interface MarketsPageContentProps {
  initialPortfolioData: {
    positions: Position[];
    summary: Summary | null;
    baseCurrency: string;
  } | null;
  initialMacroIndicators: MacroIndicator[];
  initialYieldSpreads: YieldSpread[];
  initialMarketEtfs: MarketEtf[];
  initialSentimentData: SentimentData | null;
  initialBreadthData: BreadthData | null;
  initialCongressData: CongressData | null;
  initialInsiderData: InsiderData | null;
  initialRegimeData: RegimeData | null;
}

export default function MarketsPageContent({
  initialPortfolioData,
  initialMacroIndicators,
  initialYieldSpreads,
  initialMarketEtfs,
  initialSentimentData,
  initialBreadthData,
  initialCongressData,
  initialInsiderData,
  initialRegimeData,
}: MarketsPageContentProps) {
  const [portfolioData, setPortfolioData] = useState<{
    positions: Position[];
    summary: Summary | null;
    baseCurrency: string;
  } | null>(initialPortfolioData);
  const [macroIndicators, setMacroIndicators] = useState<MacroIndicator[]>(initialMacroIndicators);
  const [sentimentData, setSentimentData] = useState<SentimentData | null>(initialSentimentData);
  const [marketEtfs, setMarketEtfs] = useState<MarketEtf[]>(initialMarketEtfs);
  const [regimeData, setRegimeData] = useState<RegimeData | null>(initialRegimeData);
  const [breadthData, setBreadthData] = useState<BreadthData | null>(initialBreadthData);
  const [congressData, setCongressData] = useState<CongressData | null>(initialCongressData);
  const [insiderData, setInsiderData] = useState<InsiderData | null>(initialInsiderData);
  const [yieldSpreads, setYieldSpreads] = useState<YieldSpread[]>(initialYieldSpreads);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [regimeDetailOpen, setRegimeDetailOpen] = useState(false);

  // Determine loading state based on whether we have initial data
  const hasInitialData = initialMacroIndicators.length > 0 || initialMarketEtfs.length > 0;
  const [loading, setLoading] = useState({
    portfolio: !initialPortfolioData,
    macro: !hasInitialData,
    sentiment: !initialSentimentData,
    etfs: !hasInitialData,
    regime: !initialRegimeData,
    breadth: !initialBreadthData,
    congress: !initialCongressData,
    insider: !initialInsiderData,
  });

  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Manual refresh function for client-side updates
  const refreshData = useCallback(async () => {
    setLoading({
      portfolio: true,
      macro: true,
      sentiment: true,
      etfs: true,
      regime: true,
      breadth: true,
      congress: true,
      insider: true,
    });

    try {
      const [
        portfolioRes,
        macroRes,
        etfsRes,
        sentimentRes,
        breadthRes,
        congressRes,
        insiderRes,
        goldRes,
      ] = await Promise.all([
        fetch("/api/ibkr/positions"),
        fetch("/api/macro"),
        fetch("/api/macro/etfs"),
        fetch("/api/markets/sentiment"),
        fetch("/api/markets/breadth"),
        fetch("/api/markets/congress"),
        fetch("/api/markets/insider"),
        fetch("/api/gold"),
      ]);

      const [
        portfolioJson,
        macroJson,
        etfsJson,
        sentimentJson,
        breadthJson,
        congressJson,
        insiderJson,
        goldJson,
      ] = await Promise.all([
        portfolioRes.json(),
        macroRes.json(),
        etfsRes.json(),
        sentimentRes.json(),
        breadthRes.json(),
        congressRes.json(),
        insiderRes.json(),
        goldRes.json(),
      ]);

      setPortfolioData({
        positions: portfolioJson.positions || [],
        summary: portfolioJson.summary || null,
        baseCurrency: portfolioJson.baseCurrency || "SGD",
      });

      setMacroIndicators(macroJson.indicators || []);
      setYieldSpreads(macroJson.yieldSpreads || []);
      setMarketEtfs(etfsJson.etfs || []);
      setSentimentData(sentimentJson);
      setBreadthData(breadthJson);
      setCongressData(congressJson);
      setInsiderData(insiderJson);

      // Calculate regime
      const indicators = macroJson.indicators || [];
      const findIndicator = (id: string) => {
        const ind = indicators.find((i: MacroIndicator) => i.id === id);
        return ind?.data?.current ?? null;
      };

      const realYield = goldJson?.realYields?.value ?? null;
      const debtToGdp = findIndicator("debt-to-gdp");
      const deficitToGdp = findIndicator("deficit-to-gdp");
      const dxy = goldJson?.dxy?.price ?? null;

      const absDeficit = deficitToGdp ? Math.abs(deficitToGdp) : null;
      const regime = detectRegime({ realYield, debtToGdp, deficitToGdp: absDeficit });
      regime.indicators.dxy = dxy;
      setRegimeData(regime);
    } catch (e) {
      console.error("Failed to refresh data:", e);
    } finally {
      setLoading({
        portfolio: false,
        macro: false,
        sentiment: false,
        etfs: false,
        regime: false,
        breadth: false,
        congress: false,
        insider: false,
      });
    }
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
          onOpenDetail={() => setRegimeDetailOpen(true)}
        />

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

      <RegimeDetail
        open={regimeDetailOpen}
        onClose={() => setRegimeDetailOpen(false)}
        regimeData={regimeData}
        macroIndicators={macroIndicators}
      />
    </>
  );
}
