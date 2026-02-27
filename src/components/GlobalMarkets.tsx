"use client";

import { useState, useEffect } from "react";
import { TrendingUp, TrendingDown, Minus, RefreshCw, Globe } from "lucide-react";
import { GlobalMarketsSkeleton } from "@/components/Skeleton";
import {
  MarketData,
  BenchmarkData,
  formatPercent,
  getPercentColor,
  GlobalMarketsTable,
} from "./global-markets";

const REGIONS = ["all", "Americas", "Europe", "Asia Pacific", "Global"];

export function GlobalMarkets() {
  const [markets, setMarkets] = useState<MarketData[]>([]);
  const [benchmark, setBenchmark] = useState<BenchmarkData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [regionFilter, setRegionFilter] = useState<string>("all");

  const fetchData = async (showRefreshing = false) => {
    if (showRefreshing) setRefreshing(true);
    try {
      const res = await fetch("/api/markets/momentum");
      const data = await res.json();

      if (data.error) {
        setError(data.error);
      } else {
        setMarkets(data.markets || []);
        setBenchmark(data.benchmark || null);
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

  const filteredMarkets =
    regionFilter === "all"
      ? markets
      : markets.filter((m) => m.region === regionFilter);

  if (loading) {
    return <GlobalMarketsSkeleton />;
  }

  if (error) {
    return (
      <div className="card">
        <div className="text-center py-8 text-red-600">
          <p>Failed to load market data</p>
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <Globe className="w-5 h-5" />
            Global Markets
          </h2>
          <p className="text-sm text-gray-500">Country/region ETFs ranked by momentum</p>
        </div>
        <div className="flex items-center gap-3">
          {benchmark && (
            <div className="text-sm text-gray-600">
              VT:{" "}
              <span className={getPercentColor(benchmark.change_1m)}>
                {formatPercent(benchmark.change_1m)}
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

      {/* Region Filter */}
      <div className="flex gap-2 flex-wrap">
        {REGIONS.map((region) => (
          <button
            key={region}
            onClick={() => setRegionFilter(region)}
            className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
              regionFilter === region
                ? "bg-emerald-100 text-emerald-700"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {region === "all" ? "All Regions" : region}
          </button>
        ))}
      </div>

      {/* Markets Table */}
      <GlobalMarketsTable markets={filteredMarkets} />

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 text-xs text-gray-500">
        <div className="flex items-center gap-1">
          <TrendingUp className="w-3 h-3 text-emerald-600" />
          <span>Accelerating</span>
        </div>
        <div className="flex items-center gap-1">
          <TrendingDown className="w-3 h-3 text-red-600" />
          <span>Decelerating</span>
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
