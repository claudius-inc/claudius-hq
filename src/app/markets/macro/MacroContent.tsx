"use client";

import { useState, useEffect } from "react";
import { MACRO_INDICATORS } from "@/lib/macro-indicators";
import { formatDate, formatTimestamp } from "@/lib/format-date";
import { PageHero } from "@/components/PageHero";
import ReactMarkdown from "react-markdown";
import { TrendingUp, Flame, HardHat, Factory, Drama, CreditCard, ArrowLeftRight, Globe, BarChart3, Activity, Users, Briefcase, Gauge, ChevronRight } from "lucide-react";

// Color coding for interpretation
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
    // FX-specific labels
    "Yen Strength": "bg-blue-100 text-blue-700",
    "Yen Weakness": "bg-amber-100 text-amber-700",
    "Extreme Weakness": "bg-red-100 text-red-700",
    "Dollar Strength": "bg-amber-100 text-amber-700",
    "Euro Strength": "bg-blue-100 text-blue-700",
    "Extreme Euro Strength": "bg-amber-100 text-amber-700",
    "Weak Dollar": "bg-emerald-100 text-emerald-700",
    "Strong Dollar": "bg-amber-100 text-amber-700",
    "Very Strong Dollar": "bg-red-100 text-red-700",
    // Foreign yields labels
    "YCC Zone": "bg-blue-100 text-blue-700",
    "Transition": "bg-amber-100 text-amber-700",
    "Normalization": "bg-amber-100 text-amber-700",
    "Negative/ZIRP": "bg-purple-100 text-purple-700",
  };
  return colors[label] || "bg-gray-100 text-gray-700";
}

// Get trend indicator for FX rates
function getTrendArrow(current: number, avg: number): { arrow: string; color: string } {
  const pctChange = ((current - avg) / avg) * 100;
  if (pctChange > 2) return { arrow: "↑", color: "text-emerald-600" };
  if (pctChange < -2) return { arrow: "↓", color: "text-red-600" };
  return { arrow: "→", color: "text-gray-500" };
}

