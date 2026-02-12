"use client";

import { useState, useEffect } from "react";
import { TrendingUp, TrendingDown, Minus, RefreshCw, ExternalLink, Globe } from "lucide-react";

interface MarketData {
  id: string;
  name: string;
  ticker: string;
  region: string;
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

interface BenchmarkData {
  ticker: string;
  name: string;
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

function MomentumTrendIcon({ trend }: { trend: MarketData["momentum_trend"] }) {
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

function RegionBadge({ region }: { region: string }) {
  const colors: Record<string, string> = {
    "Americas": "bg-blue-100 text-blue-700",
    "Europe": "bg-purple-100 text-purple-700",
    "Asia Pacific": "bg-amber-100 text-amber-700",
    "Global": "bg-gray-100 text-gray-700",
  };
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${colors[region] || "bg-gray-100 text-gray-700"}`}>
      {region}
    </span>
  );
}

// ETF info pages
const ETF_INFO_URLS: Record<string, string> = {
  SPY: "https://www.ssga.com/us/en/intermediary/etfs/funds/spdr-sp-500-etf-trust-spy",
  QQQ: "https://www.invesco.com/qqq-etf/en/home.html",
  IWM: "https://www.ishares.com/us/products/239710/ishares-russell-2000-etf",
  EWS: "https://www.ishares.com/us/products/239675/ishares-msci-singapore-etf",
  EWJ: "https://www.ishares.com/us/products/239665/ishares-msci-japan-etf",
  EWH: "https://www.ishares.com/us/products/239657/ishares-msci-hong-kong-etf",
  FXI: "https://www.ishares.com/us/products/239536/ishares-china-largecap-etf",
  KWEB: "https://kraneshares.com/kweb/",
  EWT: "https://www.ishares.com/us/products/239736/ishares-msci-taiwan-etf",
  EWY: "https://www.ishares.com/us/products/239681/ishares-msci-south-korea-etf",
  INDA: "https://www.ishares.com/us/products/239659/ishares-msci-india-etf",
  EWA: "https://www.ishares.com/us/products/239607/ishares-msci-australia-etf",
  EWZ: "https://www.ishares.com/us/products/239612/ishares-msci-brazil-etf",
  EWC: "https://www.ishares.com/us/products/239615/ishares-msci-canada-etf",
  EWW: "https://www.ishares.com/us/products/239678/ishares-msci-mexico-etf",
  EWU: "https://www.ishares.com/us/products/239690/ishares-msci-united-kingdom-etf",
  EWG: "https://www.ishares.com/us/products/239650/ishares-msci-germany-etf",
  EWQ: "https://www.ishares.com/us/products/239644/ishares-msci-france-etf",
  VGK: "https://investor.vanguard.com/investment-products/etfs/profile/vgk",
  EEM: "https://www.ishares.com/us/products/239637/ishares-msci-emerging-markets-etf",
  VT: "https://investor.vanguard.com/investment-products/etfs/profile/vt",
};

function getInfoUrl(ticker: string): string {
  return ETF_INFO_URLS[ticker] || `https://etf.com/${ticker}`;
}

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

  const regions = ["all", "Americas", "Europe", "Asia Pacific", "Global"];
  const filteredMarkets = regionFilter === "all" 
    ? markets 
    : markets.filter(m => m.region === regionFilter);

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
          <p>Failed to load market data</p>
          <button onClick={() => fetchData(true)} className="btn-secondary mt-4">Retry</button>
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
          <p className="text-sm text-gray-500">
            Country/region ETFs ranked by momentum
          </p>
        </div>
        <div className="flex items-center gap-3">
          {benchmark && (
            <div className="text-sm text-gray-600">
              VT: <span className={getPercentColor(benchmark.change_1m)}>{formatPercent(benchmark.change_1m)}</span> (1M)
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
        {regions.map((region) => (
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
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-8">#</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Market</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Region</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">1D</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">1W</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">1M</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">3M</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Trend</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">vs VT</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Score</th>
                <th className="px-4 py-3 w-10"></th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredMarkets.map((market, idx) => (
                <tr key={market.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                    {idx + 1}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div>
                      <div className="font-semibold text-gray-900">{market.name}</div>
                      <div className="text-xs text-gray-500">{market.ticker}</div>
                    </div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <RegionBadge region={market.region} />
                  </td>
                  <td className={`px-4 py-3 whitespace-nowrap text-right text-sm font-medium ${getPercentColor(market.change_1d)}`}>
                    {formatPercent(market.change_1d)}
                  </td>
                  <td className={`px-4 py-3 whitespace-nowrap text-right text-sm font-medium ${getPercentColor(market.change_1w)}`}>
                    {formatPercent(market.change_1w)}
                  </td>
                  <td className={`px-4 py-3 whitespace-nowrap text-right text-sm font-medium ${getPercentColor(market.change_1m)}`}>
                    {formatPercent(market.change_1m)}
                  </td>
                  <td className={`px-4 py-3 whitespace-nowrap text-right text-sm font-medium ${getPercentColor(market.change_3m)}`}>
                    {formatPercent(market.change_3m)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-center">
                    <MomentumTrendIcon trend={market.momentum_trend} />
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <RelativeStrengthBar value={market.relative_strength_1m} />
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-right">
                    <span className={`inline-flex items-center px-2 py-1 rounded-md text-sm font-bold ${getPercentBg(market.composite_score)} ${getPercentColor(market.composite_score)}`}>
                      {market.composite_score !== null ? market.composite_score.toFixed(1) : "-"}
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <a
                      href={getInfoUrl(market.ticker)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1 text-gray-400 hover:text-gray-600 inline-block"
                      title="View ETF details"
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
          <div className="ml-auto">
            Updated: {new Date(updatedAt).toLocaleTimeString()}
          </div>
        )}
      </div>
    </div>
  );
}
