"use client";

import Link from "next/link";
import Image from "next/image";
import { X, Edit2, StickyNote } from "lucide-react";
import { SkeletonTableRow } from "@/components/Skeleton";
import { ThemeWithPerformance, ThemePerformance } from "@/lib/types";
import { SuggestedStocks } from "./SuggestedStocks";
import { SuggestedStock } from "./types";
import { formatPercent, getPercentColor, formatPrice, getTradingViewUrl, StatusBadge } from "./utils";

interface ThemeExpandedRowProps {
  themeId: number;
  loadingExpanded: boolean;
  expandedData: ThemeWithPerformance | null;
  suggestions: SuggestedStock[];
  loadingSuggestions: boolean;
  onEditStock: (themeId: number, stock: ThemePerformance) => void;
  onRemoveStock: (themeId: number, ticker: string) => void;
  onAddSuggestedStock: (themeId: number, ticker: string) => void;
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
}: ThemeExpandedRowProps) {
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
                      <th className="px-4 py-2 text-right font-medium uppercase">1W</th>
                      <th className="px-4 py-2 text-right font-medium uppercase">1M</th>
                      <th className="px-4 py-2 text-right font-medium uppercase">3M</th>
                      <th className="px-4 py-2 w-20"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {expandedData.stock_performances.map((stock: ThemePerformance) => (
                      <tr key={stock.ticker} className="hover:bg-gray-100">
                        <td className="px-4 py-2 text-center">
                          <StatusBadge status={stock.status || "watching"} />
                        </td>
                        <td className="px-4 py-2">
                          <div className="flex flex-col">
                            <div className="flex items-center gap-1">
                              <Link
                                href={`/markets/research/${stock.ticker}`}
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
                          {formatPrice(stock.current_price)}
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