// Interpret DXY levels
function getDxyInterpretation(value: number): { label: string; description: string; color: string } {
  if (value > 105) {
    return { 
      label: "Strong Dollar", 
      description: "Headwind for EM & commodities",
      color: "text-amber-600"
    };
  }
  if (value >= 100) {
    return { 
      label: "Neutral", 
      description: "Balanced conditions",
      color: "text-gray-600"
    };
  }
  return { 
    label: "Weak Dollar", 
    description: "Tailwind for EM & commodities",
    color: "text-emerald-600"
  };
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

type LayoutMode = "original" | "compact" | "cards";

function formatIndicatorVal(indicator: MacroIndicator): string {
  if (!indicator.data) return "\u2014";
  const v = indicator.data.current;
  const num = typeof v === "number"
    ? v.toLocaleString(undefined, { maximumFractionDigits: 2 })
    : String(v);
  if (indicator.unit === "%" || indicator.unit === "% YoY") return num + "%";
  if (indicator.unit === "bps") return num + " bps";
  if (indicator.unit === "thousands") return num + "K";
  return num;
}

function IndicatorDetails({ indicator }: { indicator: MacroIndicator }) {
  return (
    <div className="space-y-3">
      {indicator.interpretation && (
        <div className="bg-blue-50 rounded-lg p-3">
          <h4 className="text-xs font-semibold text-blue-600 uppercase tracking-wide mb-1">Current Reading</h4>
          <p className="text-sm text-gray-700 mb-1"><strong>Status:</strong> {indicator.interpretation.meaning}</p>
          <p className="text-sm text-gray-700"><strong>Market Impact:</strong> {indicator.interpretation.marketImpact}</p>
        </div>
      )}
      <div className="bg-gray-50 rounded-lg p-3">
        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Why It Matters</h4>
        <p className="text-sm text-gray-700">{indicator.whyItMatters}</p>
      </div>
      <div>
        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Interpretation Guide</h4>
        <div className="space-y-1">
          {indicator.ranges.map((range, idx) => (
            <div
              key={idx}
              className={`flex flex-wrap items-start gap-1 sm:gap-2 text-xs p-1.5 rounded ${
                indicator.interpretation?.label === range.label
                  ? getStatusColor(range.label) + " ring-1 ring-offset-1 ring-gray-300"
                  : "bg-gray-50"
              }`}
            >
              <span className="font-medium w-28 shrink-0">{range.label}</span>
              <span className="text-gray-500 w-20 shrink-0 tabular-nums">
                {range.min !== null ? range.min : "<"}{range.min !== null && range.max !== null ? " \u2013 " : ""}{range.max !== null ? range.max : "+"}
              </span>
              <span className="text-gray-600 flex-1">{range.meaning}</span>
            </div>
          ))}
        </div>
      </div>
      {indicator.keyLevels && indicator.keyLevels.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Key Levels</h4>
          <div className="flex flex-wrap gap-2">
            {indicator.keyLevels.map((kl, idx) => (
              <div key={idx} className="bg-gray-100 rounded px-2.5 py-1 text-xs">
                <span className="font-mono font-semibold">{kl.level}</span>
                <span className="text-gray-500 ml-1.5">{kl.significance}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      <div>
        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Assets Affected</h4>
        <div className="flex flex-wrap gap-1">
          {indicator.affectedAssets.map((asset, idx) => (
            <span key={idx} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">{asset}</span>
          ))}
        </div>
      </div>
      {indicator.data && (
        <div className="flex items-center gap-4 text-xs text-gray-400 pt-2 border-t border-gray-100">
          <span>5yr Range: {indicator.data.min.toFixed(1)} &ndash; {indicator.data.max.toFixed(1)}</span>
          <span>Avg: {indicator.data.avg.toFixed(1)}</span>
        </div>
      )}
    </div>
  );
}

export function MacroContent() {
  const [indicators, setIndicators] = useState<MacroIndicator[]>([]);
  const [status, setStatus] = useState<string>("loading");
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [yieldSpreads, setYieldSpreads] = useState<YieldSpread[]>([]);
  const [marketEtfs, setMarketEtfs] = useState<MarketEtf[]>([]);
  
  // New market data state
  const [breadthData, setBreadthData] = useState<BreadthData | null>(null);
  const [sentimentData, setSentimentData] = useState<SentimentData | null>(null);
  const [congressData, setCongressData] = useState<CongressData | null>(null);
  const [insiderData, setInsiderData] = useState<InsiderData | null>(null);
  
  // Layout state
  const [layout, setLayout] = useState<LayoutMode>("original");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const toggleExpanded = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // AI Insights state
  const [insightsData, setInsightsData] = useState<InsightsData | null>(null);
  const [generating, setGenerating] = useState(false);
  const [insightsError, setInsightsError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        const [macroRes, insightsRes, etfRes, breadthRes, sentimentRes, congressRes, insiderRes] = await Promise.all([
          fetch("/api/macro"),
          fetch("/api/macro/insights"),
          fetch("/api/macro/etfs"),
          fetch("/api/markets/breadth"),
          fetch("/api/markets/sentiment"),
          fetch("/api/markets/congress"),
          fetch("/api/markets/insider"),
        ]);
        
        if (macroRes.ok) {
          const data = await macroRes.json();
          setIndicators(data.indicators || []);
          setStatus(data.status || "offline");
          setLastUpdated(data.lastUpdated || null);
          setYieldSpreads(data.yieldSpreads || []);
        }
        
        if (insightsRes.ok) {
          const insights = await insightsRes.json();
          setInsightsData(insights);
        }
        
        if (etfRes.ok) {
          const etfData = await etfRes.json();
          setMarketEtfs(etfData.etfs || []);
        }
        
        if (breadthRes.ok) {
          const breadth = await breadthRes.json();
          setBreadthData(breadth);
        }
        
        if (sentimentRes.ok) {
          const sentiment = await sentimentRes.json();
          setSentimentData(sentiment);
        }
        
        if (congressRes.ok) {
          const congress = await congressRes.json();
          setCongressData(congress);
        }
        
        if (insiderRes.ok) {
          const insider = await insiderRes.json();
          setInsiderData(insider);
        }
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
      }
    }
    fetchData();
  }, []);

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
      <div className="space-y-6">
        {/* AI Insights skeleton */}
        <div className="card p-5 border-l-4 border-blue-500 animate-pulse">
          <div className="flex items-center justify-between mb-4">
            <div className="h-5 bg-gray-200 rounded w-36" />
            <div className="h-8 bg-gray-200 rounded w-24" />
          </div>
          <div className="space-y-2">
            <div className="h-4 bg-gray-200 rounded w-full" />
            <div className="h-4 bg-gray-200 rounded w-5/6" />
            <div className="h-4 bg-gray-200 rounded w-4/5" />
          </div>
        </div>
        
        {/* Market Barometers skeleton */}
        <div className="animate-pulse">
          <div className="h-5 bg-gray-200 rounded w-40 mb-4" />
          <div className="grid gap-4">
            {[1, 2].map((i) => (
              <div key={i} className="card p-5">
                <div className="flex justify-between mb-4">
                  <div>
                    <div className="h-5 bg-gray-200 rounded w-32 mb-2" />
                    <div className="h-4 bg-gray-200 rounded w-48" />
                  </div>
                  <div className="text-right">
                    <div className="h-8 bg-gray-200 rounded w-24 mb-1" />
                    <div className="h-4 bg-gray-200 rounded w-20" />
                  </div>
                </div>
                {/* Range bar skeleton */}
                <div className="h-2 bg-gray-200 rounded-full mb-2" />
                <div className="flex justify-between">
                  <div className="h-3 bg-gray-200 rounded w-12" />
                  <div className="h-3 bg-gray-200 rounded w-12" />
                </div>
              </div>
            ))}
          </div>
        </div>
        
        {/* Indicator categories skeleton */}
        {[1, 2, 3].map((i) => (
          <div key={i} className="animate-pulse">
            <div className="h-5 bg-gray-200 rounded w-24 mb-4" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[1, 2].map((j) => (
                <div key={j} className="card p-5">
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <div className="h-5 bg-gray-200 rounded w-36 mb-1" />
                      <div className="h-4 bg-gray-200 rounded w-24" />
                    </div>
                    <div className="h-6 bg-gray-200 rounded-full w-20" />
                  </div>
                  <div className="h-4 bg-gray-200 rounded w-full mb-2" />
                  <div className="h-4 bg-gray-200 rounded w-3/4" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  // Group by category
  const grouped = indicators.reduce((acc: Record<string, MacroIndicator[]>, ind) => {
    if (!acc[ind.category]) acc[ind.category] = [];
    acc[ind.category].push(ind);
    return acc;
  }, {});

  const categoryOrder = ["rates", "inflation", "employment", "growth", "credit", "fx", "foreign-yields"];

  return (
    <>
      <PageHero
        title="Macro Dashboard"
        subtitle="Key economic indicators and what they mean for markets"
        badge={
          status === "demo" ? (
            <span className="text-xs bg-amber-100 text-amber-700 px-3 py-1 rounded-full">
              Demo Mode — Add FRED_API_KEY for live data
            </span>
          ) : lastUpdated && status === "live" ? (
            <span className="text-xs text-gray-400">
              Updated: {formatTimestamp(lastUpdated)}
            </span>
          ) : undefined
        }
      />

      {/* Layout Toggle */}
      <div className="flex items-center gap-2 mb-6">
        <span className="text-xs text-gray-500 mr-1">Layout:</span>
        <div className="flex rounded-lg border border-gray-200 overflow-hidden">
          {(["original", "compact", "cards"] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => { setLayout(mode); setExpandedIds(new Set()); }}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                layout === mode
                  ? "bg-gray-900 text-white"
                  : "bg-white text-gray-600 hover:bg-gray-50"
              }`}
            >
              {mode.charAt(0).toUpperCase() + mode.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* AI Insights Section */}
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

      {/* Market Barometers (ETFs) */}
      {marketEtfs.length > 0 && (
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <BarChart3 className="w-4 h-4" />
            Market Barometers
          </h2>
          <div className={`grid gap-4 ${layout === "compact" ? "sm:grid-cols-2" : ""}`}>
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
                  {/* Header */}
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

                  {/* 52-Week Range Bar */}
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
                      <div className="flex gap-4 mt-2 text-xs text-gray-400">
                        <span>50D Avg: ${etf.data.fiftyDayAvg.toFixed(2)}</span>
                        <span>200D Avg: ${etf.data.twoHundredDayAvg.toFixed(2)}</span>
                        <span>Position: {etf.data.rangePosition}th percentile</span>
                      </div>
                    </div>
                  )}

                  {/* Detail toggle for compact/cards */}
                  {layout !== "original" && (
                    <button
                      onClick={() => toggleExpanded(`etf-${etf.ticker}`)}
                      className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1 mb-3"
                    >
                      <ChevronRight className={`w-3 h-3 transition-transform ${expandedIds.has(`etf-${etf.ticker}`) ? "rotate-90" : ""}`} />
                      {expandedIds.has(`etf-${etf.ticker}`) ? "Hide details" : "Show details"}
                    </button>
                  )}

                  {(layout === "original" || expandedIds.has(`etf-${etf.ticker}`)) && (
                    <>
                      {/* Why It Matters */}
                      <div className="bg-gray-50 rounded-lg p-4 mb-4">
                        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Why It Matters</h4>
                        <p className="text-sm text-gray-700">{etf.whyItMatters}</p>
                      </div>

                      {/* Current Interpretation */}
                      {etf.interpretation && (
                        <div className="bg-blue-50 rounded-lg p-4 mb-4">
                          <h4 className="text-xs font-semibold text-blue-600 uppercase tracking-wide mb-2">Current Reading</h4>
                          <p className="text-sm text-gray-700">{etf.interpretation.meaning}</p>
                        </div>
                      )}

                      {/* Range Guide */}
                      <div className="mb-4">
                        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Interpretation Guide</h4>
                        <div className="space-y-2">
                          {etf.ranges.map((range, idx) => (
                            <div
                              key={idx}
                              className={`flex flex-wrap sm:flex-nowrap items-start sm:items-center gap-1 sm:gap-3 text-sm p-2 rounded ${
                                etf.interpretation?.label === range.label
                                  ? (etfColorMap[range.color] || "bg-gray-100 text-gray-700") + " ring-2 ring-offset-1 ring-gray-300"
                                  : "bg-gray-50"
                              }`}
                            >
                              <span className="font-medium w-auto sm:w-32 sm:flex-shrink-0">{range.label}</span>
                              <span className="text-gray-500 w-auto sm:w-24 sm:flex-shrink-0">
                                {range.min !== null ? `$${range.min}` : "<"}{range.min !== null && range.max !== null ? " – " : ""}{range.max !== null ? `$${range.max}` : "+"}
                              </span>
                              <span className="text-gray-600 flex-1 w-full sm:w-auto">{range.meaning}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Affected Assets */}
                      <div>
                        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Assets Affected</h4>
                        <div className="flex flex-wrap gap-1.5">
                          {etf.affectedAssets.map((asset, idx) => (
                            <span key={idx} className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">{asset}</span>
                          ))}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Market Sentiment Section */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Gauge className="w-4 h-4" />
          Market Sentiment
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* VIX & Put/Call Ratio */}
          <div className="card p-5">
            <h3 className="font-semibold text-gray-900 mb-3">VIX & Put/Call Ratio</h3>
            {sentimentData ? (
              <div className="space-y-4">
                {/* VIX */}
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
                {/* P/C Ratio */}
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-sm text-gray-500">Put/Call Ratio</span>
                    <div className="text-2xl font-bold">{sentimentData.putCall.value?.toFixed(2) ?? "—"}</div>
                    <span className="text-xs text-gray-400">Source: {sentimentData.putCall.source}</span>
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
                {/* Volatility Context */}
                {sentimentData.volatilityContext && (
                  <div className="pt-3 border-t border-gray-100">
                    <div className="text-xs text-gray-500 mb-1">VIX Term Structure</div>
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-medium ${
                        sentimentData.volatilityContext.contango === "backwardation" ? "text-amber-600" : "text-emerald-600"
                      }`}>
                        {sentimentData.volatilityContext.contango.charAt(0).toUpperCase() + sentimentData.volatilityContext.contango.slice(1)}
                      </span>
                      <span className="text-xs text-gray-400">({sentimentData.volatilityContext.termStructure.toFixed(2)}x)</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">{sentimentData.volatilityContext.interpretation}</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-sm text-gray-400">Loading sentiment data...</div>
            )}
          </div>

          {/* Market Breadth */}
          <div className="card p-5">
            <h3 className="font-semibold text-gray-900 mb-3">Market Breadth</h3>
            {breadthData ? (
              <div className="space-y-4">
                {/* A/D Line */}
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-sm text-gray-500">Advance/Decline</span>
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-bold text-emerald-600">{breadthData.advanceDecline.advances ?? "—"}</span>
                      <span className="text-gray-400">/</span>
                      <span className="text-lg font-bold text-red-600">{breadthData.advanceDecline.declines ?? "—"}</span>
                    </div>
                    {breadthData.advanceDecline.ratio && (
                      <span className="text-xs text-gray-400">Ratio: {breadthData.advanceDecline.ratio.toFixed(2)}</span>
                    )}
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full ${
                    breadthData.level === "bullish" ? "bg-emerald-100 text-emerald-700" :
                    breadthData.level === "bearish" ? "bg-red-100 text-red-700" :
                    "bg-gray-100 text-gray-700"
                  }`}>
                    {breadthData.level.charAt(0).toUpperCase() + breadthData.level.slice(1)}
                  </span>
                </div>
                {/* New Highs/Lows */}
                <div>
                  <span className="text-sm text-gray-500">New Highs / New Lows</span>
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-bold text-emerald-600">{breadthData.newHighsLows.newHighs ?? "—"}</span>
                    <span className="text-gray-400">/</span>
                    <span className="text-lg font-bold text-red-600">{breadthData.newHighsLows.newLows ?? "—"}</span>
                  </div>
                </div>
                {/* McClellan Oscillator */}
                {breadthData.mcclellan?.oscillator !== null && (
                  <div className="pt-3 border-t border-gray-100">
                    <div className="text-xs text-gray-500 mb-1">McClellan Oscillator (approx)</div>
                    <div className={`text-lg font-bold ${
                      (breadthData.mcclellan?.oscillator ?? 0) > 0 ? "text-emerald-600" : "text-red-600"
                    }`}>
                      {breadthData.mcclellan?.oscillator?.toFixed(1) ?? "—"}
                    </div>
                  </div>
                )}
                <p className="text-xs text-gray-400">{breadthData.interpretation}</p>
              </div>
            ) : (
              <div className="text-sm text-gray-400">Loading breadth data...</div>
            )}
          </div>
        </div>
      </div>

      {/* Smart Money Section */}
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
            {congressData ? (
              congressData.totalTrades > 0 ? (
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
                  <p className="text-xs text-gray-400">STOCK Act filings from House & Senate (last 90 days)</p>
                </div>
              ) : (
                <div className="text-sm text-gray-400">
                  <p>No Congress trades found in the last 90 days.</p>
                  <p className="text-xs mt-1">Run sync to fetch latest STOCK Act filings.</p>
                </div>
              )
            ) : (
              <div className="text-sm text-gray-400">Loading Congress trading data...</div>
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
            {insiderData ? (
              insiderData.totalTrades > 0 ? (
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
                      <span className="text-xs text-gray-500">Cluster Buying (multiple insiders)</span>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {insiderData.clusterBuys.slice(0, 5).map((t) => (
                          <span key={t.ticker} className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded">
                            {t.ticker} ({t.buys} buys)
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  <p className="text-xs text-gray-400">SEC Form 4 filings (last 14 days)</p>
                </div>
              ) : (
                <div className="text-sm text-gray-400">
                  <p>No insider trades found in the last 14 days.</p>
                  <p className="text-xs mt-1">Run sync to fetch latest SEC Form 4 filings.</p>
                </div>
              )
            ) : (
              <div className="text-sm text-gray-400">Loading insider trading data...</div>
            )}
          </div>
        </div>
      </div>

      {/* Legend - hidden in compact mode */}
      {layout !== "compact" && (
        <div className="card mb-6 p-4">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">How to Read This Dashboard</h2>
          <div className="flex flex-wrap gap-3 text-xs">
            <span className="bg-emerald-100 text-emerald-700 px-2 py-1 rounded">Favorable / Goldilocks</span>
            <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded">Accommodative / Supportive</span>
            <span className="bg-gray-100 text-gray-700 px-2 py-1 rounded">Neutral</span>
            <span className="bg-amber-100 text-amber-700 px-2 py-1 rounded">Caution / Watch</span>
            <span className="bg-red-100 text-red-700 px-2 py-1 rounded">Concern / Restrictive</span>
          </div>
        </div>
      )}

      {/* Indicators by Category */}

      {/* ── Original Layout ── */}
      {layout === "original" && categoryOrder.map((category) => {
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
                  {/* Header */}
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2 sm:gap-4 mb-4">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-gray-900">{indicator.name}</h3>
                      <p className="text-sm text-gray-500 mt-1">{indicator.description}</p>
                    </div>

                    {/* Current Value + Status */}
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

                  {/* Why It Matters */}
                  <div className="bg-gray-50 rounded-lg p-4 mb-4">
                    <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                      Why It Matters
                    </h4>
                    <p className="text-sm text-gray-700">{indicator.whyItMatters}</p>
                  </div>

                  {/* Current Interpretation */}
                  {indicator.interpretation && (
                    <div className="bg-blue-50 rounded-lg p-4 mb-4">
                      <h4 className="text-xs font-semibold text-blue-600 uppercase tracking-wide mb-2">
                        Current Reading
                      </h4>
                      <p className="text-sm text-gray-700 mb-1">
                        <strong>Status:</strong> {indicator.interpretation.meaning}
                      </p>
                      <p className="text-sm text-gray-700">
                        <strong>Market Impact:</strong> {indicator.interpretation.marketImpact}
                      </p>
                    </div>
                  )}

                  {/* Range Guide */}
                  <div className="mb-4">
                    <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                      Interpretation Guide
                    </h4>
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

                  {/* Key Levels */}
                  {indicator.keyLevels && indicator.keyLevels.length > 0 && (
                    <div className="mb-4">
                      <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                        Key Levels to Watch
                      </h4>
                      <div className="flex flex-wrap gap-2">
                        {indicator.keyLevels.map((kl, idx) => (
                          <div key={idx} className="bg-gray-100 rounded px-3 py-1.5 text-sm">
                            <span className="font-mono font-semibold">{kl.level}</span>
                            <span className="text-gray-500 ml-2">{kl.significance}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Affected Assets */}
                  <div>
                    <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                      Assets Affected
                    </h4>
                    <div className="flex flex-wrap gap-1.5">
                      {indicator.affectedAssets.map((asset, idx) => (
                        <span key={idx} className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">
                          {asset}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Historical Range */}
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

      {/* ── Compact Layout: Accordion rows per category ── */}
      {layout === "compact" && categoryOrder.map((category) => {
        const categoryIndicators = grouped[category];
        if (!categoryIndicators?.length) return null;

        return (
          <div key={category} className="mb-6">
            <h2 className="text-sm font-semibold text-gray-900 mb-2 flex items-center gap-2">
              <span className="flex items-center text-gray-400">{categoryIcons[category]}</span>
              {categoryLabels[category]}
            </h2>
            <div className="card overflow-hidden !p-0 divide-y divide-gray-100">
              {categoryIndicators.map((indicator) => (
                <div key={indicator.id}>
                  <button
                    onClick={() => toggleExpanded(indicator.id)}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors"
                  >
                    <ChevronRight className={`w-3.5 h-3.5 text-gray-400 transition-transform shrink-0 ${
                      expandedIds.has(indicator.id) ? "rotate-90" : ""
                    }`} />
                    <span className="text-sm font-medium text-gray-900 flex-1 min-w-0 truncate">
                      {indicator.name}
                    </span>
                    {indicator.category === "fx" && indicator.data && (() => {
                      const trend = getTrendArrow(indicator.data!.current, indicator.data!.avg);
                      return <span className={`text-sm ${trend.color} shrink-0`}>{trend.arrow}</span>;
                    })()}
                    <span className="text-sm font-bold tabular-nums text-gray-900 shrink-0">
                      {formatIndicatorVal(indicator)}
                    </span>
                    {indicator.interpretation && (
                      <span className={`text-[11px] px-2 py-0.5 rounded-full shrink-0 ${getStatusColor(indicator.interpretation.label)}`}>
                        {indicator.interpretation.label}
                      </span>
                    )}
                    {indicator.percentile !== null && (
                      <div className="w-16 shrink-0 hidden sm:flex items-center gap-1.5">
                        <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-blue-400 rounded-full"
                            style={{ width: `${indicator.percentile}%` }}
                          />
                        </div>
                        <span className="text-[10px] text-gray-400 tabular-nums w-7">{indicator.percentile}th</span>
                      </div>
                    )}
                  </button>
                  {expandedIds.has(indicator.id) && (
                    <div className="px-4 pb-4 pt-2 bg-gray-50/50 border-t border-gray-100">
                      <p className="text-xs text-gray-500 mb-3">{indicator.description}</p>
                      <IndicatorDetails indicator={indicator} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {/* ── Cards Layout: 2-col condensed cards ── */}
      {layout === "cards" && categoryOrder.map((category) => {
        const categoryIndicators = grouped[category];
        if (!categoryIndicators?.length) return null;

        return (
          <div key={category} className="mb-6">
            <h2 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <span className="flex items-center text-gray-400">{categoryIcons[category]}</span>
              {categoryLabels[category]}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {categoryIndicators.map((indicator) => (
                <div key={indicator.id} className="card !p-4">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <h3 className="text-sm font-semibold text-gray-900 leading-tight">{indicator.name}</h3>
                    {indicator.interpretation && (
                      <span className={`text-[11px] px-2 py-0.5 rounded-full shrink-0 ${getStatusColor(indicator.interpretation.label)}`}>
                        {indicator.interpretation.label}
                      </span>
                    )}
                  </div>
                  <div className="flex items-baseline gap-2 mb-2">
                    {indicator.data ? (
                      <>
                        <span className="text-xl font-bold text-gray-900 tabular-nums">
                          {formatIndicatorVal(indicator)}
                        </span>
                        {indicator.category === "fx" && (() => {
                          const trend = getTrendArrow(indicator.data!.current, indicator.data!.avg);
                          return <span className={`text-sm ${trend.color}`}>{trend.arrow}</span>;
                        })()}
                        {indicator.percentile !== null && (
                          <span className="text-xs text-gray-400">{indicator.percentile}th pctl</span>
                        )}
                      </>
                    ) : (
                      <span className="text-xl font-bold text-gray-400">&mdash;</span>
                    )}
                  </div>
                  {indicator.interpretation && (
                    <p className="text-xs text-gray-600 mb-2 line-clamp-2">{indicator.interpretation.meaning}</p>
                  )}
                  {indicator.id === "dxy" && indicator.data && (() => {
                    const dxyInfo = getDxyInterpretation(indicator.data!.current);
                    return <p className={`text-xs mb-2 ${dxyInfo.color}`}>{dxyInfo.description}</p>;
                  })()}
                  <button
                    onClick={() => toggleExpanded(indicator.id)}
                    className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1"
                  >
                    <ChevronRight className={`w-3 h-3 transition-transform ${expandedIds.has(indicator.id) ? "rotate-90" : ""}`} />
                    {expandedIds.has(indicator.id) ? "Hide details" : "Details"}
                  </button>
                  {expandedIds.has(indicator.id) && (
                    <div className="mt-3 pt-3 border-t border-gray-100">
                      <IndicatorDetails indicator={indicator} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {/* Yield Spreads Section */}
      {yieldSpreads.length > 0 && (
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            Yield Spreads (Carry Trade Signals)
          </h2>
          <div className="card p-5">
            <p className="text-sm text-gray-600 mb-4">
              Yield spreads measure the difference between US Treasury yields and foreign government bonds. 
              Higher spreads attract capital to USD-denominated assets and make carry trades more attractive.
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
                    <div className="mt-2 text-sm font-medium">
                      {spread.interpretation}
                    </div>
                    <p className="text-xs mt-2 opacity-80">
                      {spread.name === "US-Japan Spread" 
                        ? "Yen carry trade attractiveness. Higher = more capital flows to USD."
                        : "EUR carry trade attractiveness. Reflects US-Europe policy divergence."}
                    </p>
                  </div>
                );
              })}
            </div>
            <div className="mt-4 pt-4 border-t border-gray-200">
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                How to Read
              </h4>
              <div className="flex flex-wrap gap-3 text-xs">
                <span className="bg-emerald-100 text-emerald-700 px-2 py-1 rounded">&gt;3% = Attractive Carry</span>
                <span className="bg-amber-100 text-amber-700 px-2 py-1 rounded">2-3% = Moderate Carry</span>
                <span className="bg-gray-100 text-gray-600 px-2 py-1 rounded">&lt;2% = Unattractive</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Data Sources */}
      <div className="card p-4 mt-8">
        <h3 className="text-sm font-semibold text-gray-700 mb-2">Data Sources</h3>
        <p className="text-xs text-gray-500">
          Economic data sourced from the Federal Reserve Economic Data (FRED) API. 
          Updated daily for market data, monthly for economic indicators. 
          Not investment advice — do your own research.
        </p>
      </div>
    </>
  );
}
