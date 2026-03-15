"use client";

import { useState, useEffect } from "react";
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
import { ExpectedReturnsCard } from "./_components/ExpectedReturnsCard";
import { CorrelationMatrix } from "./_components/CorrelationMatrix";
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
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [regimeDetailOpen, setRegimeDetailOpen] = useState(false);
  const [loading, setLoading] = useState({
    portfolio: true,
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

        <div className="space-y-4">
          <ExpectedReturnsCard />
          <CorrelationMatrix />
        </div>

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
