import type { Metadata } from "next";
import { MACRO_INDICATORS, interpretValue } from "@/lib/macro-indicators";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Macro Dashboard | Stocks",
};

// Revalidate every hour
export const revalidate = 3600;

// Color coding for interpretation
function getStatusColor(label: string): string {
  const colors: Record<string, string> = {
    // Positive/Goldilocks
    "Target Zone": "bg-emerald-100 text-emerald-700",
    "At Target": "bg-emerald-100 text-emerald-700",
    "Healthy": "bg-emerald-100 text-emerald-700",
    "Normal": "bg-emerald-100 text-emerald-700",
    "Full Employment": "bg-emerald-100 text-emerald-700",
    "Expansion": "bg-emerald-100 text-emerald-700",
    
    // Neutral/Watch
    "Accommodative": "bg-blue-100 text-blue-700",
    "Neutral": "bg-gray-100 text-gray-700",
    "Moderate": "bg-gray-100 text-gray-700",
    "Low": "bg-blue-100 text-blue-700",
    "Flat": "bg-amber-100 text-amber-700",
    
    // Caution
    "Above Target": "bg-amber-100 text-amber-700",
    "Elevated": "bg-amber-100 text-amber-700",
    "Softening": "bg-amber-100 text-amber-700",
    "Restrictive": "bg-amber-100 text-amber-700",
    "Inverted": "bg-amber-100 text-amber-700",
    "Contraction": "bg-amber-100 text-amber-700",
    "Concerning": "bg-amber-100 text-amber-700",
    
    // Danger
    "High": "bg-red-100 text-red-700",
    "Very Restrictive": "bg-red-100 text-red-700",
    "Deeply Inverted": "bg-red-100 text-red-700",
    "Deep Contraction": "bg-red-100 text-red-700",
    "Crisis": "bg-red-100 text-red-700",
    "Recession": "bg-red-100 text-red-700",
    "Stressed": "bg-red-100 text-red-700",
    
    // Low/Deflationary
    "Crisis/ZIRP": "bg-purple-100 text-purple-700",
    "Deflation Risk": "bg-purple-100 text-purple-700",
    "Below Target": "bg-blue-100 text-blue-700",
    "Extremely Low": "bg-blue-100 text-blue-700",
    "Very Low": "bg-blue-100 text-blue-700",
    "Very Tight": "bg-amber-100 text-amber-700",
  };
  return colors[label] || "bg-gray-100 text-gray-700";
}

// Category icons
const categoryIcons: Record<string, string> = {
  rates: "📈",
  inflation: "🔥",
  employment: "👷",
  growth: "🏭",
  sentiment: "🎭",
  credit: "💳",
};

const categoryLabels: Record<string, string> = {
  rates: "Interest Rates",
  inflation: "Inflation",
  employment: "Employment",
  growth: "Economic Growth",
  sentiment: "Sentiment",
  credit: "Credit Markets",
};

async function fetchMacroData() {
  // In production, this would fetch from the API
  // For now, return the indicators with null data
  const baseUrl = process.env.VERCEL_URL 
    ? `https://${process.env.VERCEL_URL}` 
    : process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
  
  try {
    const res = await fetch(`${baseUrl}/api/macro`, { 
      next: { revalidate: 3600 },
      headers: { 'Content-Type': 'application/json' },
    });
    if (res.ok) {
      return res.json();
    }
  } catch (e) {
    console.error('Error fetching macro data:', e);
  }
  
  // Fallback: return indicators without live data
  return {
    status: "offline",
    indicators: MACRO_INDICATORS.map(ind => ({
      ...ind,
      data: null,
      interpretation: null,
      percentile: null,
    })),
  };
}

export default async function MacroDashboardPage() {
  const macroData = await fetchMacroData();
  const { indicators, status, lastUpdated } = macroData;

  // Group by category
  const grouped = indicators.reduce((acc: Record<string, typeof indicators>, ind: typeof indicators[0]) => {
    if (!acc[ind.category]) acc[ind.category] = [];
    acc[ind.category].push(ind);
    return acc;
  }, {});

  const categoryOrder = ["rates", "inflation", "employment", "growth", "credit"];

  return (
    <>
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">🌍 Macro Dashboard</h1>
            <p className="text-sm text-gray-500 mt-1">
              Key economic indicators and what they mean for markets
            </p>
          </div>
          {status === "demo" && (
            <div className="text-xs bg-amber-100 text-amber-700 px-3 py-1 rounded-full">
              ⚠️ Demo Mode — Add FRED_API_KEY for live data
            </div>
          )}
          {lastUpdated && status === "live" && (
            <div className="text-xs text-gray-400">
              Updated: {new Date(lastUpdated).toLocaleString()}
            </div>
          )}
        </div>
      </div>

      {/* Legend */}
      <div className="card mb-6 p-4">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">How to Read This Dashboard</h2>
        <div className="flex flex-wrap gap-3 text-xs">
          <span className="bg-emerald-100 text-emerald-700 px-2 py-1 rounded">🟢 Favorable / Goldilocks</span>
          <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded">🔵 Accommodative / Supportive</span>
          <span className="bg-gray-100 text-gray-700 px-2 py-1 rounded">⚪ Neutral</span>
          <span className="bg-amber-100 text-amber-700 px-2 py-1 rounded">🟡 Caution / Watch</span>
          <span className="bg-red-100 text-red-700 px-2 py-1 rounded">🔴 Concern / Restrictive</span>
        </div>
      </div>

      {/* Indicators by Category */}
      {categoryOrder.map((category) => {
        const categoryIndicators = grouped[category];
        if (!categoryIndicators?.length) return null;

        return (
          <div key={category} className="mb-8">
            <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <span>{categoryIcons[category]}</span>
              {categoryLabels[category]}
            </h2>
            
            <div className="grid gap-4">
              {categoryIndicators.map((indicator: typeof indicators[0]) => (
                <div key={indicator.id} className="card p-5">
                  {/* Header */}
                  <div className="flex items-start justify-between gap-4 mb-4">
                    <div className="flex-1">
                      <h3 className="font-semibold text-gray-900">{indicator.name}</h3>
                      <p className="text-sm text-gray-500 mt-1">{indicator.description}</p>
                    </div>
                    
                    {/* Current Value + Status */}
                    <div className="text-right flex-shrink-0">
                      {indicator.data ? (
                        <>
                          <div className="text-2xl font-bold text-gray-900">
                            {indicator.data.current}{indicator.unit === "%" || indicator.unit === "% YoY" ? "%" : ""}
                            {indicator.unit === "bps" && " bps"}
                            {indicator.unit === "thousands" && "K"}
                          </div>
                          {indicator.interpretation && (
                            <span className={`inline-block mt-1 text-xs px-2 py-0.5 rounded-full ${getStatusColor(indicator.interpretation.label)}`}>
                              {indicator.interpretation.label}
                            </span>
                          )}
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
                          className={`flex items-center gap-3 text-sm p-2 rounded ${
                            indicator.interpretation?.label === range.label 
                              ? getStatusColor(range.label) + " ring-2 ring-offset-1 ring-gray-300" 
                              : "bg-gray-50"
                          }`}
                        >
                          <span className="font-medium w-32 flex-shrink-0">{range.label}</span>
                          <span className="text-gray-500 w-24 flex-shrink-0">
                            {range.min !== null ? range.min : "<"}{range.min !== null && range.max !== null ? " – " : ""}{range.max !== null ? range.max : "+"}
                          </span>
                          <span className="text-gray-600 flex-1">{range.meaning}</span>
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
