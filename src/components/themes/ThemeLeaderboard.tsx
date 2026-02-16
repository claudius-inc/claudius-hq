"use client";

import Link from "next/link";
import { EmptyState } from "@/components/EmptyState";
import { BarChart3, ChevronDown, ChevronRight, Trash2 } from "lucide-react";
import { ThemeWithPerformance, ThemePerformance } from "@/lib/types";
import { ThemeExpandedRow } from "./ThemeExpandedRow";
import { SuggestedStock } from "./types";
import { formatPercent, getPercentColor } from "./utils";

interface ThemeLeaderboardProps {
  themes: ThemeWithPerformance[];
  expandedTheme: number | null;
  expandedData: ThemeWithPerformance | null;
  loadingExpanded: boolean;
  suggestions: SuggestedStock[];
  loadingSuggestions: boolean;
  onToggleExpand: (themeId: number) => void;
  onDeleteTheme: (themeId: number, themeName: string) => void;
  onEditStock: (themeId: number, stock: ThemePerformance) => void;
  onRemoveStock: (themeId: number, ticker: string) => void;
  onAddSuggestedStock: (themeId: number, ticker: string) => void;
}

export function ThemeLeaderboard({
  themes,
  expandedTheme,
  expandedData,
  loadingExpanded,
  suggestions,
  loadingSuggestions,
  onToggleExpand,
  onDeleteTheme,
  onEditStock,
  onRemoveStock,
  onAddSuggestedStock,
}: ThemeLeaderboardProps) {
  if (themes.length === 0) {
    return (
      <EmptyState
        icon={<BarChart3 className="w-8 h-8" />}
        title="No themes yet"
        description="Create investment themes to track baskets of related stocks"
      />
    );
  }

  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-8"></th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Theme</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">1W</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">1M</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">3M</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Leader</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider w-12"></th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {themes.map((theme) => (
              <>
                <tr
                  key={theme.id}
                  className="hover:bg-gray-50 cursor-pointer"
                  onClick={() => onToggleExpand(theme.id)}
                >
                  <td className="px-4 py-3 whitespace-nowrap">
                    {expandedTheme === theme.id ? (
                      <ChevronDown className="w-4 h-4 text-gray-400" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-gray-400" />
                    )}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div>
                      <div className="font-semibold text-gray-900">{theme.name}</div>
                      <div className="text-xs text-gray-500">{theme.stocks.length} stocks</div>
                    </div>
                  </td>
                  <td className={`px-4 py-3 whitespace-nowrap text-right text-sm font-medium ${getPercentColor(theme.performance_1w)}`}>
                    {formatPercent(theme.performance_1w)}
                  </td>
                  <td className={`px-4 py-3 whitespace-nowrap text-right text-sm font-medium ${getPercentColor(theme.performance_1m)}`}>
                    {formatPercent(theme.performance_1m)}
                  </td>
                  <td className={`px-4 py-3 whitespace-nowrap text-right text-sm font-medium ${getPercentColor(theme.performance_3m)}`}>
                    {formatPercent(theme.performance_3m)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {theme.leader ? (
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/markets/research/${theme.leader.ticker}`}
                          className="text-emerald-600 hover:text-emerald-700 font-semibold"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {theme.leader.ticker}
                        </Link>
                        <span className={`text-xs ${getPercentColor(theme.leader.performance_1m)}`}>
                          {formatPercent(theme.leader.performance_1m)}
                        </span>
                      </div>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-right">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteTheme(theme.id, theme.name);
                      }}
                      className="p-2 -m-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg touch-manipulation"
                      title="Delete theme"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
                
                {expandedTheme === theme.id && (
                  <ThemeExpandedRow
                    key={`${theme.id}-expanded`}
                    themeId={theme.id}
                    loadingExpanded={loadingExpanded}
                    expandedData={expandedData}
                    suggestions={suggestions}
                    loadingSuggestions={loadingSuggestions}
                    onEditStock={onEditStock}
                    onRemoveStock={onRemoveStock}
                    onAddSuggestedStock={onAddSuggestedStock}
                  />
                )}
              </>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
