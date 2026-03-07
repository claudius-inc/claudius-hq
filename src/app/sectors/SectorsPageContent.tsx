"use client";

import { useState, useEffect, useCallback } from "react";
import { PageHero } from "@/components/PageHero";
import { SectorTable } from "@/components/sectors/SectorTable";
import { ThemesTab } from "@/components/ThemesTab";
import { GoldContent } from "@/app/markets/gold/GoldContent";
import { BtcContent } from "@/app/markets/btc/BtcContent";
import { OilPriceCard, OilKeyLevels, OilContext, OilData } from "@/components/oil";
import { RefreshCw, TrendingUp, TrendingDown, Minus, Zap, BarChart3, Layers, Gem, Droplets, Bitcoin } from "lucide-react";
import { formatCacheAge } from "@/lib/market-cache";
import { SectorData, MarketBenchmark, formatPercent, getPercentColor } from "@/components/sectors";

// ============================================================================
// Types
// ============================================================================

interface TrendingItem {
  name: string;
  type: "sector" | "theme" | "commodity" | "crypto";
  ticker?: string;
  price: number | null;
  change1w: number | null;
  change1wPrev: number | null;
  acceleration: number | null;
  trend: "accelerating" | "decelerating" | "stable";
}

// ============================================================================
// Trending Now Component
// ============================================================================

