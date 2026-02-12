"use client";

import { useState, useEffect } from "react";
import { TrendingUp, TrendingDown, Minus, RefreshCw, ExternalLink } from "lucide-react";

interface SectorData {
  id: string;
  name: string;
  ticker: string;
  price: number | null;
  change_1d: number | null;
  change_1w: number | null;
  change_1m: number | null;
  change_3m: number | null;
  change_6m: number | null;
  composite_score: number | null;
  relative_strength_1m: number | null;
  momentum_trend: "accelerating" | "decelerating" | "stable" | null;
}

interface MarketData {
  ticker: string;
  change_1w: number | null;
  change_1m: number | null;
  change_3m: number | null;
}

function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined) return "-";
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

function getPercentColor(value: number | null | undefined): string {
  if (value === null || value === undefined) return "text-gray-400";
  if (value > 0) return "text-emerald-600";
  if (value < 0) return "text-red-600";
  return "text-gray-600";
}

function getPercentBg(value: number | null | undefined): string {
  if (value === null || value === undefined) return "bg-gray-100";
  if (value > 3) return "bg-emerald-100";
  if (value > 0) return "bg-emerald-50";
  if (value < -3) return "bg-red-100";
  if (value < 0) return "bg-red-50";
  return "bg-gray-50";
}

function MomentumTrendIcon({ trend }: { trend: SectorData["momentum_trend"] }) {
  if (trend === "accelerating") {
    return <span title="Accelerating"><TrendingUp className="w-4 h-4 text-emerald-600" /></span>;
  }
  if (trend === "decelerating") {
    return <span title="Decelerating"><TrendingDown className="w-4 h-4 text-red-600" /></span>;
  }
  if (trend === "stable") {
    return <span title="Stable"><Minus className="w-4 h-4 text-gray-400" /></span>;
  }
  return null;
}

function RelativeStrengthBar({ value }: { value: number | null }) {
  if (value === null) return <span className="text-gray-400">-</span>;
  
  const maxWidth = 60;
  const absValue = Math.min(Math.abs(value), 10);
  const width = (absValue / 10) * maxWidth;
  const isPositive = value >= 0;
  
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-2 bg-gray-200 rounded-full overflow-hidden relative">
        <div className="absolute inset-y-0 left-1/2 w-px bg-gray-300" />
        {isPositive ? (
          <div
            className="absolute inset-y-0 left-1/2 bg-emerald-500 rounded-r-full"
            style={{ width: `${width / 2}px` }}
          />
        ) : (
          <div
            className="absolute inset-y-0 right-1/2 bg-red-500 rounded-l-full"
            style={{ width: `${width / 2}px` }}
          />
        )}
      </div>
      <span className={`text-xs font-medium ${isPositive ? "text-emerald-600" : "text-red-600"}`}>
        {isPositive ? "+" : ""}{value.toFixed(1)}%
      </span>
    </div>
  );
}

export function SectorMomentum() {
  const [sectors, setSectors] = useState<SectorData[]>([]);
  const [market, setMarket] = useState<MarketData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = async (showRefreshing = false) => {
    if (showRefreshing) setRefreshing(true);
    try {
      const res = await fetch("/api/sectors/momentum");
      const data = await res.json();
      
      if (data.error) {
        setError(data.error);
      } else {
        setSectors(data.sectors || []);
        setMarket(data.market || null);
        setUpdatedAt(data.updated_at || null);
        setError(null);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="card">
        <div className="flex items-center justify-center py-12">
          <div className="h-6 w-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card">
        <div className="text-center py-8 text-red-600">
          <p>Failed to load sector data</p>
          <p className="text-sm text-gray-500 mt-1">{error}</p>
          <button onClick={() => fetchData(true)} className="btn-secondary mt-4">
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Sector Momentum</h2>
          <p className="text-sm text-gray-500">
            Ranked by composite score (1W×20% + 1M×50% + 3M×30%)
          </p>
        </div>
        <div className="flex items-center gap-3">
          {market && (
            <div className="text-sm text-gray-600">
              SPY: <span className={getPercentColor(market.change_1m)}>{formatPercent(market.change_1m)}</span> (1M)
            </div>
          )}
          <button
            onClick={() => fetchData(true)}
            disabled={refreshing}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Sector Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-8">
                  #
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Sector
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  1D
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  1W
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  1M
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  3M
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Trend
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  vs SPY
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Score
                </th>
                <th className="px-4 py-3 w-10"></th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {sectors.map((sector, idx) => (
                <tr key={sector.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                    {idx + 1}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div>
                      <div className="font-semibold text-gray-900">{sector.name}</div>
                      <div className="text-xs text-gray-500">{sector.ticker}</div>
                    </div>
                  </td>
                  <td className={`px-4 py-3 whitespace-nowrap text-right text-sm font-medium ${getPercentColor(sector.change_1d)}`}>
                    {formatPercent(sector.change_1d)}
                  </td>
                  <td className={`px-4 py-3 whitespace-nowrap text-right text-sm font-medium ${getPercentColor(sector.change_1w)}`}>
                    {formatPercent(sector.change_1w)}
                  </td>
                  <td className={`px-4 py-3 whitespace-nowrap text-right text-sm font-medium ${getPercentColor(sector.change_1m)}`}>
                    {formatPercent(sector.change_1m)}
                  </td>
                  <td className={`px-4 py-3 whitespace-nowrap text-right text-sm font-medium ${getPercentColor(sector.change_3m)}`}>
                    {formatPercent(sector.change_3m)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-center">
                    <MomentumTrendIcon trend={sector.momentum_trend} />
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <RelativeStrengthBar value={sector.relative_strength_1m} />
                  </td>
                  <td className={`px-4 py-3 whitespace-nowrap text-right`}>
                    <span className={`inline-flex items-center px-2 py-1 rounded-md text-sm font-bold ${getPercentBg(sector.composite_score)} ${getPercentColor(sector.composite_score)}`}>
                      {sector.composite_score !== null ? sector.composite_score.toFixed(1) : "-"}
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <a
                      href={`https://www.tradingview.com/chart/?symbol=${sector.ticker}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1 text-gray-400 hover:text-gray-600 inline-block"
                      title="View on TradingView"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 text-xs text-gray-500">
        <div className="flex items-center gap-1">
          <TrendingUp className="w-3 h-3 text-emerald-600" />
          <span>Accelerating (1W outpacing 1M)</span>
        </div>
        <div className="flex items-center gap-1">
          <TrendingDown className="w-3 h-3 text-red-600" />
          <span>Decelerating (1W lagging 1M)</span>
        </div>
        <div className="flex items-center gap-1">
          <Minus className="w-3 h-3 text-gray-400" />
          <span>Stable</span>
        </div>
        {updatedAt && (
          <div className="ml-auto">
            Updated: {new Date(updatedAt).toLocaleTimeString()}
          </div>
        )}
      </div>
    </div>
  );
}
