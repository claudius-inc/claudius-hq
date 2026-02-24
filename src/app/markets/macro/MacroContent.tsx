"use client";

import { useState, useEffect } from "react";
import { MACRO_INDICATORS } from "@/lib/macro-indicators";
import { formatDate, formatTimestamp } from "@/lib/format-date";
import { PageHero } from "@/components/PageHero";
import ReactMarkdown from "react-markdown";
import { TrendingUp, Flame, HardHat, Factory, Drama, CreditCard, ArrowLeftRight, Globe, BarChart3 } from "lucide-react";

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

export function MacroContent() {
  const [indicators, setIndicators] = useState<MacroIndicator[]>([]);
  const [status, setStatus] = useState<string>("loading");
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [yieldSpreads, setYieldSpreads] = useState<YieldSpread[]>([]);
  const [marketEtfs, setMarketEtfs] = useState<MarketEtf[]>([]);
  
  // AI Insights state
  const [insightsData, setInsightsData] = useState<InsightsData | null>(null);
  const [generating, setGenerating] = useState(false);
  const [insightsError, setInsightsError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        const [macroRes, insightsRes, etfRes] = await Promise.all([
          fetch("/api/macro"),
          fetch("/api/macro/insights"),
          fetch("/api/macro/etfs"),
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
        {[1, 2, 3].map(i => (
          <div key={i} className="card p-6 animate-pulse">
            <div className="h-6 bg-gray-200 rounded w-1/3 mb-4" />
            <div className="h-4 bg-gray-200 rounded w-2/3 mb-2" />
            <div className="h-4 bg-gray-200 rounded w-1/2" />
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
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Legend */}
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

      {/* Indicators by Category */}
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
                            {/* Trend arrow for FX indicators */}
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
                          {/* DXY special interpretation */}
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
