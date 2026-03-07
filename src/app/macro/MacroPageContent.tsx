"use client";

import { useState, useEffect, useCallback } from "react";
import { MACRO_INDICATORS } from "@/lib/macro-indicators";
import { formatDate, formatTimestamp } from "@/lib/format-date";
import { PageHero } from "@/components/PageHero";
import ReactMarkdown from "react-markdown";
import {
  TrendingUp,
  Flame,
  HardHat,
  Factory,
  Drama,
  CreditCard,
  ArrowLeftRight,
  Globe,
  BarChart3,
  Activity,
  Users,
  Briefcase,
  Gauge,
  RefreshCw,
  Landmark,
  Scale,
  AlertTriangle,
  Shield,
} from "lucide-react";
import { formatCacheAge } from "@/lib/market-cache";

// ============================================================================
// Types
// ============================================================================

interface MacroIndicator {
  id: string;
  name: string;
  category: string;
  unit: string;
  description: string;
  whyItMatters: string;
  ranges: Array<{ label: string; min: number | null; max: number | null; meaning: string; marketImpact: string }>;
  keyLevels?: Array<{ level: number; significance: string }>;
  affectedAssets: string[];
  data: { current: number; min: number; max: number; avg: number } | null;
  interpretation: { label: string; meaning: string; marketImpact: string } | null;
  percentile: number | null;
}

interface MarketEtf {
  ticker: string;
  name: string;
  description: string;
  whyItMatters: string;
  ranges: Array<{ label: string; min: number | null; max: number | null; meaning: string; color: string }>;
  affectedAssets: string[];
  data: {
    price: number;
    change: number;
    changePercent: number;
    previousClose: number;
    fiftyTwoWeekLow: number;
    fiftyTwoWeekHigh: number;
    fiftyDayAvg: number;
    twoHundredDayAvg: number;
    rangePosition: number;
  } | null;
  interpretation: { label: string; meaning: string; color: string } | null;
}

interface InsightsData {
  insights: string | null;
  generatedAt: string | null;
  indicatorSnapshot: unknown;
}

interface YieldSpread {
  name: string;
  value: number | null;
  interpretation: string;
  color: "green" | "amber" | "gray";
}

interface BreadthData {
  advanceDecline: {
    advances: number | null;
    declines: number | null;
    unchanged: number | null;
    ratio: number | null;
    netAdvances: number | null;
  };
  newHighsLows: {
    newHighs: number | null;
    newLows: number | null;
    ratio: number | null;
    netHighs: number | null;
  };
  level: "bullish" | "neutral" | "bearish";
  interpretation: string;
  mcclellan?: { oscillator: number | null; signal: string | null };
}

interface SentimentData {
  vix: {
    value: number | null;
    change: number | null;
    changePercent: number | null;
    level: "low" | "moderate" | "elevated" | "fear" | null;
  };
  putCall: {
    value: number | null;
    level: "greedy" | "neutral" | "fearful" | null;
    source: string;
  };
  volatilityContext?: {
    termStructure: number;
    contango: string;
    interpretation: string;
  } | null;
}

interface CongressData {
  buyCount: number;
  sellCount: number;
  ratio: number;
  level: "bullish" | "neutral" | "bearish";
  totalTrades: number;
  topTickers: Array<{ ticker: string; count: number }>;
  recentTrades: Array<{
    date: string;
    member: string;
    party: string;
    state: string;
    chamber: string;
    ticker: string;
    type: string;
    amount: string;
  }>;
}

interface InsiderData {
  buyCount: number;
  sellCount: number;
  buyValue: number;
  sellValue: number;
  ratio: number;
  valueRatio: number;
  level: "bullish" | "neutral" | "bearish";
  totalTrades: number;
  clusterBuys: Array<{ ticker: string; buys: number; buyValue: number }>;
  recentTrades: Array<{
    date: string;
    company: string;
    ticker: string;
    insider: string;
    title: string;
    type: string;
    shares: number;
    price: number;
    value: number;
  }>;
}

interface RegimeIndicators {
  realYield: number | null;
  nominalGrowth: number | null;
  debtToGdp: number | null;
  deficitToGdp: number | null;
  m2Growth: number | null;
  dxy: number | null;
}

// ============================================================================
// Utility Functions
// ============================================================================

