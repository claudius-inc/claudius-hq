"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { X, Edit2, StickyNote, Plus, ChevronDown, ChevronUp } from "lucide-react";
import { SkeletonTableRow } from "@/components/Skeleton";
import { ThemeWithPerformance, ThemePerformance } from "@/lib/types";
import { SuggestedStocks } from "./SuggestedStocks";
import { SuggestedStock } from "../../_lib/types";
import { formatPercent, getPercentColor, formatLocalPrice, getTradingViewUrl, StatusBadge } from "./utils";

interface ThemeExpandedRowProps {
  themeId: number;
  loadingExpanded: boolean;
  expandedData: ThemeWithPerformance | null;
  suggestions: SuggestedStock[];
  loadingSuggestions: boolean;
  onEditStock: (themeId: number, stock: ThemePerformance) => void;
  onRemoveStock: (themeId: number, ticker: string) => void;
  onAddSuggestedStock: (themeId: number, ticker: string) => void;
  onAddStock: (themeId: number, ticker: string) => void;
}

export function ThemeExpandedRow({
  themeId,
  loadingExpanded,
  expandedData,
  suggestions,
  loadingSuggestions,
  onEditStock,
  onRemoveStock,
  onAddSuggestedStock,
  onAddStock,
}: ThemeExpandedRowProps) {
  const [addInput, setAddInput] = useState("");
  const [adding, setAdding] = useState(false);
  const [sortField, setSortField] = useState<"1w" | "1m" | "3m" | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const handleSort = (field: "1w" | "1m" | "3m") => {
    if (sortField === field) {
      if (sortDir === "desc") {
        setSortDir("asc");
      } else {
        setSortField(null);
        setSortDir("desc");
      }
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  };

  const sortedStocks = expandedData?.stock_performances
    ? [...expandedData.stock_performances].sort((a, b) => {
        if (!sortField) return 0;
        const key = `performance_${sortField}` as keyof ThemePerformance;
        const aVal = (a[key] as number) ?? -999;
        const bVal = (b[key] as number) ?? -999;
        return sortDir === "desc" ? bVal - aVal : aVal - bVal;
      })
    : [];

  const handleAddManual = async () => {
    const ticker = addInput.trim().toUpperCase();
    if (!ticker) return;
    setAdding(true);
    try {
      await onAddStock(themeId, ticker);
      setAddInput("");
    } finally {
      setAdding(false);
    }
  };

  const handleAddKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAddManual();
    }
  };
  return (
    <tr>
      <td colSpan={7} className="px-0 py-0">
        <div className="bg-gray-50 border-t border-gray-200">
          {loadingExpanded ? (
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead>
                  <tr className="text-xs text-gray-500">
                    <th className="px-4 py-2 text-center font-medium uppercase w-8">St</th>
                    <th className="px-4 py-2 text-left font-medium uppercase">Ticker</th>
                    <th className="px-4 py-2 text-center font-medium uppercase w-8"></th>
                    <th className="px-4 py-2 text-right font-medium uppercase">Price</th>
                    <th className="px-4 py-2 text-right font-medium uppercase">1W</th>
                    <th className="px-4 py-2 text-right font-medium uppercase">1M</th>
                    <th className="px-4 py-2 text-right font-medium uppercase">3M</th>
                    <th className="px-4 py-2 w-20"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <SkeletonTableRow key={i} cols={8} />
                  ))}
                </tbody>
              </table>
            </div>
          ) : expandedData?.stock_performances ? (
            <>
              <div className="overflow-x-auto">
                <table className="min-w-full">
                  <thead>
                    <tr className="text-xs text-gray-500">
                      <th className="px-4 py-2 text-center font-medium uppercase w-8">St</th>
                      <th className="px-4 py-2 text-left font-medium uppercase">Ticker</th>
                      <th className="px-4 py-2 text-center font-medium uppercase w-8"></th>
                      <th className="px-4 py-2 text-right font-medium uppercase">Price</th>
                      {["1w", "1m", "3m"].map((field) => (
                        <th
                          key={field}
                          className="px-4 py-2 text-right font-medium uppercase cursor-pointer select-none hover:text-gray-700"
                          onClick={() => handleSort(field as "1w" | "1m" | "3m")}
                        >
                          <span className="inline-flex items-center justify-end gap-0.5">
                            {field.toUpperCase()}
                            {sortField === field &&
                              (sortDir === "desc" ? (
                                <ChevronDown className="w-3 h-3" />
                              ) : (
                                <ChevronUp className="w-3 h-3" />
                              ))}
                          </span>
                        </th>
                      ))}
                      <th className="px-4 py-2 w-20"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {sortedStocks.map((stock: ThemePerformance) => (
                      <tr key={stock.ticker} className="hover:bg-gray-100">
                        <td className="px-4 py-2 text-center">
                          <StatusBadge status={stock.status || "watching"} />
                        </td>
                        <td className="px-4 py-2">
                          <div className="flex flex-col">
                            <div className="flex items-center gap-1">
                              <Link
                                href={`/markets/ticker/${stock.ticker}`}
                                className="text-emerald-600 hover:text-emerald-700 font-semibold"
                              >
                                {stock.ticker}
                              </Link>
                              {stock.notes && (
                                <span title={stock.notes}>
                                  <StickyNote className="w-3.5 h-3.5 text-gray-400" />
                                </span>
                              )}
                            </div>
                            {stock.name && (
                              <span className="text-xs text-gray-500 truncate max-w-[180px]" title={stock.name}>
                                {stock.name}
                              </span>
                            )}
                            {expandedData.stock_tags && expandedData.stock_tags[stock.ticker] && (
                              <div className="flex flex-wrap gap-1 mt-0.5">
                                {expandedData.stock_tags[stock.ticker].slice(0, 3).map((tag) => (
                                  <span key={tag} className="bg-gray-100 text-gray-600 text-[10px] rounded-full px-1.5 py-0.5 leading-tight">
                                    {tag}
                                  </span>
                                ))}
                                {expandedData.stock_tags[stock.ticker].length > 3 && (
                                  <span className="text-[10px] text-gray-400">+{expandedData.stock_tags[stock.ticker].length - 3}</span>
                                )}
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-2 text-center">
                          <a
                            href={getTradingViewUrl(stock.ticker)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-block hover:opacity-80"
                            title={`View ${stock.ticker} on TradingView`}
                          >
                            <Image src="/tradingview.svg" alt="TV" width={18} height={18} className="rounded" />
                          </a>
                        </td>
                        <td className="px-4 py-2 text-right text-sm font-medium">
                          {formatLocalPrice(stock.ticker, stock.current_price)}
                        </td>

                        <td className={`px-4 py-2 text-right text-sm font-medium ${getPercentColor(stock.performance_1w)}`}>
                          {formatPercent(stock.performance_1w)}
                        </td>
                        <td className={`px-4 py-2 text-right text-sm font-medium ${getPercentColor(stock.performance_1m)}`}>
                          {formatPercent(stock.performance_1m)}
                        </td>
                        <td className={`px-4 py-2 text-right text-sm font-medium ${getPercentColor(stock.performance_3m)}`}>
                          {formatPercent(stock.performance_3m)}
                        </td>
                        <td className="px-4 py-2 text-right">
                          <div className="flex items-center justify-end gap-0.5">
                            <button
                              onClick={() => onEditStock(themeId, stock)}
                              className="p-2 -m-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg touch-manipulation"
                              title="Edit"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => onRemoveStock(themeId, stock.ticker)}
                              className="p-2 -m-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg touch-manipulation"
                              title="Remove"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              
              {/* Manual add ticker input */}
              <div className="px-6 py-3 border-t border-gray-200 bg-gray-100">
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <input
                      type="text"
                      value={addInput}
                      onChange={(e) => setAddInput(e.target.value)}
                      onKeyDown={handleAddKeyDown}
                      placeholder="Add ticker (e.g. NVDA)"
                      disabled={adding}
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent placeholder:text-gray-400 disabled:opacity-50"
                    />
                  </div>
                  <button
                    onClick={handleAddManual}
                    disabled={adding || !addInput.trim()}
                    className="inline-flex items-center gap-1.5 px-3 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation"
                  >
                    {adding ? (
                      <div className="h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <Plus className="w-3.5 h-3.5" />
                    )}
                    <span className="hidden sm:inline">Add</span>
                  </button>
                </div>
              </div>

              <SuggestedStocks
                themeId={themeId}
                suggestions={suggestions}
                loadingSuggestions={loadingSuggestions}
                onAddStock={onAddSuggestedStock}
              />
            </>
          ) : (
            <div className="py-4 text-center text-gray-500">No stocks in theme</div>
          )}
        </div>
      </td>
    </tr>
  );
}
