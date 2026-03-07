"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Skeleton } from "@/components/Skeleton";
import { PageHero } from "@/components/PageHero";
import { Spinner } from "@/components/ui/Spinner";
import {
  Search,
  Globe,
  FileText,
  FlaskConical,
  TrendingUp,
  Flame,
  HardHat,
  Factory,
  CreditCard,
  Activity,
  Landmark,
  ArrowRight,
  HelpCircle,
} from "lucide-react";
import { formatDate } from "@/lib/format-date";
import { HealthDot, labelToHealthLevel, type HealthLevel } from "@/components/HealthDot";
import { RangePopover } from "@/components/ui/RangePopover";

// Types
interface Position {
  symbol: string;
  quantity: number;
  marketValue: number;
  unrealizedPnl: number;
  unrealizedPnlPct: number;
  dayChangePct: number;
  marketValueBase?: number;
  unrealizedPnlBase?: number;
}

interface Summary {
  totalMarketValue: number;
  totalUnrealizedPnl: number;
  totalUnrealizedPnlPct: number;
  dayPnl: number;
  dayPnlPct: number;
}

interface MacroIndicator {
  id: string;
  name: string;
  category: string;
  data: { current: number } | null;
  interpretation: { label: string } | null;
  ranges?: {
    label: string;
    min: number | null;
    max: number | null;
    meaning: string;
    marketImpact: string;
  }[];
  unit?: string;
}

interface StockReport {
  id: number;
  ticker: string;
  title: string;
  companyName?: string;
  createdAt: string;
}

interface MarketEtf {
  ticker: string;
  name: string;
  data: {
    price: number;
    change: number;
    changePercent: number;
    rangePosition: number;
    fiftyTwoWeekLow: number;
    fiftyTwoWeekHigh: number;
  } | null;
  interpretation: { label: string; color: string } | null;
}

interface RegimeData {
  name: string;
  description: string;
  color: string;
  indicators: {
    realYield: number | null;
    debtToGdp: number | null;
    deficitToGdp: number | null;
    dxy: number | null;
  };
  implications: string[];
}

interface SentimentData {
  vix: {
    value: number | null;
    change: number | null;
    level: "low" | "moderate" | "elevated" | "fear" | null;
  };
  putCall: {
    value: number | null;
    level: "greedy" | "neutral" | "fearful" | null;
  };
}

interface BreadthData {
  advanceDecline: {
    ratio: number | null;
  };
  level: "bullish" | "neutral" | "bearish";
  interpretation: string;
}

interface CongressData {
  buyCount: number;
  sellCount: number;
  level: "bullish" | "neutral" | "bearish";
  totalTrades: number;
}

interface InsiderData {
  buyCount: number;
  sellCount: number;
  level: "bullish" | "neutral" | "bearish";
  totalTrades: number;
}

// ── Helpers ──────────────────────────────────────────

function getStatusColor(label: string): string {
  const colors: Record<string, string> = {
    "Target Zone": "bg-emerald-100 text-emerald-700",
    "At Target": "bg-emerald-100 text-emerald-700",
    Healthy: "bg-emerald-100 text-emerald-700",
    Normal: "bg-emerald-100 text-emerald-700",
    "Full Employment": "bg-emerald-100 text-emerald-700",
    Expansion: "bg-emerald-100 text-emerald-700",
    Accommodative: "bg-blue-100 text-blue-700",
    Neutral: "bg-gray-100 text-gray-700",
    Moderate: "bg-gray-100 text-gray-700",
    Low: "bg-blue-100 text-blue-700",
    "Above Target": "bg-amber-100 text-amber-700",
    Elevated: "bg-amber-100 text-amber-700",
    Softening: "bg-amber-100 text-amber-700",
    Restrictive: "bg-amber-100 text-amber-700",
    Inverted: "bg-amber-100 text-amber-700",
    Contraction: "bg-amber-100 text-amber-700",
    High: "bg-red-100 text-red-700",
    "Very Restrictive": "bg-red-100 text-red-700",
    "Deeply Inverted": "bg-red-100 text-red-700",
    Crisis: "bg-red-100 text-red-700",
  };
  return colors[label] || "bg-gray-100 text-gray-700";
}