function getStatusColor(label: string): string {
  const colors: Record<string, string> = {
    "Target Zone": "bg-emerald-100 text-emerald-700",
    "At Target": "bg-emerald-100 text-emerald-700",
    "Healthy": "bg-emerald-100 text-emerald-700",
    "Normal": "bg-emerald-100 text-emerald-700",
    "Full Employment": "bg-emerald-100 text-emerald-700",
    "Expansion": "bg-emerald-100 text-emerald-700",
    "Balanced": "bg-emerald-100 text-emerald-700",
    "Accommodative": "bg-blue-100 text-blue-700",
    "Neutral": "bg-gray-100 text-gray-700",
    "Moderate": "bg-gray-100 text-gray-700",
    "Low": "bg-blue-100 text-blue-700",
    "Flat": "bg-amber-100 text-amber-700",
    "Above Target": "bg-amber-100 text-amber-700",
    "Elevated": "bg-amber-100 text-amber-700",
    "Softening": "bg-amber-100 text-amber-700",
    "Restrictive": "bg-amber-100 text-amber-700",
    "Inverted": "bg-amber-100 text-amber-700",
    "Contraction": "bg-amber-100 text-amber-700",
    "Concerning": "bg-amber-100 text-amber-700",
    "High": "bg-red-100 text-red-700",
    "Very Restrictive": "bg-red-100 text-red-700",
    "Deeply Inverted": "bg-red-100 text-red-700",
    "Deep Contraction": "bg-red-100 text-red-700",
    "Crisis": "bg-red-100 text-red-700",
    "Recession": "bg-red-100 text-red-700",
    "Stressed": "bg-red-100 text-red-700",
    "Crisis/ZIRP": "bg-purple-100 text-purple-700",
    "Deflation Risk": "bg-purple-100 text-purple-700",
    "Below Target": "bg-blue-100 text-blue-700",
    "Extremely Low": "bg-blue-100 text-blue-700",
    "Very Low": "bg-blue-100 text-blue-700",
    "Very Tight": "bg-amber-100 text-amber-700",
    "Yen Strength": "bg-blue-100 text-blue-700",
    "Yen Weakness": "bg-amber-100 text-amber-700",
    "Extreme Weakness": "bg-red-100 text-red-700",
    "Dollar Strength": "bg-amber-100 text-amber-700",
    "Euro Strength": "bg-blue-100 text-blue-700",
    "Extreme Euro Strength": "bg-amber-100 text-amber-700",
    "Weak Dollar": "bg-emerald-100 text-emerald-700",
    "Strong Dollar": "bg-amber-100 text-amber-700",
    "Very Strong Dollar": "bg-red-100 text-red-700",
    "YCC Zone": "bg-blue-100 text-blue-700",
    "Transition": "bg-amber-100 text-amber-700",
    "Normalization": "bg-amber-100 text-amber-700",
    "Negative/ZIRP": "bg-purple-100 text-purple-700",
  };
  return colors[label] || "bg-gray-100 text-gray-700";
}

function getTrendArrow(current: number, avg: number): { arrow: string; color: string } {
  const pctChange = ((current - avg) / avg) * 100;
  if (pctChange > 2) return { arrow: "↑", color: "text-emerald-600" };
  if (pctChange < -2) return { arrow: "↓", color: "text-red-600" };
  return { arrow: "→", color: "text-gray-500" };
}

function getDxyInterpretation(value: number): { label: string; description: string; color: string } {
  if (value > 105) {
    return { label: "Strong Dollar", description: "Headwind for EM & commodities", color: "text-amber-600" };
  }
  if (value >= 100) {
    return { label: "Neutral", description: "Balanced conditions", color: "text-gray-600" };
  }
  return { label: "Weak Dollar", description: "Tailwind for EM & commodities", color: "text-emerald-600" };
}

function determineRegime(data: RegimeIndicators): {
  name: string;
  description: string;
  color: string;
  implications: string[];
} {
  const { realYield, debtToGdp, deficitToGdp } = data;
  
  if (realYield !== null && realYield < -1 && debtToGdp !== null && debtToGdp > 100) {
    return {
      name: "Financial Repression",
      description: "Real yields negative, debt being inflated away",
      color: "text-red-600 bg-red-50 border-red-200",
      implications: [
        "Long bonds are wealth destroyers",
        "Gold and hard assets outperform",
        "Cash loses purchasing power",
        "Equities may keep pace with inflation",
      ],
    };
  }
  
  if (deficitToGdp !== null && deficitToGdp > 5 && debtToGdp !== null && debtToGdp > 100) {
    return {
      name: "Fiscal Dominance",
      description: "Government spending dominates monetary policy",
      color: "text-amber-600 bg-amber-50 border-amber-200",
      implications: [
        "Fed constrained by Treasury needs",
        "Rates can't rise too much",
        "Inflation likely to persist",
        "Dollar weakness probable",
      ],
    };
  }
  
  if (realYield !== null && realYield > 2) {
    return {
      name: "Restrictive Policy",
      description: "Real rates positive, liquidity tightening",
      color: "text-blue-600 bg-blue-50 border-blue-200",
      implications: [
        "Bonds may outperform",
        "Gold faces headwinds",
        "Growth assets struggle",
        "Dollar strength likely",
      ],
    };
  }
  
  return {
    name: "Transitional",
    description: "Mixed signals, regime unclear",
    color: "text-gray-600 bg-gray-50 border-gray-200",
    implications: [
      "Diversification important",
      "Watch for regime signals",
      "Volatility likely elevated",
    ],
  };
}

function calculateRepressionLevel(indicators: RegimeIndicators | null): string {
  if (!indicators) return "Unknown";
  const { realYield, debtToGdp, deficitToGdp } = indicators;
  
  let score = 0;
  if (realYield !== null && realYield < 0) score += 2;
  if (realYield !== null && realYield < -1) score += 1;
  if (debtToGdp !== null && debtToGdp > 100) score += 2;
  if (debtToGdp !== null && debtToGdp > 120) score += 1;
  if (deficitToGdp !== null && deficitToGdp > 5) score += 2;
  if (deficitToGdp !== null && deficitToGdp > 7) score += 1;
  
  if (score >= 7) return "Severe";
  if (score >= 5) return "Elevated";
  if (score >= 3) return "Moderate";
  return "Low";
}

function getRepressionPercent(indicators: RegimeIndicators | null): number {
  if (!indicators) return 0;
  const { realYield, debtToGdp, deficitToGdp } = indicators;
  
  let score = 0;
  if (realYield !== null) score += Math.max(0, Math.min(33, (0 - realYield) * 16.5));
  if (debtToGdp !== null) score += Math.max(0, Math.min(33, (debtToGdp - 80) * 0.83));
  if (deficitToGdp !== null) score += Math.max(0, Math.min(34, deficitToGdp * 5));
  
  return Math.min(100, score);
}

