"use client";

import { useState, useEffect } from "react";
import { TrendingUp, TrendingDown, ChevronDown, ChevronRight, RefreshCw, Tag } from "lucide-react";
import { formatPercent, getPercentColor } from "./utils";

interface TagPerfRow {
  tag: string;
  avg_return: number;
  median_return: number;
  stock_count: number;
  top_stock: string | null;
  top_stock_return: number | null;
  updated_at: string;
}

interface TagStockReturn {
  ticker: string;
  return_1w: number | null;
  return_1m: number | null;
  return_3m: number | null;
}

interface TagPerformanceData {
  periods: Record<string, TagPerfRow[]>;
  last_updated: string | null;
}

type Period = "1W" | "1M" | "3M";

const PERIODS: Period[] = ["1W", "1M", "3M"];

export function TagPerformanceTab() {
  const [activePeriod, setActivePeriod] = useState<Period>("1M");
  const [data, setData] = useState<TagPerformanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedTag, setExpandedTag] = useState<string | null>(null);
  const [expandedStocks, setExpandedStocks] = useState<TagStockReturn[] | null>(null);
  const [loadingStocks, setLoadingStocks] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch("/api/tags/performance")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  const rows = data?.periods?.[activePeriod] || [];

  // Sort by avg_return desc
  const sorted = Array.from(rows).sort((a, b) => b.avg_return - a.avg_return);

  const handleExpand = async (tag: string) => {
    if (expandedTag === tag) {
      setExpandedTag(null);
      setExpandedStocks(null);
      return;
    }

    setExpandedTag(tag);
    setLoadingStocks(true);
    setExpandedStocks(null);

    try {
      const res = await fetch(`/api/tags/stocks?tag=${encodeURIComponent(tag)}`);
      if (res.ok) {
        const d = await res.json();
        setExpandedStocks(d.stocks || []);
      }
    } catch {
      // ignore
    } finally {
      setLoadingStocks(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Period selector */}
      <div className="flex items-center justify-between">
        <div className="inline-flex bg-gray-100 rounded-lg p-0.5">
          {PERIODS.map((p) => (
            <button
              key={p}
              onClick={() => setActivePeriod(p)}
              className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors touch-manipulation ${
                activePeriod === p
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {p}
            </button>
          ))}
        </div>

        {data?.last_updated && (
          <span className="text-xs text-gray-400">
            Updated {new Date(data.last_updated).toLocaleString()}
          </span>
        )}
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="h-6 w-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* Empty */}
      {!loading && sorted.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          <Tag className="w-8 h-8 mx-auto mb-2 text-gray-300" />
          <p className="text-sm">No tag performance data yet.</p>
          <p className="text-xs text-gray-400 mt-1">Run the compute script to populate.</p>
        </div>
      )}

      {/* Tag leaderboard */}
      {!loading && sorted.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="min-w-full">
            <thead>
              <tr className="text-xs text-gray-500 border-b border-gray-100">
                <th className="px-4 py-3 text-left font-medium uppercase w-8"></th>
                <th className="px-4 py-3 text-left font-medium uppercase">Tag</th>
                <th className="px-4 py-3 text-right font-medium uppercase">Avg Return</th>
                <th className="px-4 py-3 text-right font-medium uppercase hidden sm:table-cell">Median</th>
                <th className="px-4 py-3 text-center font-medium uppercase hidden sm:table-cell">Stocks</th>
                <th className="px-4 py-3 text-right font-medium uppercase hidden md:table-cell">Top Stock</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sorted.map((row) => {
                const isExpanded = expandedTag === row.tag;
                return (
                  <>
                    <tr
                      key={row.tag}
                      onClick={() => handleExpand(row.tag)}
                      className="hover:bg-gray-50 cursor-pointer"
                    >
                      <td className="px-4 py-3 text-gray-400">
                        {isExpanded ? (
                          <ChevronDown className="w-4 h-4" />
                        ) : (
                          <ChevronRight className="w-4 h-4" />
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm font-medium text-gray-900">{row.tag}</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className={`text-sm font-semibold ${getPercentColor(row.avg_return)}`}>
                          {formatPercent(row.avg_return)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right hidden sm:table-cell">
                        <span className={`text-sm ${getPercentColor(row.median_return)}`}>
                          {formatPercent(row.median_return)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center hidden sm:table-cell">
                        <span className="text-xs text-gray-500 bg-gray-100 rounded-full px-2 py-0.5">
                          {row.stock_count}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right hidden md:table-cell">
                        {row.top_stock && (
                          <span className="text-sm">
                            <span className="font-medium text-emerald-600">{row.top_stock}</span>
                            <span className={`ml-1 ${getPercentColor(row.top_stock_return ?? 0)}`}>
                              {formatPercent(row.top_stock_return)}
                            </span>
                          </span>
                        )}
                      </td>
                    </tr>
                    {/* Expanded constituent stocks */}
                    {isExpanded && (
                      <tr key={`${row.tag}-expanded`}>
                        <td colSpan={6} className="px-0 py-0">
                          <div className="bg-gray-50 border-t border-b border-gray-200">
                            {loadingStocks ? (
                              <div className="flex items-center justify-center py-6">
                                <div className="h-4 w-4 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                              </div>
                            ) : expandedStocks && expandedStocks.length > 0 ? (
                              <table className="min-w-full">
                                <thead>
                                  <tr className="text-xs text-gray-400 border-b border-gray-200">
                                    <th className="px-8 py-2 text-left font-medium uppercase">Ticker</th>
                                    <th className="px-4 py-2 text-right font-medium uppercase">1W</th>
                                    <th className="px-4 py-2 text-right font-medium uppercase">1M</th>
                                    <th className="px-4 py-2 text-right font-medium uppercase">3M</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200">
                                  {expandedStocks.map((stock) => (
                                    <tr key={stock.ticker} className="hover:bg-gray-100">
                                      <td className="px-8 py-2 text-sm font-medium text-emerald-600">
                                        {stock.ticker}
                                      </td>
                                      <td className={`px-4 py-2 text-right text-sm ${getPercentColor(stock.return_1w)}`}>
                                        {formatPercent(stock.return_1w)}
                                      </td>
                                      <td className={`px-4 py-2 text-right text-sm ${getPercentColor(stock.return_1m)}`}>
                                        {formatPercent(stock.return_1m)}
                                      </td>
                                      <td className={`px-4 py-2 text-right text-sm ${getPercentColor(stock.return_3m)}`}>
                                        {formatPercent(stock.return_3m)}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            ) : (
                              <div className="py-4 text-center text-xs text-gray-400">
                                No stock data available
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