function getStatusTileBg(label: string): string {
  const colors: Record<string, string> = {
    "Target Zone": "bg-emerald-50",
    "At Target": "bg-emerald-50",
    Healthy: "bg-emerald-50",
    Normal: "bg-emerald-50",
    "Full Employment": "bg-emerald-50",
    Expansion: "bg-emerald-50",
    Accommodative: "bg-blue-50",
    Neutral: "bg-gray-50",
    Moderate: "bg-gray-50",
    Low: "bg-blue-50",
    "Above Target": "bg-amber-50",
    Elevated: "bg-amber-50",
    Softening: "bg-amber-50",
    Restrictive: "bg-amber-50",
    Inverted: "bg-amber-50",
    Contraction: "bg-amber-50",
    High: "bg-red-50",
    "Very Restrictive": "bg-red-50",
    "Deeply Inverted": "bg-red-50",
    Crisis: "bg-red-50",
  };
  return colors[label] || "bg-gray-50";
}

function formatSentimentLevel(level: string | null | undefined): string {
  if (!level) return "—";
  return level.charAt(0).toUpperCase() + level.slice(1);
}

function formatIndicatorValue(indicator: MacroIndicator): string {
  if (!indicator.data) return "—";
  const val = indicator.data.current;
  // Initial claims already converted to thousands in fetch-macro-data.ts
  if (indicator.id === "initial-claims") return `${val.toFixed(0)}K`;
  if (indicator.id === "pmi-manufacturing") return val.toFixed(1);
  if (indicator.id === "hy-spread") return `${val.toFixed(0)}bp`;
  if (indicator.id === "yield-curve") return `${val.toFixed(0)}bp`;
  return `${val.toFixed(1)}%`;
}

// Helper to map ETF color to health level
function etfColorToHealthLevel(color: string | null | undefined): HealthLevel {
  if (!color) return "neutral";
  if (color === "green" || color === "blue") return "healthy";
  if (color === "amber") return "caution";
  if (color === "red") return "warning";
  return "neutral";
}

// Sentiment indicator ranges for Market Pulse popovers
const vixRanges = [
  { label: "Low", min: null, max: 15, meaning: "Complacency, low fear", marketImpact: "Bullish but watch for reversal" },
  { label: "Moderate", min: 15, max: 20, meaning: "Normal market conditions", marketImpact: "Healthy risk appetite" },
  { label: "Elevated", min: 20, max: 30, meaning: "Rising uncertainty", marketImpact: "Increased hedging activity" },
  { label: "Fear", min: 30, max: null, meaning: "Panic or crisis conditions", marketImpact: "Potential capitulation/buying opportunity" },
];

const putCallRanges = [
  { label: "Greedy", min: null, max: 0.7, meaning: "More calls than puts, bullish bets", marketImpact: "Contrarian bearish signal" },
  { label: "Neutral", min: 0.7, max: 1.0, meaning: "Balanced options activity", marketImpact: "No strong directional bias" },
  { label: "Fearful", min: 1.0, max: null, meaning: "More puts than calls, hedging", marketImpact: "Contrarian bullish signal" },
];

const breadthRanges = [
  { label: "Bearish", min: null, max: 0.7, meaning: "More declines than advances", marketImpact: "Broad-based selling pressure" },
  { label: "Neutral", min: 0.7, max: 1.3, meaning: "Balanced market participation", marketImpact: "No strong breadth signal" },
  { label: "Bullish", min: 1.3, max: null, meaning: "More advances than declines", marketImpact: "Broad-based buying, healthy rally" },
];

const realYieldRanges = [
  { label: "Deeply Negative", min: null, max: -1, meaning: "Severe financial repression, savers punished", marketImpact: "Gold & real assets outperform" },
  { label: "Negative", min: -1, max: 0, meaning: "Accommodative real rates, mild repression", marketImpact: "Risk assets favored, dollar weakens" },
  { label: "Low Positive", min: 0, max: 1, meaning: "Neutral real rate environment", marketImpact: "Balanced conditions for most assets" },
  { label: "Moderate", min: 1, max: 2, meaning: "Positive real returns on safe assets", marketImpact: "Cash & bonds competitive, growth headwinds" },
  { label: "Restrictive", min: 2, max: null, meaning: "Tight policy, high hurdle rate", marketImpact: "Headwind for equities & gold, bonds attractive" },
];

const debtToGdpRanges = [
  { label: "Low", min: null, max: 60, meaning: "Healthy fiscal position, room for spending", marketImpact: "Strong sovereign credit, low risk premium" },
  { label: "Moderate", min: 60, max: 90, meaning: "Manageable debt, some constraints", marketImpact: "Normal market conditions" },
  { label: "Elevated", min: 90, max: 120, meaning: "High debt burden, sustainability concerns", marketImpact: "Rising risk premium on treasuries" },
  { label: "Critical", min: 120, max: null, meaning: "Fiscal dominance zone, debt constrains policy", marketImpact: "Currency debasement risk, hard assets favored" },
];