const categoryIcons: Record<string, React.ReactNode> = {
  rates: <TrendingUp className="w-4 h-4" />,
  inflation: <Flame className="w-4 h-4" />,
  employment: <HardHat className="w-4 h-4" />,
  growth: <Factory className="w-4 h-4" />,
  sentiment: <Drama className="w-4 h-4" />,
  credit: <CreditCard className="w-4 h-4" />,
  fx: <ArrowLeftRight className="w-4 h-4" />,
  "foreign-yields": <Globe className="w-4 h-4" />,
};

const categoryLabels: Record<string, string> = {
  rates: "Interest Rates",
  inflation: "Inflation",
  employment: "Employment",
  growth: "Economic Growth",
  sentiment: "Sentiment",
  credit: "Credit Markets",
  fx: "FX Rates",
  "foreign-yields": "Foreign Yields",
};

// ============================================================================
// Sub-Components
// ============================================================================

function RegimeIndicatorCard({
  label,
  value,
  format,
  threshold,
  inverse = false,
  description,
}: {
  label: string;
  value: number | null;
  format: (v: number) => string;
  threshold: { danger: number; warning: number };
  inverse?: boolean;
  description?: string;
}) {
  const getColor = () => {
    if (value === null) return "text-gray-400";
    const check = inverse ? -value : value;
    const t = inverse ? { danger: -threshold.danger, warning: -threshold.warning } : threshold;
    if (check >= t.danger) return "text-red-600";
    if (check >= t.warning) return "text-amber-600";
    return "text-emerald-600";
  };

  return (
    <div className="bg-gray-50 rounded-lg p-3">
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className={`text-xl font-bold ${getColor()}`}>
        {value !== null ? format(value) : "—"}
      </div>
      {description && <div className="text-xs text-gray-400 mt-1">{description}</div>}
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function MacroPageContent() {
  const [indicators, setIndicators] = useState<MacroIndicator[]>([]);
  const [status, setStatus] = useState<string>("loading");
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [yieldSpreads, setYieldSpreads] = useState<YieldSpread[]>([]);
  const [marketEtfs, setMarketEtfs] = useState<MarketEtf[]>([]);
  
  // Market data state
  const [breadthData, setBreadthData] = useState<BreadthData | null>(null);
  const [sentimentData, setSentimentData] = useState<SentimentData | null>(null);
  const [congressData, setCongressData] = useState<CongressData | null>(null);
  const [insiderData, setInsiderData] = useState<InsiderData | null>(null);
  
  // AI Insights state
  const [insightsData, setInsightsData] = useState<InsightsData | null>(null);
  const [generating, setGenerating] = useState(false);
  const [insightsError, setInsightsError] = useState<string | null>(null);

  // Regime state
  const [regimeIndicators, setRegimeIndicators] = useState<RegimeIndicators | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [macroRes, insightsRes, etfRes, breadthRes, sentimentRes, congressRes, insiderRes, goldRes] = await Promise.all([
        fetch("/api/macro"),
        fetch("/api/macro/insights"),
        fetch("/api/macro/etfs"),
        fetch("/api/markets/breadth"),
        fetch("/api/markets/sentiment"),
        fetch("/api/markets/congress"),
        fetch("/api/markets/insider"),
        fetch("/api/gold"),
      ]);
      
      if (macroRes.ok) {
        const data = await macroRes.json();
        setIndicators(data.indicators || []);
        setStatus(data.status || "offline");
        setLastUpdated(data.lastUpdated || null);
        setYieldSpreads(data.yieldSpreads || []);
        
        // Extract regime indicators
        const findIndicator = (id: string) => {
          const ind = data.indicators?.find((i: MacroIndicator) => i.id === id);
          return ind?.data?.current ?? null;
        };
        
        const rawDeficit = findIndicator("deficit-to-gdp");
        const deficitAsPositive = rawDeficit !== null ? Math.abs(rawDeficit) : null;
        
        const goldData = goldRes.ok ? await goldRes.json() : {};
        
        setRegimeIndicators({
          realYield: goldData.realYields?.value ?? null,
          nominalGrowth: findIndicator("gdp_growth"),
          debtToGdp: findIndicator("debt-to-gdp"),
          deficitToGdp: deficitAsPositive,
          m2Growth: findIndicator("m2_growth"),
          dxy: goldData.dxy?.price ?? null,
        });
      }
      
      if (insightsRes.ok) {
        const insights = await insightsRes.json();
        setInsightsData(insights);
      }
      
      if (etfRes.ok) {
        const etfData = await etfRes.json();
        setMarketEtfs(etfData.etfs || []);
      }
      
      if (breadthRes.ok) setBreadthData(await breadthRes.json());
      if (sentimentRes.ok) setSentimentData(await sentimentRes.json());
      if (congressRes.ok) setCongressData(await congressRes.json());
      if (insiderRes.ok) setInsiderData(await insiderRes.json());
    } catch (e) {
      console.error("Error fetching macro data:", e);
      setStatus("offline");
      setIndicators(MACRO_INDICATORS.map(ind => ({
        ...ind,
        data: null,
        interpretation: null,
        percentile: null,
      })) as MacroIndicator[]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const regenerateInsights = async () => {
    setGenerating(true);
    setInsightsError(null);
    try {
      const res = await fetch("/api/macro/insights/generate", { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setInsightsData(data);
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

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {/* Regime Banner skeleton */}
        <div className="card p-6 animate-pulse border-2 border-gray-200">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-6 h-6 bg-gray-200 rounded" />
            <div>
              <div className="h-6 bg-gray-200 rounded w-48 mb-2" />
              <div className="h-4 bg-gray-200 rounded w-64" />
            </div>
          </div>
        </div>
        
        {/* AI Insights skeleton */}
        <div className="card p-5 border-l-4 border-blue-500 animate-pulse">
          <div className="h-5 bg-gray-200 rounded w-36 mb-4" />
          <div className="space-y-2">
            <div className="h-4 bg-gray-200 rounded w-full" />
            <div className="h-4 bg-gray-200 rounded w-5/6" />
          </div>
        </div>
        
        {/* Market Barometers skeleton */}
        <div className="animate-pulse">
          <div className="h-5 bg-gray-200 rounded w-40 mb-4" />
          <div className="grid gap-4">
            {[1, 2].map((i) => (
              <div key={i} className="card p-5">
                <div className="h-8 bg-gray-200 rounded w-32 mb-4" />
                <div className="h-2 bg-gray-200 rounded-full" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Group indicators by category
  const grouped = indicators.reduce((acc: Record<string, MacroIndicator[]>, ind) => {
    if (!acc[ind.category]) acc[ind.category] = [];
    acc[ind.category].push(ind);
    return acc;
  }, {});

  const categoryOrder = ["rates", "inflation", "employment", "growth", "credit", "fx", "foreign-yields"];
  const regime = regimeIndicators ? determineRegime(regimeIndicators) : null;

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <PageHero
        title="Macro Dashboard"
        subtitle="Economic indicators, regime analysis, and market signals"
        badge={
          status === "demo" ? (
            <span className="text-xs bg-amber-100 text-amber-700 px-3 py-1 rounded-full">
              Demo Mode
            </span>
          ) : lastUpdated ? (
            <span className="text-xs text-gray-400">
              Updated: {formatTimestamp(lastUpdated)}
            </span>
          ) : undefined
        }
        actions={[
          {
            label: refreshing ? "Refreshing..." : "Refresh",
            onClick: handleRefresh,
            disabled: refreshing,
            icon: <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />,
          },
        ]}
      />

      {/* ============================================================ */}
      {/* REGIME BANNER - TOP OF PAGE */}
      {/* ============================================================ */}
      {regime && (
        <div className={`card p-6 mb-6 border-2 ${regime.color}`}>
          <div className="flex items-center gap-3 mb-3">
            <Landmark className="w-6 h-6" />
            <div>
              <h2 className="text-xl font-bold">{regime.name}</h2>
              <p className="text-sm opacity-80">{regime.description}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-4">
            {regime.implications.map((imp, i) => (
              <div key={i} className="text-xs bg-white/50 rounded px-2 py-1.5">
                {imp}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* AI INSIGHTS SECTION */}
      {/* ============================================================ */}
      <div className="card mb-6 p-5 border-l-4 border-blue-500">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            AI Market Insights
          </h2>
          <div className="flex items-center gap-3">
            {insightsData?.generatedAt && (
              <span className="text-xs text-gray-400">
                Generated: {formatDate(insightsData.generatedAt)}
              </span>
            )}
            <button
              onClick={regenerateInsights}
              disabled={generating}
              className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {generating ? "Generating..." : "Regenerate"}
            </button>
          </div>
        </div>
        
        {insightsError && (
          <div className="bg-red-50 text-red-700 text-sm p-3 rounded mb-3">
            {insightsError === "GEMINI_API_KEY not configured" 
              ? "Add GEMINI_API_KEY to enable AI insights"
              : insightsError}
          </div>
        )}
        
        {generating ? (
          <div className="flex items-center gap-2 text-gray-500 py-4">
            <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            <span>Analyzing macro indicators...</span>
          </div>
        ) : insightsData?.insights ? (
          <div className="prose prose-sm max-w-none prose-headings:text-gray-900 prose-headings:font-semibold prose-h2:text-base prose-h2:mt-4 prose-h2:mb-2 prose-ul:my-2 prose-li:my-0.5">
            <ReactMarkdown>{insightsData.insights}</ReactMarkdown>
          </div>
        ) : (
          <div className="text-gray-500 text-sm py-4">
            No insights generated yet. Click &quot;Regenerate&quot; to analyze current macro conditions.
          </div>
        )}
      </div>

      {/* ============================================================ */}
      {/* MARKET BAROMETERS */}
      {/* ============================================================ */}
      {marketEtfs.length > 0 && (
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <BarChart3 className="w-4 h-4" />
            Market Barometers
          </h2>
          <div className="grid gap-4">
            {marketEtfs.map((etf) => {
              const etfColorMap: Record<string, string> = {
                blue: "bg-blue-100 text-blue-700",
                gray: "bg-gray-100 text-gray-700",
                amber: "bg-amber-100 text-amber-700",
                red: "bg-red-100 text-red-700",
                green: "bg-emerald-100 text-emerald-700",
              };
              return (
                <div key={etf.ticker} className="card p-5">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2 sm:gap-4 mb-4">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-gray-900">{etf.name}</h3>
                      <p className="text-sm text-gray-500 mt-1">{etf.description}</p>
                    </div>
                    <div className="text-left sm:text-right flex-shrink-0">
                      {etf.data ? (
                        <>
                          <div className="text-2xl font-bold text-gray-900 flex items-center sm:justify-end gap-2">
                            ${etf.data.price.toFixed(2)}
                            <span className={`text-sm font-medium ${etf.data.change >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                              {etf.data.change >= 0 ? "+" : ""}{etf.data.change.toFixed(2)} ({etf.data.changePercent >= 0 ? "+" : ""}{etf.data.changePercent.toFixed(2)}%)
                            </span>
                          </div>
                          {etf.interpretation && (
                            <span className={`inline-block mt-1 text-xs px-2 py-0.5 rounded-full ${etfColorMap[etf.interpretation.color] || "bg-gray-100 text-gray-700"}`}>
                              {etf.interpretation.label}
                            </span>
                          )}
                        </>
                      ) : (
                        <div className="text-sm text-gray-400">No data</div>
                      )}
                    </div>
                  </div>

                  {etf.data && (
                    <div className="mb-4">
                      <div className="flex justify-between text-xs text-gray-500 mb-1">
                        <span>52W Low: ${etf.data.fiftyTwoWeekLow.toFixed(2)}</span>
                        <span>52W High: ${etf.data.fiftyTwoWeekHigh.toFixed(2)}</span>
                      </div>
                      <div className="relative h-2 bg-gray-200 rounded-full">
                        <div
                          className="absolute top-0 left-0 h-full bg-blue-500 rounded-full"
                          style={{ width: `${etf.data.rangePosition}%` }}
                        />
                        <div
                          className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-blue-600 border-2 border-white rounded-full shadow"
                          style={{ left: `${etf.data.rangePosition}%`, marginLeft: "-6px" }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* SENTIMENT & BREADTH */}
      {/* ============================================================ */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Gauge className="w-4 h-4" />
          Sentiment & Breadth
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* VIX & Put/Call Ratio */}
          <div className="card p-5">
            <h3 className="font-semibold text-gray-900 mb-3">VIX & Put/Call Ratio</h3>
            {sentimentData ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-sm text-gray-500">VIX (Fear Index)</span>
                    <div className="flex items-center gap-2">
                      <span className="text-2xl font-bold">{sentimentData.vix.value?.toFixed(2) ?? "—"}</span>
                      {sentimentData.vix.change != null && (
                        <span className={`text-sm ${sentimentData.vix.change >= 0 ? "text-red-600" : "text-emerald-600"}`}>
                          {sentimentData.vix.change >= 0 ? "+" : ""}{sentimentData.vix.change.toFixed(2)}
                        </span>
                      )}
                    </div>
                  </div>
                  {sentimentData.vix.level && (
                    <span className={`text-xs px-2 py-1 rounded-full ${
                      sentimentData.vix.level === "low" ? "bg-emerald-100 text-emerald-700" :
                      sentimentData.vix.level === "moderate" ? "bg-blue-100 text-blue-700" :
                      sentimentData.vix.level === "elevated" ? "bg-amber-100 text-amber-700" :
                      "bg-red-100 text-red-700"
                    }`}>
                      {sentimentData.vix.level.charAt(0).toUpperCase() + sentimentData.vix.level.slice(1)}
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-sm text-gray-500">Put/Call Ratio</span>
                    <div className="text-2xl font-bold">{sentimentData.putCall.value?.toFixed(2) ?? "—"}</div>
                  </div>
                  {sentimentData.putCall.level && (
                    <span className={`text-xs px-2 py-1 rounded-full ${
                      sentimentData.putCall.level === "greedy" ? "bg-amber-100 text-amber-700" :
                      sentimentData.putCall.level === "neutral" ? "bg-emerald-100 text-emerald-700" :
                      "bg-red-100 text-red-700"
                    }`}>
                      {sentimentData.putCall.level.charAt(0).toUpperCase() + sentimentData.putCall.level.slice(1)}
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <div className="text-sm text-gray-400">Loading...</div>
            )}
          </div>

          {/* Market Breadth */}
          <div className="card p-5">
            <h3 className="font-semibold text-gray-900 mb-3">Market Breadth</h3>
            {breadthData ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-sm text-gray-500">Advance/Decline</span>
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-bold text-emerald-600">{breadthData.advanceDecline.advances ?? "—"}</span>
                      <span className="text-gray-400">/</span>
                      <span className="text-lg font-bold text-red-600">{breadthData.advanceDecline.declines ?? "—"}</span>
                    </div>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full ${
                    breadthData.level === "bullish" ? "bg-emerald-100 text-emerald-700" :
                    breadthData.level === "bearish" ? "bg-red-100 text-red-700" :
                    "bg-gray-100 text-gray-700"
                  }`}>
                    {breadthData.level.charAt(0).toUpperCase() + breadthData.level.slice(1)}
                  </span>
                </div>
                <div>
                  <span className="text-sm text-gray-500">New Highs / New Lows</span>
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-bold text-emerald-600">{breadthData.newHighsLows.newHighs ?? "—"}</span>
                    <span className="text-gray-400">/</span>
                    <span className="text-lg font-bold text-red-600">{breadthData.newHighsLows.newLows ?? "—"}</span>
                  </div>
                </div>
                <p className="text-xs text-gray-400">{breadthData.interpretation}</p>
              </div>
            ) : (
              <div className="text-sm text-gray-400">Loading...</div>
            )}
          </div>
        </div>
      </div>

      {/* ============================================================ */}
      {/* SMART MONEY SIGNALS */}
      {/* ============================================================ */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Users className="w-4 h-4" />
          Smart Money Signals
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Congress Trades */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                <Briefcase className="w-4 h-4 text-gray-400" />
                Congress Trading
              </h3>
              {congressData && congressData.totalTrades > 0 && (
                <span className={`text-xs px-2 py-1 rounded-full ${
                  congressData.level === "bullish" ? "bg-emerald-100 text-emerald-700" :
                  congressData.level === "bearish" ? "bg-red-100 text-red-700" :
                  "bg-gray-100 text-gray-700"
                }`}>
                  {congressData.level.charAt(0).toUpperCase() + congressData.level.slice(1)}
                </span>
              )}
            </div>
            {congressData && congressData.totalTrades > 0 ? (
              <div className="space-y-3">
                <div className="flex items-center gap-4">
                  <div>
                    <span className="text-sm text-gray-500">Buys</span>
                    <div className="text-xl font-bold text-emerald-600">{congressData.buyCount}</div>
                  </div>
                  <div>
                    <span className="text-sm text-gray-500">Sells</span>
                    <div className="text-xl font-bold text-red-600">{congressData.sellCount}</div>
                  </div>
                  <div>
                    <span className="text-sm text-gray-500">Ratio</span>
                    <div className="text-xl font-bold">{congressData.ratio.toFixed(2)}</div>
                  </div>
                </div>
                {congressData.topTickers.length > 0 && (
                  <div>
                    <span className="text-xs text-gray-500">Most Traded</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {congressData.topTickers.slice(0, 5).map((t) => (
                        <span key={t.ticker} className="text-xs bg-gray-100 px-2 py-0.5 rounded">
                          {t.ticker} ({t.count})
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-sm text-gray-400">No Congress trades found</div>
            )}
          </div>

          {/* Insider Trades */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                <Activity className="w-4 h-4 text-gray-400" />
                Insider Trading
              </h3>
              {insiderData && insiderData.totalTrades > 0 && (
                <span className={`text-xs px-2 py-1 rounded-full ${
                  insiderData.level === "bullish" ? "bg-emerald-100 text-emerald-700" :
                  insiderData.level === "bearish" ? "bg-red-100 text-red-700" :
                  "bg-gray-100 text-gray-700"
                }`}>
                  {insiderData.level.charAt(0).toUpperCase() + insiderData.level.slice(1)}
                </span>
              )}
            </div>
            {insiderData && insiderData.totalTrades > 0 ? (
              <div className="space-y-3">
                <div className="flex items-center gap-4">
                  <div>
                    <span className="text-sm text-gray-500">Buys</span>
                    <div className="text-xl font-bold text-emerald-600">{insiderData.buyCount}</div>
                    <span className="text-xs text-gray-400">${(insiderData.buyValue / 1e6).toFixed(1)}M</span>
                  </div>
                  <div>
                    <span className="text-sm text-gray-500">Sells</span>
                    <div className="text-xl font-bold text-red-600">{insiderData.sellCount}</div>
                    <span className="text-xs text-gray-400">${(insiderData.sellValue / 1e6).toFixed(1)}M</span>
                  </div>
                  <div>
                    <span className="text-sm text-gray-500">Buy/Sell</span>
                    <div className="text-xl font-bold">{insiderData.ratio.toFixed(2)}</div>
                  </div>
                </div>
                {insiderData.clusterBuys.length > 0 && (
                  <div>
                    <span className="text-xs text-gray-500">Cluster Buying</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {insiderData.clusterBuys.slice(0, 5).map((t) => (
                        <span key={t.ticker} className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded">
                          {t.ticker} ({t.buys} buys)
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-sm text-gray-400">No insider trades found</div>
            )}
          </div>
        </div>
      </div>

      {/* ============================================================ */}
      {/* REPRESSION INDICATORS + METER */}
      {/* ============================================================ */}
      <div className="card p-6 mb-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Scale className="w-5 h-5 text-gray-500" />
          Financial Repression Indicators
        </h2>
        
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <RegimeIndicatorCard
            label="Real Yield"
            value={regimeIndicators?.realYield ?? null}
            format={(v) => `${v.toFixed(2)}%`}
            threshold={{ danger: 0, warning: 1 }}
            inverse
            description="10Y yield minus CPI"
          />
          <RegimeIndicatorCard
            label="Debt/GDP"
            value={regimeIndicators?.debtToGdp ?? null}
            format={(v) => `${v.toFixed(0)}%`}
            threshold={{ danger: 120, warning: 100 }}
            description="US federal debt"
          />
          <RegimeIndicatorCard
            label="Deficit/GDP"
            value={regimeIndicators?.deficitToGdp ?? null}
            format={(v) => `${v.toFixed(1)}%`}
            threshold={{ danger: 6, warning: 4 }}
            description="Annual fiscal deficit"
          />
          <RegimeIndicatorCard
            label="DXY"
            value={regimeIndicators?.dxy ?? null}
            format={(v) => v.toFixed(1)}
            threshold={{ danger: 90, warning: 95 }}
            inverse
            description="Dollar index"
          />
        </div>

        {/* Repression Meter */}
        <div className="bg-gray-50 rounded-lg p-4">
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm font-medium text-gray-700">Repression Level</span>
            <span className="text-sm text-gray-500">
              {calculateRepressionLevel(regimeIndicators)}
            </span>
          </div>
          <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-emerald-500 via-amber-500 to-red-500 transition-all"
              style={{ width: `${getRepressionPercent(regimeIndicators)}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-gray-400 mt-1">
            <span>Sound Money</span>
            <span>Moderate</span>
            <span>Repression</span>
          </div>
        </div>
      </div>

      {/* ============================================================ */}
      {/* REGIME HISTORY */}
      {/* ============================================================ */}
      <div className="card p-6 mb-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Globe className="w-5 h-5 text-gray-500" />
          Regime History
        </h2>
        
        <div className="space-y-3">
          {[
            {
              period: "1942-1951",
              regime: "Financial Repression",
              realYield: "-3 to -5%",
              result: "Debt/GDP fell 70pts, bondholders lost 30% real",
              color: "border-red-300 bg-red-50",
            },
            {
              period: "1980-2000",
              regime: "Sound Money",
              realYield: "+3 to +5%",
              result: "Great bond bull market, 40-year rally",
              color: "border-emerald-300 bg-emerald-50",
            },
            {
              period: "2008-2021",
              regime: "ZIRP/QE",
              realYield: "0 to -1%",
              result: "Everything rally, asset inflation",
              color: "border-blue-300 bg-blue-50",
            },
            {
              period: "2022-Present",
              regime: "Fiscal Dominance",
              realYield: "-1 to +1%",
              result: "Bonds crashed 2022, gold/BTC outperform",
              color: "border-amber-300 bg-amber-50",
            },
          ].map((era) => (
            <div key={era.period} className={`rounded-lg p-3 border ${era.color}`}>
              <div className="flex justify-between items-start">
                <div>
                  <div className="text-sm font-semibold text-gray-900">{era.period}</div>
                  <div className="text-xs text-gray-500">{era.regime}</div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-medium text-gray-700">Real Yield: {era.realYield}</div>
                </div>
              </div>
              <div className="text-xs text-gray-600 mt-2">{era.result}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ============================================================ */}
      {/* ASSET PERFORMANCE BY REGIME */}
      {/* ============================================================ */}
      <div className="card p-6 mb-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-gray-500" />
          Asset Performance by Regime
        </h2>
        
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 text-gray-500 font-medium">Regime</th>
                <th className="text-center py-2 text-gray-500 font-medium">Bonds</th>
                <th className="text-center py-2 text-gray-500 font-medium">Gold</th>
                <th className="text-center py-2 text-gray-500 font-medium">Equities</th>
                <th className="text-center py-2 text-gray-500 font-medium">Cash</th>
              </tr>
            </thead>
            <tbody>
              {[
                { regime: "Financial Repression", bonds: "🔴", gold: "🟢", equities: "🟡", cash: "🔴" },
                { regime: "Fiscal Dominance", bonds: "🔴", gold: "🟢", equities: "🟡", cash: "🟡" },
                { regime: "Sound Money", bonds: "🟢", gold: "🔴", equities: "🟢", cash: "🟢" },
                { regime: "Deflation", bonds: "🟢", gold: "🟡", equities: "🔴", cash: "🟢" },
              ].map((row) => (
                <tr key={row.regime} className="border-b border-gray-100">
                  <td className="py-2 font-medium text-gray-900">{row.regime}</td>
                  <td className="py-2 text-center">{row.bonds}</td>
                  <td className="py-2 text-center">{row.gold}</td>
                  <td className="py-2 text-center">{row.equities}</td>
                  <td className="py-2 text-center">{row.cash}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="text-xs text-gray-400 mt-2">
            🟢 Outperform | 🟡 Mixed | 🔴 Underperform
          </div>
        </div>
      </div>

      {/* ============================================================ */}
      {/* WAR & CONFLICT OVERLAY */}
      {/* ============================================================ */}
      <div className="card p-6 mb-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-red-500" />
          War & Conflict Overlay
        </h2>
        
        <blockquote className="border-l-4 border-red-400 pl-4 py-2 mb-4 bg-red-50 rounded-r-lg">
          <p className="text-sm text-gray-700 italic">
            &ldquo;In war, truth is the first casualty.&rdquo; — Aeschylus
          </p>
          <p className="text-sm text-gray-700 italic mt-1">
            &ldquo;Bonds are the second.&rdquo; — FFTT, 2022
          </p>
        </blockquote>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="text-sm font-medium text-gray-900 mb-2">Active Conflicts</div>
            <ul className="text-sm text-gray-600 space-y-1">
              <li>• US-Israel vs Iran (2026-)</li>
              <li>• Russia-Ukraine (2022-)</li>
              <li>• Israel-Gaza/Lebanon (2023-)</li>
              <li>• Red Sea / Strait of Hormuz disruption</li>
            </ul>
          </div>
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="text-sm font-medium text-gray-900 mb-2">Fiscal Impact</div>
            <ul className="text-sm text-gray-600 space-y-1">
              <li>• Defense spending ↑</li>
              <li>• Supply chain inflation</li>
              <li>• Energy price volatility (Oil &gt;$90)</li>
              <li>• De-dollarization pressure</li>
            </ul>
          </div>
        </div>
      </div>

      {/* ============================================================ */}
      {/* REGIME PLAYBOOK */}
      {/* ============================================================ */}
      <div className="card p-6 mb-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Shield className="w-5 h-5 text-emerald-500" />
          Regime Playbook
        </h2>
        
        <div className="space-y-4">
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
              <span className="text-amber-600 text-sm font-bold">1</span>
            </div>
            <div>
              <div className="text-sm font-medium text-gray-900">Avoid long-duration bonds</div>
              <div className="text-sm text-gray-500">In repression, you&apos;re lending to the government at negative real rates</div>
            </div>
          </div>
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
              <span className="text-amber-600 text-sm font-bold">2</span>
            </div>
            <div>
              <div className="text-sm font-medium text-gray-900">Overweight hard assets</div>
              <div className="text-sm text-gray-500">Gold, commodities, real estate — things that can&apos;t be printed</div>
            </div>
          </div>
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
              <span className="text-amber-600 text-sm font-bold">3</span>
            </div>
            <div>
              <div className="text-sm font-medium text-gray-900">Consider &ldquo;alternative money&rdquo;</div>
              <div className="text-sm text-gray-500">Dalio recommends 10-15% in gold + BTC as monetary hedge</div>
            </div>
          </div>
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
              <span className="text-amber-600 text-sm font-bold">4</span>
            </div>
            <div>
              <div className="text-sm font-medium text-gray-900">Shorten duration on fixed income</div>
              <div className="text-sm text-gray-500">T-bills, floating rate, TIPS — reduce interest rate sensitivity</div>
            </div>
          </div>
        </div>
      </div>

      {/* ============================================================ */}
      {/* ECONOMIC INDICATORS BY CATEGORY */}
      {/* ============================================================ */}
      {categoryOrder.map((category) => {
        const categoryIndicators = grouped[category];
        if (!categoryIndicators?.length) return null;

        return (
          <div key={category} className="mb-8">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <span className="flex items-center">{categoryIcons[category]}</span>
              {categoryLabels[category]}
            </h2>
            
            <div className="grid gap-4">
              {categoryIndicators.map((indicator) => (
                <div key={indicator.id} className="card p-5">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2 sm:gap-4 mb-4">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-gray-900">{indicator.name}</h3>
                      <p className="text-sm text-gray-500 mt-1">{indicator.description}</p>
                    </div>
                    
                    <div className="text-left sm:text-right flex-shrink-0">
                      {indicator.data ? (
                        <>
                          <div className="text-2xl font-bold text-gray-900 flex items-center justify-end gap-2">
                            {typeof indicator.data.current === 'number' 
                              ? indicator.data.current.toLocaleString(undefined, { maximumFractionDigits: 2 })
                              : indicator.data.current}
                            {indicator.unit === "%" || indicator.unit === "% YoY" ? "%" : ""}
                            {indicator.unit === "bps" && " bps"}
                            {indicator.unit === "thousands" && "K"}
                            {indicator.category === "fx" && (() => {
                              const trend = getTrendArrow(indicator.data!.current, indicator.data!.avg);
                              return <span className={`text-lg ${trend.color}`}>{trend.arrow}</span>;
                            })()}
                          </div>
                          {indicator.interpretation && (
                            <span className={`inline-block mt-1 text-xs px-2 py-0.5 rounded-full ${getStatusColor(indicator.interpretation.label)}`}>
                              {indicator.interpretation.label}
                            </span>
                          )}
                          {indicator.id === "dxy" && (() => {
                            const dxyInfo = getDxyInterpretation(indicator.data!.current);
                            return (
                              <div className={`text-xs mt-1 ${dxyInfo.color}`}>
                                {dxyInfo.description}
                              </div>
                            );
                          })()}
                          {indicator.percentile !== null && (
                            <div className="text-xs text-gray-400 mt-1">
                              {indicator.percentile}th percentile (5yr)
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="text-sm text-gray-400">No data</div>
                      )}
                    </div>
                  </div>

                  <div className="bg-gray-50 rounded-lg p-4 mb-4">
                    <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Why It Matters</h4>
                    <p className="text-sm text-gray-700">{indicator.whyItMatters}</p>
                  </div>

                  {indicator.interpretation && (
                    <div className="bg-blue-50 rounded-lg p-4 mb-4">
                      <h4 className="text-xs font-semibold text-blue-600 uppercase tracking-wide mb-2">Current Reading</h4>
                      <p className="text-sm text-gray-700 mb-1"><strong>Status:</strong> {indicator.interpretation.meaning}</p>
                      <p className="text-sm text-gray-700"><strong>Market Impact:</strong> {indicator.interpretation.marketImpact}</p>
                    </div>
                  )}

                  <div className="mb-4">
                    <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Interpretation Guide</h4>
                    <div className="space-y-2">
                      {indicator.ranges.map((range, idx) => (
                        <div 
                          key={idx} 
                          className={`flex flex-wrap sm:flex-nowrap items-start sm:items-center gap-1 sm:gap-3 text-sm p-2 rounded ${
                            indicator.interpretation?.label === range.label 
                              ? getStatusColor(range.label) + " ring-2 ring-offset-1 ring-gray-300" 
                              : "bg-gray-50"
                          }`}
                        >
                          <span className="font-medium w-auto sm:w-32 sm:flex-shrink-0">{range.label}</span>
                          <span className="text-gray-500 w-auto sm:w-24 sm:flex-shrink-0">
                            {range.min !== null ? range.min : "<"}{range.min !== null && range.max !== null ? " – " : ""}{range.max !== null ? range.max : "+"}
                          </span>
                          <span className="text-gray-600 flex-1 w-full sm:w-auto">{range.meaning}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Assets Affected</h4>
                    <div className="flex flex-wrap gap-1.5">
                      {indicator.affectedAssets.map((asset, idx) => (
                        <span key={idx} className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">{asset}</span>
                      ))}
                    </div>
                  </div>

                  {indicator.data && (
                    <div className="mt-4 pt-4 border-t border-gray-100 flex items-center gap-4 text-xs text-gray-400">
                      <span>5yr Range: {indicator.data.min.toFixed(1)} – {indicator.data.max.toFixed(1)}</span>
                      <span>Avg: {indicator.data.avg.toFixed(1)}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {/* ============================================================ */}
      {/* YIELD SPREADS */}
      {/* ============================================================ */}
      {yieldSpreads.length > 0 && (
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            Yield Spreads (Carry Trade Signals)
          </h2>
          <div className="card p-5">
            <p className="text-sm text-gray-600 mb-4">
              Yield spreads measure the difference between US Treasury yields and foreign government bonds. 
              Higher spreads attract capital to USD-denominated assets.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              {yieldSpreads.map((spread) => {
                const colorClasses = {
                  green: "bg-emerald-100 text-emerald-700 border-emerald-300",
                  amber: "bg-amber-100 text-amber-700 border-amber-300",
                  gray: "bg-gray-100 text-gray-600 border-gray-300",
                };
                return (
                  <div key={spread.name} className={`p-4 rounded-lg border ${colorClasses[spread.color]}`}>
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{spread.name}</span>
                      <span className="text-2xl font-bold">
                        {spread.value !== null ? `${spread.value}%` : "N/A"}
                      </span>
                    </div>
                    <div className="mt-2 text-sm font-medium">{spread.interpretation}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* DATA SOURCES */}
      {/* ============================================================ */}
      <div className="card p-4 mt-8">
        <h3 className="text-sm font-semibold text-gray-700 mb-2">Data Sources</h3>
        <p className="text-xs text-gray-500">
          Economic data sourced from Federal Reserve Economic Data (FRED) API, Yahoo Finance, and SEC filings.
          Updated daily for market data, monthly for economic indicators. Not investment advice.
        </p>
      </div>
    </div>
  );
}
