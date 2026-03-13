"use client";

import { useState, useEffect, useMemo } from "react";
import { ChevronRight, TrendingUp, TrendingDown, Minus, RefreshCw } from "lucide-react";
import { Skeleton } from "@/components/Skeleton";

interface GexStrike {
  strike: number;
  callGex: number;
  putGex: number;
  totalGex: number;
}

interface GexData {
  symbol: string;
  spotPrice: number;
  totalGex: number;
  totalGexFormatted: string;
  callGex: number;
  putGex: number;
  interpretation: {
    label: string;
    meaning: string;
    marketImpact: string;
    color: 'green' | 'amber' | 'red';
  };
  byStrike: GexStrike[];
  maxPainStrike: number | null;
  flipZone: number | null;
  expirationDate: string;
  lastUpdated: string;
}

interface GexChartProps {
  expanded: boolean;
  onToggle: () => void;
}

const SYMBOLS = ["SPY", "QQQ", "HYG", "IWM"];

function formatGexValue(value: number): string {
  const absValue = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  
  if (absValue >= 1e9) {
    return `${sign}${(absValue / 1e9).toFixed(1)}B`;
  } else if (absValue >= 1e6) {
    return `${sign}${(absValue / 1e6).toFixed(1)}M`;
  } else if (absValue >= 1e3) {
    return `${sign}${(absValue / 1e3).toFixed(0)}K`;
  }
  return `${sign}${absValue.toFixed(0)}`;
}