const deficitToGdpRanges = [
  { label: "Surplus", min: null, max: 0, meaning: "Government running a budget surplus", marketImpact: "Fiscal tightening, lower bond supply" },
  { label: "Low", min: 0, max: 3, meaning: "Sustainable deficit level", marketImpact: "Manageable treasury issuance" },
  { label: "Elevated", min: 3, max: 6, meaning: "Above-normal deficit, expansionary fiscal", marketImpact: "Increased bond supply, rising yields" },
  { label: "High", min: 6, max: null, meaning: "Unsustainable deficit, funding pressure", marketImpact: "Bond vigilante risk, monetization pressure" },
];

// Regime detection logic
function detectRegime(realYield: number | null, debtToGdp: number | null): RegimeData {
  // Financial Repression: negative real rates + high debt
  if (realYield !== null && realYield < 0 && debtToGdp !== null && debtToGdp > 100) {
    return {
      name: "Financial Repression",
      description: "Negative real rates inflating away debt",
      color: "bg-amber-100 border-amber-300 text-amber-800",
      indicators: { realYield, debtToGdp, deficitToGdp: null, dxy: null },
      implications: ["Gold outperforms", "Bonds lose purchasing power", "Real assets favored"],
    };
  }
  
  // Fiscal Dominance: high debt + large deficits forcing easy money
  if (debtToGdp !== null && debtToGdp > 120) {
    return {
      name: "Fiscal Dominance",
      description: "Debt levels constraining monetary policy",
      color: "bg-red-100 border-red-300 text-red-800",
      indicators: { realYield, debtToGdp, deficitToGdp: null, dxy: null },
      implications: ["Currency debasement risk", "Hard assets critical", "Bond vigilantes watching"],
    };
  }
  
  // Monetary Tightening
  if (realYield !== null && realYield > 2) {
    return {
      name: "Restrictive Policy",
      description: "Real rates positive, liquidity tightening",
      color: "bg-blue-100 border-blue-300 text-blue-800",
      indicators: { realYield, debtToGdp, deficitToGdp: null, dxy: null },
      implications: ["Bonds may outperform", "Gold faces headwinds", "Cash competitive"],
    };
  }
  
  return {
    name: "Transitional",
    description: "Mixed signals, regime unclear",
    color: "bg-gray-100 border-gray-300 text-gray-700",
    indicators: { realYield, debtToGdp, deficitToGdp: null, dxy: null },
    implications: ["Diversification key", "Watch for regime signals"],
  };
}

const categoryOrder = ["rates", "inflation", "employment", "growth", "credit"];

const categoryLabels: Record<string, string> = {
  rates: "Rates",
  inflation: "Inflation",
  employment: "Employment",
  growth: "Growth",
  credit: "Credit",
};

const categoryIcons: Record<string, React.ReactNode> = {
  rates: <TrendingUp className="w-3 h-3" />,
  inflation: <Flame className="w-3 h-3" />,
  employment: <HardHat className="w-3 h-3" />,
  growth: <Factory className="w-3 h-3" />,
  credit: <CreditCard className="w-3 h-3" />,
};

// ── Dashboard Card ───────────────────────────────────

function DashboardCard({
  title,
  icon,
  children,
  href,
  loading,
  loadingSkeleton,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  href?: string;
  loading?: boolean;
  loadingSkeleton?: React.ReactNode;
}) {
  const defaultSkeleton = (
    <div className="space-y-3">
      <Skeleton className="h-6 w-3/4" />
      <Skeleton className="h-4 w-1/2" />
      <Skeleton className="h-4 w-2/3" />
    </div>
  );

  const content = (
    <div className="card p-5 h-full">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-2">
          <span className="flex items-center">{icon}</span>
          {title}
        </h2>
        {href && (
          <span className="text-xs text-gray-400 hover:text-gray-600">
            View all →
          </span>
        )}
      </div>
      {loading ? (loadingSkeleton || defaultSkeleton) : children}
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="block hover:opacity-90 transition-opacity">
        {content}
      </Link>
    );
  }

  return content;
}

// ── Quick Research Form ──────────────────────────────

