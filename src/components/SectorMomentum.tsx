"use client";

import { useState, useEffect } from "react";
import { TrendingUp, TrendingDown, Minus, RefreshCw } from "lucide-react";
import { SectorMomentumSkeleton } from "@/components/Skeleton";
import { SectorData, MarketBenchmark, formatPercent, getPercentColor, SectorTable } from "./sectors";

export function SectorMomentum() {
  const [sectors, setSectors] = useState<SectorData[]>([]);
  const [market, setMarket] = useState<MarketBenchmark | null>(null);
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
    return <SectorMomentumSkeleton />;
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
              SPY:{" "}
              <span className={getPercentColor(market.change_1m)}>
                {formatPercent(market.change_1m)}
              </span>{" "}
              (1M)
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
      <SectorTable sectors={sectors} />

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
          <div className="ml-auto">Updated: {new Date(updatedAt).toLocaleTimeString()}</div>
        )}
      </div>
    </div>
  );
}