export function GexChart({ expanded, onToggle }: GexChartProps) {
  const [selectedSymbol, setSelectedSymbol] = useState("SPY");
  const [data, setData] = useState<GexData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchGex = async (symbol: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/markets/gex?symbol=${symbol}`);
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Failed to fetch GEX");
      }
      const gexData = await res.json();
      setData(gexData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGex(selectedSymbol);
  }, [selectedSymbol]);

  // Calculate max value for bar scaling
  const maxAbsGex = useMemo(() => {
    if (!data?.byStrike.length) return 1;
    return Math.max(
      ...data.byStrike.map(s => Math.max(Math.abs(s.callGex), Math.abs(s.putGex)))
    );
  }, [data]);

  const colorClass = data?.interpretation.color === 'green'
    ? 'bg-emerald-100 text-emerald-700'
    : data?.interpretation.color === 'red'
    ? 'bg-red-100 text-red-700'
    : 'bg-amber-100 text-amber-700';

  const TrendIcon = data?.totalGex && data.totalGex > 0 
    ? TrendingUp 
    : data?.totalGex && data.totalGex < 0 
    ? TrendingDown 
    : Minus;

  return (
    <div className="border-t border-gray-100">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-gray-50 transition-colors"
      >
        <ChevronRight
          className={`w-3 h-3 text-gray-400 transition-transform shrink-0 ${expanded ? "rotate-90" : ""}`}
        />
        <span className="text-xs font-medium text-gray-900 flex-1 min-w-0 truncate">
          Gamma Exposure (GEX)
        </span>
        {loading ? (
          <Skeleton className="h-4 w-16 !bg-gray-100" />
        ) : data ? (
          <>
            <span className="text-xs font-bold tabular-nums text-gray-900 shrink-0 flex items-center gap-1">
              <TrendIcon className={`w-3 h-3 ${data.totalGex > 0 ? 'text-emerald-500' : data.totalGex < 0 ? 'text-red-500' : 'text-gray-400'}`} />
              {data.totalGexFormatted}
            </span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full shrink-0 ${colorClass}`}>
              {data.interpretation.label}
            </span>
          </>
        ) : (
          <span className="text-xs text-gray-400">N/A</span>
        )}
      </button>

      {expanded && (
        <div className="px-3 pb-3 pt-2 bg-gray-50/50 border-t border-gray-100">
          {/* Symbol selector */}
          <div className="flex items-center gap-2 mb-3">
            {SYMBOLS.map((sym) => (
              <button
                key={sym}
                onClick={() => setSelectedSymbol(sym)}
                className={`text-[10px] px-2 py-1 rounded-full transition-colors ${
                  selectedSymbol === sym
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {sym}
              </button>
            ))}
            <button
              onClick={() => fetchGex(selectedSymbol)}
              className="ml-auto text-gray-400 hover:text-gray-600 p-1"
              title="Refresh"
            >
              <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-4 w-full !bg-gray-100" />
              <Skeleton className="h-32 w-full !bg-gray-100" />
            </div>
          ) : error ? (
            <p className="text-xs text-red-500">{error}</p>
          ) : data ? (
            <>
              {/* Summary stats */}
              <div className="grid grid-cols-3 gap-2 mb-3">
                <div className="bg-white rounded-lg p-2 text-center">
                  <div className="text-[10px] text-gray-500 mb-0.5">Spot</div>
                  <div className="text-xs font-bold text-gray-900">${data.spotPrice}</div>
                </div>
                <div className="bg-white rounded-lg p-2 text-center">
                  <div className="text-[10px] text-gray-500 mb-0.5">Max Pain</div>
                  <div className="text-xs font-bold text-gray-900">
                    {data.maxPainStrike ? `$${data.maxPainStrike}` : 'N/A'}
                  </div>
                </div>
                <div className="bg-white rounded-lg p-2 text-center">
                  <div className="text-[10px] text-gray-500 mb-0.5">Flip Zone</div>
                  <div className="text-xs font-bold text-gray-900">
                    {data.flipZone ? `$${data.flipZone}` : 'N/A'}
                  </div>
                </div>
              </div>

              {/* GEX bar chart */}
              <div className="bg-white rounded-lg p-2 mb-3">
                <div className="text-[10px] text-gray-500 mb-2 flex justify-between">
                  <span>GEX by Strike</span>
                  <span className="flex items-center gap-2">
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 bg-emerald-400 rounded-sm" /> Calls
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 bg-red-400 rounded-sm" /> Puts
                    </span>
                  </span>
                </div>
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {data.byStrike.slice(-15).map((strike) => {
                    const isSpot = Math.abs(strike.strike - data.spotPrice) < data.spotPrice * 0.01;
                    return (
                      <div key={strike.strike} className="flex items-center gap-1 text-[9px]">
                        <span className={`w-10 text-right tabular-nums shrink-0 ${isSpot ? 'font-bold text-blue-600' : 'text-gray-500'}`}>
                          ${strike.strike}
                        </span>
                        <div className="flex-1 flex items-center h-3">
                          {/* Put bar (negative direction) */}
                          <div className="w-1/2 flex justify-end">
                            {strike.putGex !== 0 && (
                              <div
                                className="h-2.5 bg-red-400 rounded-sm"
                                style={{ width: `${(Math.abs(strike.putGex) / maxAbsGex) * 100}%` }}
                                title={`Put: ${formatGexValue(strike.putGex)}`}
                              />
                            )}
                          </div>
                          {/* Center line */}
                          <div className="w-px h-3 bg-gray-300 mx-0.5" />
                          {/* Call bar (positive direction) */}
                          <div className="w-1/2">
                            {strike.callGex !== 0 && (
                              <div
                                className="h-2.5 bg-emerald-400 rounded-sm"
                                style={{ width: `${(Math.abs(strike.callGex) / maxAbsGex) * 100}%` }}
                                title={`Call: ${formatGexValue(strike.callGex)}`}
                              />
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Interpretation */}
              <div className={`rounded-lg p-2.5 ${
                data.interpretation.color === 'green' 
                  ? 'bg-emerald-50' 
                  : data.interpretation.color === 'red'
                  ? 'bg-red-50'
                  : 'bg-amber-50'
              }`}>
                <h4 className={`text-[10px] font-semibold uppercase tracking-wide mb-1 ${
                  data.interpretation.color === 'green'
                    ? 'text-emerald-600'
                    : data.interpretation.color === 'red'
                    ? 'text-red-600'
                    : 'text-amber-600'
                }`}>
                  {data.interpretation.label}
                </h4>
                <p className="text-[10px] text-gray-700 mb-0.5">
                  <strong>Meaning:</strong> {data.interpretation.meaning}
                </p>
                <p className="text-[10px] text-gray-700">
                  <strong>Market Impact:</strong> {data.interpretation.marketImpact}
                </p>
              </div>

              {/* Educational note */}
              <div className="mt-2 bg-gray-50 rounded-lg p-2.5">
                <h4 className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">
                  What is GEX?
                </h4>
                <p className="text-[10px] text-gray-600">
                  Gamma Exposure measures dealer hedging flows. <strong>Negative GEX</strong> means 
                  dealers amplify price moves (higher volatility). <strong>Positive GEX</strong> means 
                  dealers stabilize prices (lower volatility, mean reversion).
                </p>
              </div>
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}