function QuickResearchForm({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const [ticker, setTicker] = useState("");
  const [status, setStatus] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle");
  const [message, setMessage] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!ticker.trim()) return;

    setStatus("loading");
    setMessage("");

    try {
      const res = await fetch("/api/stocks/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker: ticker.toUpperCase().trim() }),
      });

      const data = await res.json();

      if (res.ok) {
        setStatus("success");
        setMessage(`Research queued for ${ticker.toUpperCase()}`);
        setTicker("");
        setTimeout(() => {
          router.push("/markets/research");
        }, 1000);
      } else {
        setStatus("error");
        setMessage(data.error || "Failed to queue research");
      }
    } catch {
      setStatus("error");
      setMessage("Network error. Please try again.");
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="flex gap-2">
        <input
          type="text"
          value={ticker}
          onChange={(e) => setTicker(e.target.value.toUpperCase())}
          placeholder={compact ? "Ticker" : "Enter ticker (e.g., AAPL)"}
          autoCapitalize="characters"
          autoComplete="off"
          className={`${compact ? "w-24" : "flex-1 min-w-0"} px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none`}
          disabled={status === "loading"}
        />
        <button
          type="submit"
          disabled={!ticker.trim() || status === "loading"}
          className="shrink-0 px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
        >
          {status === "loading" && <Spinner size="sm" className="text-white" />}
          {status === "loading" ? "..." : <FlaskConical className="w-4 h-4" />}
        </button>
      </div>
      {message && !compact && (
        <div
          className={`text-xs mt-2 p-2 rounded ${
            status === "success"
              ? "bg-emerald-50 text-emerald-700"
              : "bg-red-50 text-red-700"
          }`}
        >
          {message}
        </div>
      )}
    </form>
  );
}

// ── Macro Indicator Tile ─────────────────────────────

function IndicatorTile({ indicator }: { indicator: MacroIndicator }) {
  const label = indicator.interpretation?.label;
  const tileBg = label ? getStatusTileBg(label) : "bg-gray-50";
  const healthLevel = labelToHealthLevel(label);

  return (
    <div
      className={`rounded-xl p-3 ${tileBg} border border-white/60 transition-transform hover:scale-[1.02]`}
      title={label || undefined}
    >
      <div className="flex items-center gap-1 mb-1.5">
        <span className="flex items-center text-gray-400">
          {categoryIcons[indicator.category]}
        </span>
        <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">
          {categoryLabels[indicator.category] || indicator.category}
        </span>
      </div>
      <div className="text-xs text-gray-600 mb-1 leading-tight">
        {indicator.name.replace(" (YoY)", "").replace(" Rate", "")}
      </div>
      <div className="flex items-baseline justify-between gap-2 overflow-hidden min-w-0">
        <span className="text-lg font-bold text-gray-900 truncate">
          {formatIndicatorValue(indicator)}
        </span>
        {label && indicator.ranges ? (
          <RangePopover ranges={indicator.ranges} currentLabel={label} unit={indicator.unit}>
            <HealthDot level={healthLevel} size="md" />
          </RangePopover>
        ) : label ? (
          <HealthDot level={healthLevel} size="md" />
        ) : null}
      </div>
    </div>
  );
}

// ── Main Dashboard ───────────────────────────────────