function TrendingNow({
  items,
  loading,
  updatedAt,
  isStale,
}: {
  items: TrendingItem[];
  loading: boolean;
  updatedAt: string | null;
  isStale: boolean;
}) {
  if (loading) {
    return (
      <div className="card p-5 mb-6 animate-pulse">
        <div className="h-5 bg-gray-200 rounded w-40 mb-4" />
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="bg-gray-50 rounded-lg p-4">
              <div className="h-4 bg-gray-200 rounded w-24 mb-2" />
              <div className="h-6 bg-gray-200 rounded w-20 mb-1" />
              <div className="h-4 bg-gray-200 rounded w-16" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const getTypeIcon = (type: TrendingItem["type"]) => {
    switch (type) {
      case "sector": return <BarChart3 className="w-3 h-3" />;
      case "theme": return <Layers className="w-3 h-3" />;
      case "commodity": return <Gem className="w-3 h-3" />;
      case "crypto": return <Bitcoin className="w-3 h-3" />;
    }
  };

  const getTypeBg = (type: TrendingItem["type"]) => {
    switch (type) {
      case "sector": return "bg-blue-50 text-blue-700";
      case "theme": return "bg-purple-50 text-purple-700";
      case "commodity": return "bg-amber-50 text-amber-700";
      case "crypto": return "bg-orange-50 text-orange-700";
    }
  };

  const getTrendIcon = (trend: TrendingItem["trend"]) => {
    switch (trend) {
      case "accelerating": return <TrendingUp className="w-4 h-4 text-emerald-600" />;
      case "decelerating": return <TrendingDown className="w-4 h-4 text-red-600" />;
      default: return <Minus className="w-4 h-4 text-gray-400" />;
    }
  };

  return (
    <div className="card p-5 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
          <Zap className="w-5 h-5 text-amber-500" />
          Trending Now
        </h2>
        <div className="flex items-center gap-2 text-xs text-gray-400">
          {isStale && <span className="text-amber-500">Updating...</span>}
          {updatedAt && <span>{formatCacheAge(updatedAt)}</span>}
        </div>
      </div>
      
      <p className="text-sm text-gray-500 mb-4">
        Sorted by momentum acceleration (biggest change vs. previous week)
      </p>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
        {items.slice(0, 10).map((item, idx) => (
          <div
            key={`${item.type}-${item.name}`}
            className={`rounded-lg p-4 border transition-all hover:shadow-md ${
              item.trend === "accelerating"
                ? "border-emerald-200 bg-emerald-50/50"
                : item.trend === "decelerating"
                ? "border-red-200 bg-red-50/50"
                : "border-gray-200 bg-gray-50/50"
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className={`text-xs px-2 py-0.5 rounded-full flex items-center gap-1 ${getTypeBg(item.type)}`}>
                {getTypeIcon(item.type)}
                {item.type}
              </span>
              {getTrendIcon(item.trend)}
            </div>
            
            <h3 className="font-semibold text-gray-900 text-sm mb-1 truncate" title={item.name}>
              {item.name}
            </h3>
            
            <div className={`text-lg font-bold ${getPercentColor(item.change1w)}`}>
              {formatPercent(item.change1w)}
            </div>
            
            {item.acceleration !== null && (
              <div className="text-xs text-gray-500 mt-1">
                Acc: <span className={item.acceleration > 0 ? "text-emerald-600" : "text-red-600"}>
                  {item.acceleration > 0 ? "+" : ""}{item.acceleration.toFixed(1)}%
                </span>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// Section Header Component
// ============================================================================

function SectionHeader({
  icon,
  title,
  id,
}: {
  icon: React.ReactNode;
  title: string;
  id: string;
}) {
  return (
    <h2 id={id} className="text-xl font-semibold text-gray-900 mb-4 flex items-center gap-2 scroll-mt-20">
      {icon}
      {title}
    </h2>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function SectorsPageContent() {
  // Trending data
  const [trendingItems, setTrendingItems] = useState<TrendingItem[]>([]);
  const [trendingLoading, setTrendingLoading] = useState(true);
  const [trendingUpdatedAt, setTrendingUpdatedAt] = useState<string | null>(null);
  const [trendingStale, setTrendingStale] = useState(false);

  // Sector data
  const [sectors, setSectors] = useState<SectorData[]>([]);
  const [market, setMarket] = useState<MarketBenchmark | null>(null);
  const [sectorsLoading, setSectorsLoading] = useState(true);
  const [sectorsUpdatedAt, setSectorsUpdatedAt] = useState<string | null>(null);

  // Oil data
  const [oilData, setOilData] = useState<OilData | null>(null);
  const [oilLoading, setOilLoading] = useState(true);

  // Refresh state
  const [refreshing, setRefreshing] = useState(false);

  // Fetch trending data
  const fetchTrending = useCallback(async () => {
    try {
      const res = await fetch("/api/trending");
      if (res.ok) {
        const data = await res.json();
        setTrendingItems(data.items || []);
        setTrendingUpdatedAt(data.updatedAt);
        setTrendingStale(data.isStale || false);
      }
    } catch (e) {
      console.error("Error fetching trending:", e);
    } finally {
      setTrendingLoading(false);
    }
  }, []);

  // Fetch sector data
  const fetchSectors = useCallback(async () => {
    try {
      const res = await fetch("/api/sectors/momentum");
      if (res.ok) {
        const data = await res.json();
        setSectors(data.sectors || []);
        setMarket(data.market || null);
        setSectorsUpdatedAt(data.updated_at);
      }
    } catch (e) {
      console.error("Error fetching sectors:", e);
    } finally {
      setSectorsLoading(false);
    }
  }, []);

  // Fetch oil data
  const fetchOil = useCallback(async () => {
    try {
      const res = await fetch("/api/oil");
      if (res.ok) {
        const data = await res.json();
        setOilData(data);
      }
    } catch (e) {
      console.error("Error fetching oil:", e);
    } finally {
      setOilLoading(false);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchTrending();
    fetchSectors();
    fetchOil();
  }, [fetchTrending, fetchSectors, fetchOil]);

  // Refresh all
  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([
      fetchTrending(),
      fetchSectors(),
      fetchOil(),
    ]);
    setRefreshing(false);
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <PageHero
        title="Sectors & Themes"
        subtitle="Track sector rotation, investment themes, commodities, and crypto"
        actions={[
          {
            label: refreshing ? "Refreshing..." : "Refresh All",
            onClick: handleRefresh,
            disabled: refreshing,
            icon: <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />,
          },
        ]}
      />

      {/* Quick Nav */}
      <div className="flex flex-wrap gap-2 mb-6">
        {[
          { id: "trending", label: "Trending" },
          { id: "sectors", label: "Sectors" },
          { id: "themes", label: "Themes" },
          { id: "gold", label: "Gold" },
          { id: "oil", label: "Oil" },
          { id: "crypto", label: "Crypto" },
        ].map((item) => (
          <a
            key={item.id}
            href={`#${item.id}`}
            className="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded-full hover:bg-gray-200 transition-colors"
          >
            {item.label}
          </a>
        ))}
      </div>

      {/* ============================================================ */}
      {/* TRENDING NOW */}
      {/* ============================================================ */}
      <section id="trending">
        <TrendingNow
          items={trendingItems}
          loading={trendingLoading}
          updatedAt={trendingUpdatedAt}
          isStale={trendingStale}
        />
      </section>

      {/* ============================================================ */}
      {/* EQUITY SECTORS */}
      {/* ============================================================ */}
      <section id="sectors" className="mb-10">
        <SectionHeader
          icon={<BarChart3 className="w-5 h-5 text-blue-600" />}
          title="Equity Sectors"
          id="sectors-header"
        />
        
        {sectorsLoading ? (
          <div className="card p-6 animate-pulse">
            <div className="h-64 bg-gray-100 rounded" />
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm text-gray-500">
                Ranked by composite score (1W×20% + 1M×50% + 3M×30%)
              </p>
              {market && (
                <div className="text-sm text-gray-600">
                  SPY: <span className={getPercentColor(market.change_1m)}>{formatPercent(market.change_1m)}</span> (1M)
                </div>
              )}
            </div>
            <SectorTable sectors={sectors} />
            {sectorsUpdatedAt && (
              <div className="text-xs text-gray-400 mt-2">
                Updated: {formatCacheAge(sectorsUpdatedAt)}
              </div>
            )}
          </>
        )}
      </section>

      {/* ============================================================ */}
      {/* INVESTMENT THEMES */}
      {/* ============================================================ */}
      <section id="themes" className="mb-10">
        <SectionHeader
          icon={<Layers className="w-5 h-5 text-purple-600" />}
          title="Investment Themes"
          id="themes-header"
        />
        <ThemesTab />
      </section>

      {/* ============================================================ */}
      {/* GOLD & COMMODITIES */}
      {/* ============================================================ */}
      <section id="gold" className="mb-10">
        <SectionHeader
          icon={<Gem className="w-5 h-5 text-amber-500" />}
          title="Gold & Commodities"
          id="gold-header"
        />
        <GoldContent />
      </section>

      {/* ============================================================ */}
      {/* OIL */}
      {/* ============================================================ */}
      <section id="oil" className="mb-10">
        <SectionHeader
          icon={<Droplets className="w-5 h-5 text-slate-600" />}
          title="Oil"
          id="oil-header"
        />
        
        {oilLoading ? (
          <div className="card p-6 animate-pulse">
            <div className="h-32 bg-gray-100 rounded" />
          </div>
        ) : oilData ? (
          <div className="space-y-6">
            <OilPriceCard
              wti={oilData.wti}
              brent={oilData.brent}
              spread={oilData.spread}
            />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <OilKeyLevels
                keyLevels={oilData.keyLevels}
                currentPrice={oilData.wti?.price ?? null}
              />
              <OilContext context={oilData.context} />
            </div>
            {oilData.updatedAt && (
              <div className="text-xs text-gray-400">
                Updated: {formatCacheAge(oilData.updatedAt)}
                {oilData.isStale && <span className="text-amber-500 ml-2">• Refreshing...</span>}
              </div>
            )}
          </div>
        ) : (
          <div className="card p-6 text-center text-gray-500">
            Failed to load oil data
          </div>
        )}
      </section>

      {/* ============================================================ */}
      {/* CRYPTO */}
      {/* ============================================================ */}
      <section id="crypto" className="mb-10">
        <SectionHeader
          icon={<Bitcoin className="w-5 h-5 text-orange-500" />}
          title="Crypto"
          id="crypto-header"
        />
        <BtcContent />
      </section>
    </div>
  );
}
