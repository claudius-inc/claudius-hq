"use client";

import { useState, useEffect, useCallback } from "react";
import { PageHero } from "@/components/PageHero";
import { RefreshCw, TrendingUp, TrendingDown, AlertTriangle, Shield, Flame, Landmark, Globe, Scale } from "lucide-react";
import { detectRegime } from "../_components/helpers";

interface RegimePageData {
  indicators: {
    realYield: number | null;
    nominalGrowth: number | null;
    debtToGdp: number | null;
    deficitToGdp: number | null;
    m2Growth: number | null;
    dxy: number | null;
  };
  assets: {
    gold: { price: number; ytd: number } | null;
    tlt: { price: number; ytd: number } | null;
    btc: { price: number; ytd: number } | null;
    spy: { price: number; ytd: number } | null;
  };
}

export function RegimeContent() {
  const [data, setData] = useState<RegimePageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      // Fetch from multiple endpoints
      const [macroRes, goldRes] = await Promise.all([
        fetch("/api/macro"),
        fetch("/api/gold"),
      ]);
      
      const macroData = macroRes.ok ? await macroRes.json() : {};
      const goldData = goldRes.ok ? await goldRes.json() : {};
      
      // Extract relevant indicators
      const indicators = macroData.indicators || [];
      const findIndicator = (id: string) => {
        const ind = indicators.find((i: { id: string; data?: { current: number } }) => i.id === id);
        return ind?.data?.current ?? null;
      };
      
      // FRED deficit data is negative (surplus positive), convert to positive deficit
      const rawDeficit = findIndicator("deficit-to-gdp");
      const deficitAsPositive = rawDeficit !== null ? Math.abs(rawDeficit) : null;
      
      setData({
        indicators: {
          realYield: goldData.realYields?.value ?? null,
          nominalGrowth: findIndicator("gdp_growth"),
          debtToGdp: findIndicator("debt-to-gdp"),
          deficitToGdp: deficitAsPositive,
          m2Growth: findIndicator("m2_growth"),
          dxy: goldData.dxy?.price ?? null,
        },
        assets: {
          gold: goldData.livePrice ? { price: goldData.livePrice, ytd: 12 } : null,
          tlt: null, // Would need to fetch
          btc: null,
          spy: null,
        },
      });
    } catch (e) {
      console.error("Failed to fetch regime data:", e);
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

  if (loading) {
    return (
      <div className="space-y-6">
        {/* Regime Banner skeleton */}
        <div className="card p-6 animate-pulse border-2 border-gray-200">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-6 h-6 bg-gray-200 rounded" />
            <div>
              <div className="h-6 bg-gray-200 rounded w-48 mb-2" />
              <div className="h-4 bg-gray-200 rounded w-64" />
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-8 bg-gray-100 rounded" />
            ))}
          </div>
        </div>
        
        {/* Indicators card skeleton */}
        <div className="card p-6 animate-pulse">
          <div className="h-5 bg-gray-200 rounded w-56 mb-4" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="bg-gray-50 rounded-lg p-4">
                <div className="h-3 bg-gray-200 rounded w-16 mb-2" />
                <div className="h-8 bg-gray-200 rounded w-20 mb-1" />
                <div className="h-3 bg-gray-200 rounded w-24" />
              </div>
            ))}
          </div>
          {/* Meter skeleton */}
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="flex justify-between mb-2">
              <div className="h-4 bg-gray-200 rounded w-32" />
              <div className="h-4 bg-gray-200 rounded w-16" />
            </div>
            <div className="h-3 bg-gray-200 rounded-full" />
          </div>
        </div>
        
        {/* Historical + Asset Performance skeleton */}
        <div className="card p-6 animate-pulse">
          <div className="h-5 bg-gray-200 rounded w-40 mb-4" />
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-4 bg-gray-200 rounded w-full" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  const regime = data ? detectRegime(data.indicators) : null;

  return (
    <>
      <PageHero
        title="Regime Analysis"
        subtitle="Track monetary regime shifts and financial repression"
        actions={[
          {
            label: refreshing ? "Refreshing..." : "Refresh",
            onClick: handleRefresh,
            disabled: refreshing,
            icon: <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />,
          },
        ]}
      />

      {/* Current Regime Banner */}
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

      {/* Financial Repression Indicators */}
      <div className="card p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Scale className="w-5 h-5 text-gray-500" />
          Financial Repression Indicators
        </h2>
        
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <IndicatorCard
            label="Real Yield"
            value={data?.indicators.realYield ?? null}
            format={(v) => `${v.toFixed(2)}%`}
            threshold={{ danger: 0, warning: 1 }}
            inverse
            description="10Y yield minus CPI"
          />
          <IndicatorCard
            label="Debt/GDP"
            value={data?.indicators.debtToGdp ?? null}
            format={(v) => `${v.toFixed(0)}%`}
            threshold={{ danger: 120, warning: 100 }}
            description="US federal debt"
          />
          <IndicatorCard
            label="Deficit/GDP"
            value={data?.indicators.deficitToGdp ?? null}
            format={(v) => `${v.toFixed(1)}%`}
            threshold={{ danger: 6, warning: 4 }}
            description="Annual fiscal deficit"
          />
          <IndicatorCard
            label="DXY"
            value={data?.indicators.dxy ?? null}
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
              {calculateRepressionLevel(data?.indicators)}
            </span>
          </div>
          <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-emerald-500 via-amber-500 to-red-500 transition-all"
              style={{ width: `${getRepressionPercent(data?.indicators)}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-gray-400 mt-1">
            <span>Sound Money</span>
            <span>Moderate</span>
            <span>Repression</span>
          </div>
        </div>
      </div>

      {/* Historical Context */}
      <div className="card p-6 mb-6">
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

      {/* Asset Performance by Regime */}
      <div className="card p-6 mb-6">
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

      {/* War Overlay */}
      <div className="card p-6 mb-6">
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
              <li>• Russia-Ukraine (2022-)</li>
              <li>• Israel-Gaza (2023-)</li>
              <li>• Red Sea disruption</li>
              <li>• Taiwan tensions</li>
            </ul>
          </div>
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="text-sm font-medium text-gray-900 mb-2">Fiscal Impact</div>
            <ul className="text-sm text-gray-600 space-y-1">
              <li>• Defense spending ↑</li>
              <li>• Supply chain inflation</li>
              <li>• Energy price volatility</li>
              <li>• De-dollarization pressure</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Playbook */}
      <div className="card p-6">
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
    </>
  );
}

// Helper Components
function IndicatorCard({
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

function calculateRepressionLevel(indicators: RegimePageData["indicators"] | undefined): string {
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

function getRepressionPercent(indicators: RegimePageData["indicators"] | undefined): number {
  if (!indicators) return 0;
  const { realYield, debtToGdp, deficitToGdp } = indicators;
  
  let score = 0;
  if (realYield !== null) score += Math.max(0, Math.min(33, (0 - realYield) * 16.5));
  if (debtToGdp !== null) score += Math.max(0, Math.min(33, (debtToGdp - 80) * 0.83));
  if (deficitToGdp !== null) score += Math.max(0, Math.min(34, deficitToGdp * 5));
  
  return Math.min(100, score);
}