export default function StocksDashboard() {
  // State
  const [portfolioData, setPortfolioData] = useState<{
    positions: Position[];
    summary: Summary | null;
    baseCurrency: string;
  } | null>(null);
  const [macroIndicators, setMacroIndicators] = useState<MacroIndicator[]>([]);
  const [recentReports, setRecentReports] = useState<StockReport[]>([]);
  const [sentimentData, setSentimentData] = useState<SentimentData | null>(
    null,
  );
  const [marketEtfs, setMarketEtfs] = useState<MarketEtf[]>([]);
  const [regimeData, setRegimeData] = useState<RegimeData | null>(null);
  const [breadthData, setBreadthData] = useState<BreadthData | null>(null);
  const [congressData, setCongressData] = useState<CongressData | null>(null);
  const [insiderData, setInsiderData] = useState<InsiderData | null>(null);
  const [loading, setLoading] = useState({
    portfolio: true,
    macro: true,
    reports: true,
    sentiment: true,
    etfs: true,
    regime: true,
    breadth: true,
    congress: true,
    insider: true,
  });

  // Fetch all data on mount
  useEffect(() => {
    // Fetch portfolio
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

    // Fetch macro indicators
    fetch("/api/macro")
      .then((res) => res.json())
      .then((data) => {
        setMacroIndicators(data.indicators || []);
      })
      .catch(console.error)
      .finally(() => setLoading((prev) => ({ ...prev, macro: false })));

    // Fetch recent reports
    fetch("/api/markets/reports")
      .then((res) => res.json())
      .then((data) => {
        setRecentReports((data.reports || []).slice(0, 5));
      })
      .catch(console.error)
      .finally(() => setLoading((prev) => ({ ...prev, reports: false })));

    // Fetch market ETFs (TLT etc)
    fetch("/api/macro/etfs")
      .then((res) => res.json())
      .then((data) => {
        setMarketEtfs(data.etfs || []);
      })
      .catch(console.error)
      .finally(() => setLoading((prev) => ({ ...prev, etfs: false })));

    // Fetch sentiment data
    fetch("/api/markets/sentiment")
      .then((res) => res.json())
      .then((data) => {
        setSentimentData({
          vix: data.vix || { value: null, change: null, level: null },
          putCall: data.putCall || { value: null, level: null },
        });
      })
      .catch(console.error)
      .finally(() => setLoading((prev) => ({ ...prev, sentiment: false })));

    // Fetch breadth data
    fetch("/api/markets/breadth")
      .then((res) => res.json())
      .then((data) => {
        setBreadthData(data);
      })
      .catch(console.error)
      .finally(() => setLoading((prev) => ({ ...prev, breadth: false })));

    // Fetch congress data
    fetch("/api/markets/congress")
      .then((res) => res.json())
      .then((data) => {
        setCongressData(data);
      })
      .catch(console.error)
      .finally(() => setLoading((prev) => ({ ...prev, congress: false })));

    // Fetch insider data
    fetch("/api/markets/insider")
      .then((res) => res.json())
      .then((data) => {
        setInsiderData(data);
      })
      .catch(console.error)
      .finally(() => setLoading((prev) => ({ ...prev, insider: false })));

    // Fetch regime data (from macro + gold endpoints)
    Promise.all([
      fetch("/api/macro").then(res => res.ok ? res.json() : null),
      fetch("/api/gold").then(res => res.ok ? res.json() : null),
    ])
      .then(([macroData, goldData]: [
        { indicators?: { id: string; data?: { current: number } }[] } | null,
        { realYields?: { value: number }; dxy?: { price: number } } | null
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
        
        const regime = detectRegime(realYield, debtToGdp);
        regime.indicators = { realYield, debtToGdp, deficitToGdp: deficitToGdp ? Math.abs(deficitToGdp) : null, dxy };
        setRegimeData(regime);
      })
      .catch(console.error)
      .finally(() => setLoading((prev) => ({ ...prev, regime: false })));
  }, []);

  // Group and flatten macro indicators
  const macroByCategory = macroIndicators.reduce(
    (acc, ind) => {
      if (!acc[ind.category]) acc[ind.category] = [];
      acc[ind.category].push(ind);
      return acc;
    },
    {} as Record<string, MacroIndicator[]>,
  );

  const allIndicators: MacroIndicator[] = [];
  categoryOrder.forEach((cat) => {
    if (macroByCategory[cat]) allIndicators.push(...macroByCategory[cat]);
  });

  return (
    <>
      <PageHero
        title="Markets Dashboard"
        subtitle="Portfolio overview, research, and market signals"
      />

      {/* Grid Layout - items-start for natural heights */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
        {/* Macro Signals */}

        <DashboardCard
          title="Macro Signals"
          icon={<Globe className="w-4 h-4" />}
          href="/markets/macro"
        >
          <div className="space-y-4">
            {/* Regime + Market Pulse (merged) */}
            {loading.sentiment ? (
              <Skeleton className="h-14 rounded-xl" />
            ) : (
              <div className="rounded-xl bg-gray-900 p-3 sm:p-4 space-y-3">
                {/* Regime strip */}
                {!loading.regime && regimeData && (
                  <Link
                    href="/markets/regime"
                    className="flex items-center justify-between gap-3 pb-3 border-b border-gray-700/50"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div className={`p-1 rounded-md ${
                        regimeData.name === "Fiscal Dominance" ? "bg-red-500/20" :
                        regimeData.name === "Financial Repression" ? "bg-amber-500/20" :
                        regimeData.name === "Restrictive Policy" ? "bg-blue-500/20" :
                        "bg-gray-500/20"
                      }`}>
                        <Landmark className={`w-3.5 h-3.5 ${
                          regimeData.name === "Fiscal Dominance" ? "text-red-400" :
                          regimeData.name === "Financial Repression" ? "text-amber-400" :
                          regimeData.name === "Restrictive Policy" ? "text-blue-400" :
                          "text-gray-400"
                        }`} />
                      </div>
                      <div>
                        <span className={`text-sm font-bold ${
                          regimeData.name === "Fiscal Dominance" ? "text-red-400" :
                          regimeData.name === "Financial Repression" ? "text-amber-400" :
                          regimeData.name === "Restrictive Policy" ? "text-blue-400" :
                          "text-gray-300"
                        }`}>
                          {regimeData.name}
                        </span>
                        <p className="text-[10px] text-gray-500 leading-tight">{regimeData.description}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 text-[10px] text-gray-400 shrink-0">
                      {regimeData.indicators.realYield !== null && (
                        <RangePopover ranges={realYieldRanges} currentLabel={
                          regimeData.indicators.realYield < -1 ? "Deeply Negative" :
                          regimeData.indicators.realYield < 0 ? "Negative" :
                          regimeData.indicators.realYield < 1 ? "Low Positive" :
                          regimeData.indicators.realYield < 2 ? "Moderate" : "Restrictive"
                        } unit="%">
                          <div className="text-center cursor-pointer hover:opacity-80 transition-opacity">
                            <span className="opacity-60">RY </span>
                            <span className="font-bold text-gray-300">{regimeData.indicators.realYield.toFixed(2)}%</span>
                            <HelpCircle className="w-2.5 h-2.5 text-gray-600 hover:text-gray-400 inline-block ml-0.5 -mt-0.5 transition-colors" />
                          </div>
                        </RangePopover>
                      )}
                      <span className="hidden sm:contents">
                        {regimeData.indicators.debtToGdp !== null && (
                          <RangePopover ranges={debtToGdpRanges} currentLabel={
                            regimeData.indicators.debtToGdp < 60 ? "Low" :
                            regimeData.indicators.debtToGdp < 90 ? "Moderate" :
                            regimeData.indicators.debtToGdp < 120 ? "Elevated" : "Critical"
                          } unit="%">
                            <div className="text-center cursor-pointer hover:opacity-80 transition-opacity">
                              <span className="opacity-60">D/G </span>
                              <span className="font-bold text-gray-300">{regimeData.indicators.debtToGdp.toFixed(0)}%</span>
                              <HelpCircle className="w-2.5 h-2.5 text-gray-600 hover:text-gray-400 inline-block ml-0.5 -mt-0.5 transition-colors" />
                            </div>
                          </RangePopover>
                        )}
                        {regimeData.indicators.deficitToGdp !== null && (
                          <RangePopover ranges={deficitToGdpRanges} currentLabel={
                            regimeData.indicators.deficitToGdp < 0 ? "Surplus" :
                            regimeData.indicators.deficitToGdp < 3 ? "Low" :
                            regimeData.indicators.deficitToGdp < 6 ? "Elevated" : "High"
                          } unit="%">
                            <div className="text-center cursor-pointer hover:opacity-80 transition-opacity">
                              <span className="opacity-60">Def </span>
                              <span className="font-bold text-gray-300">{regimeData.indicators.deficitToGdp.toFixed(1)}%</span>
                              <HelpCircle className="w-2.5 h-2.5 text-gray-600 hover:text-gray-400 inline-block ml-0.5 -mt-0.5 transition-colors" />
                            </div>
                          </RangePopover>
                        )}
                      </span>
                      <ArrowRight className="w-3.5 h-3.5 opacity-40" />
                    </div>
                  </Link>
                )}
                {/* Market Pulse: VIX / P/C / A/D */}
                <div>
                  <div className="flex items-center gap-2 text-gray-400 mb-2">
                    <Activity className="w-3.5 h-3.5" />
                    <span className="text-[10px] font-medium uppercase tracking-wider">
                      Market Pulse
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-3 sm:gap-6">
                    {/* VIX */}
                    <div>
                      <div className="text-xs text-gray-500 mb-1 flex items-center gap-1">
                        VIX
                        <RangePopover ranges={vixRanges} currentLabel={formatSentimentLevel(sentimentData?.vix.level)}>
                          <HelpCircle className="w-3 h-3 text-gray-500 hover:text-gray-300 transition-colors" />
                        </RangePopover>
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span
                          className={`text-base sm:text-lg font-bold ${
                            sentimentData?.vix.level === "low" ||
                            sentimentData?.vix.level === "moderate"
                              ? "text-emerald-400"
                              : sentimentData?.vix.level === "elevated"
                                ? "text-amber-400"
                                : sentimentData?.vix.level === "fear"
                                  ? "text-red-400"
                                  : "text-gray-400"
                          }`}
                        >
                          {sentimentData?.vix.value?.toFixed(1) ?? "—"}
                        </span>
                        <span
                          className={`text-xs ${sentimentData?.vix?.change != null && sentimentData.vix.change >= 0 ? "text-red-400" : "text-emerald-400"}`}
                        >
                          {sentimentData?.vix?.change != null && (
                            <>
                              {sentimentData.vix.change >= 0 ? "▲" : "▼"}
                              {Math.abs(sentimentData.vix.change).toFixed(1)}
                            </>
                          )}
                        </span>
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                            sentimentData?.vix.level === "low" ||
                            sentimentData?.vix.level === "moderate"
                              ? "bg-emerald-900/50 text-emerald-300"
                              : sentimentData?.vix.level === "elevated"
                                ? "bg-amber-900/50 text-amber-300"
                                : sentimentData?.vix.level === "fear"
                                  ? "bg-red-900/50 text-red-300"
                                  : "bg-gray-700 text-gray-400"
                          }`}
                        >
                          {formatSentimentLevel(sentimentData?.vix.level)}
                        </span>
                      </div>
                    </div>

                    {/* Put/Call */}
                    <div>
                      <div className="text-xs text-gray-500 mb-1 flex items-center gap-1">
                        P/C
                        <RangePopover ranges={putCallRanges} currentLabel={formatSentimentLevel(sentimentData?.putCall.level)}>
                          <HelpCircle className="w-3 h-3 text-gray-500 hover:text-gray-300 transition-colors" />
                        </RangePopover>
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span
                          className={`text-base sm:text-lg font-bold ${
                            sentimentData?.putCall.level === "greedy"
                              ? "text-amber-400"
                              : sentimentData?.putCall.level === "neutral"
                                ? "text-emerald-400"
                                : sentimentData?.putCall.level === "fearful"
                                  ? "text-red-400"
                                  : "text-gray-400"
                          }`}
                        >
                          {sentimentData?.putCall.value?.toFixed(2) ?? "—"}
                        </span>
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                            sentimentData?.putCall.level === "greedy"
                              ? "bg-amber-900/50 text-amber-300"
                              : sentimentData?.putCall.level === "neutral"
                                ? "bg-emerald-900/50 text-emerald-300"
                                : sentimentData?.putCall.level === "fearful"
                                  ? "bg-red-900/50 text-red-300"
                                  : "bg-gray-700 text-gray-400"
                          }`}
                        >
                          {formatSentimentLevel(sentimentData?.putCall.level)}
                        </span>
                      </div>
                    </div>

                    {/* Breadth */}
                    <div>
                      <div className="text-xs text-gray-500 mb-1 flex items-center gap-1">
                        A/D
                        <RangePopover ranges={breadthRanges} currentLabel={breadthData?.level ? breadthData.level.charAt(0).toUpperCase() + breadthData.level.slice(1) : null}>
                          <HelpCircle className="w-3 h-3 text-gray-500 hover:text-gray-300 transition-colors" />
                        </RangePopover>
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span
                          className={`text-base sm:text-lg font-bold ${
                            breadthData?.level === "bullish"
                              ? "text-emerald-400"
                              : breadthData?.level === "bearish"
                                ? "text-red-400"
                                : "text-gray-400"
                          }`}
                        >
                          {breadthData?.advanceDecline?.ratio?.toFixed(2) ?? "—"}
                        </span>
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                            breadthData?.level === "bullish"
                              ? "bg-emerald-900/50 text-emerald-300"
                              : breadthData?.level === "bearish"
                                ? "bg-red-900/50 text-red-300"
                                : "bg-gray-700 text-gray-400"
                          }`}
                        >
                          {breadthData?.level ? breadthData.level.charAt(0).toUpperCase() + breadthData.level.slice(1) : "—"}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* All Indicator Tiles */}
            {loading.macro ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                  <Skeleton key={i} className="h-24 rounded-xl" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {/* Smart Money tiles */}
                {congressData && congressData.totalTrades > 0 && (
                  <div
                    className={`rounded-xl p-3 border border-white/60 transition-transform hover:scale-[1.02] ${
                      congressData.level === "bullish"
                        ? "bg-emerald-50"
                        : congressData.level === "bearish"
                          ? "bg-red-50"
                          : "bg-gray-50"
                    }`}
                  >
                    <div className="flex items-center gap-1 mb-1.5">
                      <span className="flex items-center text-gray-400">
                        <Landmark className="w-3 h-3" />
                      </span>
                      <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">Smart Money</span>
                    </div>
                    <div className="text-xs text-gray-600 mb-1 leading-tight">
                      Congress ({congressData.buyCount}B/{congressData.sellCount}S)
                    </div>
                    <div className="flex items-baseline justify-between gap-2 overflow-hidden min-w-0">
                      <span className="text-lg font-bold text-gray-900 truncate">
                        {congressData.level.charAt(0).toUpperCase() + congressData.level.slice(1)}
                      </span>
                      <HealthDot level={congressData.level === "bullish" ? "healthy" : congressData.level === "bearish" ? "warning" : "neutral"} size="md" />
                    </div>
                  </div>
                )}
                {insiderData && insiderData.totalTrades > 0 && (
                  <div
                    className={`rounded-xl p-3 border border-white/60 transition-transform hover:scale-[1.02] ${
                      insiderData.level === "bullish"
                        ? "bg-emerald-50"
                        : insiderData.level === "bearish"
                          ? "bg-red-50"
                          : "bg-gray-50"
                    }`}
                  >
                    <div className="flex items-center gap-1 mb-1.5">
                      <span className="flex items-center text-gray-400">
                        <Landmark className="w-3 h-3" />
                      </span>
                      <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">Smart Money</span>
                    </div>
                    <div className="text-xs text-gray-600 mb-1 leading-tight">
                      Insiders ({insiderData.buyCount}B/{insiderData.sellCount}S)
                    </div>
                    <div className="flex items-baseline justify-between gap-2 overflow-hidden min-w-0">
                      <span className="text-lg font-bold text-gray-900 truncate">
                        {insiderData.level.charAt(0).toUpperCase() + insiderData.level.slice(1)}
                      </span>
                      <HealthDot level={insiderData.level === "bullish" ? "healthy" : insiderData.level === "bearish" ? "warning" : "neutral"} size="md" />
                    </div>
                  </div>
                )}

                {/* Macro indicator tiles */}
                {allIndicators.map((indicator) => (
                  <IndicatorTile key={indicator.id} indicator={indicator} />
                ))}

                {/* Barometer tiles */}
                {!loading.etfs && marketEtfs.map((etf) => {
                  const etfBg =
                    etf.interpretation?.color === "blue"
                      ? "bg-blue-50"
                      : etf.interpretation?.color === "amber"
                        ? "bg-amber-50"
                        : etf.interpretation?.color === "red"
                          ? "bg-red-50"
                          : "bg-gray-50";
                  const label = etf.interpretation?.label;
                  const healthLevel = etfColorToHealthLevel(etf.interpretation?.color);
                  return (
                    <div
                      key={etf.ticker}
                      className={`rounded-xl p-3 ${etfBg} border border-white/60 transition-transform hover:scale-[1.02]`}
                      title={label || undefined}
                    >
                      <div className="flex items-center gap-1 mb-1.5">
                        <span className="flex items-center text-gray-400">
                          <Activity className="w-3 h-3" />
                        </span>
                        <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">Barometer</span>
                      </div>
                      <div className="text-xs text-gray-600 mb-1 leading-tight">
                        {etf.ticker}
                      </div>
                      <div className="flex items-baseline justify-between gap-2 overflow-hidden min-w-0">
                        {etf.data ? (
                          <span className="text-lg font-bold text-gray-900 truncate">
                            ${etf.data.price.toFixed(2)}
                          </span>
                        ) : (
                          <span className="text-lg font-bold text-gray-400">—</span>
                        )}
                        {label && <HealthDot level={healthLevel} size="md" />}
                      </div>
                      {etf.data && (
                        <div className={`text-xs font-medium ${etf.data.change >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                          {etf.data.changePercent >= 0 ? "+" : ""}{etf.data.changePercent.toFixed(1)}%
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </DashboardCard>

        {/* Recent Research */}
        <DashboardCard
          title="Recent Research"
          icon={<FileText className="w-4 h-4" />}
          href="/markets/research"
          loading={loading.reports}
          loadingSkeleton={
            <>
              {/* Quick Research Form - always visible */}
              <div className="mb-4 pb-4 border-b border-gray-100">
                <QuickResearchForm />
              </div>
              {/* Skeleton report items */}
              <div className="space-y-3">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="py-1.5">
                    <div className="flex items-center gap-2 mb-1">
                      <Skeleton className="h-4 w-16" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                    <Skeleton className="h-3 w-14" />
                  </div>
                ))}
              </div>
            </>
          }
        >
          {/* Quick Research Form */}
          <div className="mb-4 pb-4 border-b border-gray-100">
            <QuickResearchForm />
          </div>
          
          {recentReports.length > 0 ? (
            <div className="space-y-2">
              {recentReports.map((report) => (
                <div
                  key={report.id}
                  className="block py-1.5 -mx-2 px-2 rounded"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{report.ticker}</span>
                    {report.companyName && (
                      <span className="text-xs text-gray-500 truncate md:whitespace-normal md:overflow-visible">
                        {report.companyName}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-gray-400">
                    {formatDate(report.createdAt, { style: "date-only" })}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-gray-500">
              <p>No research reports yet.</p>
              <p className="text-xs text-gray-400 mt-1">
                Enter a ticker above to start
              </p>
            </div>
          )}
        </DashboardCard>
      </div>
    </>
  );
}
