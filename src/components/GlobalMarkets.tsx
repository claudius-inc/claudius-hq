"use client";

import { useState, useEffect } from "react";
import { TrendingUp, TrendingDown, Minus, RefreshCw } from "lucide-react";
import { PageHero } from "@/components/PageHero";
import { GlobalMarketsSkeleton } from "@/components/Skeleton";
import {
  MarketData,
  BenchmarkData,
  formatPercent,
  getPercentColor,
  GlobalMarketsTable,
} from "./global-markets";
import { SectorData, MarketBenchmark, SectorTable } from "./sectors";

function sectorsToMarketData(sectors: SectorData[]): MarketData[] {
  return sectors.map((s) => ({
    ...s,
    region: "USA",
  }));
}

const REGIONS = ["all", "USA", "Americas", "Europe", "Asia Pacific", "Global"];

export function GlobalMarkets({ hideHero = false }: { hideHero?: boolean } = {}) {
  const [markets, setMarkets] = useState<MarketData[]>([]);
  const [benchmark, setBenchmark] = useState<BenchmarkData | null>(null);
  const [sectors, setSectors] = useState<SectorData[]>([]);
  const [sectorBenchmark, setSectorBenchmark] = useState<MarketBenchmark | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [regionFilter, setRegionFilter] = useState<string>("all");

  const fetchData = async (showRefreshing = false) => {
    if (showRefreshing) setRefreshing(true);
    try {
      const [marketsRes, sectorsRes] = await Promise.all([
        fetch("/api/markets/momentum"),
        fetch("/api/sectors/momentum"),
      ]);
      const [marketsData, sectorsData] = await Promise.all([
        marketsRes.json(),
        sectorsRes.json(),
      ]);

      if (marketsData.error) {
        setError(marketsData.error);
      } else {
        setMarkets(marketsData.markets || []);
        setBenchmark(marketsData.benchmark || null);
        setUpdatedAt(marketsData.updated_at || null);
        setError(null);
      }

      if (!sectorsData.error) {
        setSectors(sectorsData.sectors || []);
        setSectorBenchmark(sectorsData.market || null);
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

  const sectorsAsMarkets = sectorsToMarketData(sectors);

  const filteredMarkets =
    regionFilter === "all"
      ? [...markets, ...sectorsAsMarkets]
      : regionFilter === "USA"
        ? sectorsAsMarkets
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
    <>
      {!hideHero && (
        <PageHero
          title="Sectors"
          subtitle="US sectors and global country ETFs ranked by momentum"
          actionSlot={
            <div className="flex items-center gap-3 shrink-0">
              {regionFilter === "USA" ? (
                sectorBenchmark && (
                  <div className="text-sm text-gray-600">
                    SPY:{" "}
                    <span className={getPercentColor(sectorBenchmark.change_1m)}>
                      {formatPercent(sectorBenchmark.change_1m)}
                    </span>{" "}
                    (1M)
                  </div>
                )
              ) : (
                benchmark && (
                  <div className="text-sm text-gray-600">
                    VT:{" "}
                    <span className={getPercentColor(benchmark.change_1m)}>
                      {formatPercent(benchmark.change_1m)}
                    </span>{" "}
                    (1M)
                  </div>
                )
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
          }
        />
      )}
    <div className="space-y-4">
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
      {regionFilter === "USA" ? (
        <SectorTable sectors={sectors} />
      ) : (
        <GlobalMarketsTable markets={filteredMarkets} />
      )}

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
    </>
  );
}
