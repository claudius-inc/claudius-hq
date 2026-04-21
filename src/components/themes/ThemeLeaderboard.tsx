"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import Link from "next/link";
import { EmptyState } from "@/components/EmptyState";
import {
  BarChart3,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  MoreHorizontal,
  Plus,
  Trash2,
} from "lucide-react";
import { ThemeWithPerformance, ThemePerformance } from "@/lib/types";
import { ThemeExpandedRow } from "./ThemeExpandedRow";
import { SuggestedStock } from "./types";
import { formatPercent, getPercentColor } from "./utils";
import {
  getCrowdingBgColor,
  getCrowdingDescription,
} from "@/lib/crowding-utils";
import { Skeleton } from "@/components/Skeleton";

type SortField = "1w" | "1m" | "3m";
type SortDir = "asc" | "desc";

type ThemeWithLoadingState = ThemeWithPerformance & { _pricesLoading?: boolean };

interface ThemeLeaderboardProps {
  themes: ThemeWithLoadingState[];
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
  onAddStock: (themeId: number, ticker: string) => void;
  onAddTheme: () => void;
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
  onAddStock,
  onAddTheme,
}: ThemeLeaderboardProps) {
  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [menuThemeId, setMenuThemeId] = useState<number | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu on outside click
  useEffect(() => {
    if (!menuThemeId) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuThemeId(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuThemeId]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      if (sortDir === "desc") {
        setSortDir("asc");
      } else {
        setSortField(null);
      }
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  };

  const sortedThemes = useMemo(() => {
    if (!sortField) return themes;

    const key = `performance_${sortField}` as const;
    return [...themes].sort((a, b) => {
      const aVal = a[key];
      const bVal = b[key];
      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return 1;
      if (bVal == null) return -1;
      return sortDir === "desc" ? bVal - aVal : aVal - bVal;
    });
  }, [themes, sortField, sortDir]);

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
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-100">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 w-8"></th>
              <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500">
                <div className="flex items-center gap-1.5">
                  Theme
                  <button
                    onClick={(e) => { e.stopPropagation(); onAddTheme(); }}
                    className="p-1 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-md transition-colors"
                    title="Add theme"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              </th>
              {(["1w", "1m", "3m"] as SortField[]).map((field) => (
                <th
                  key={field}
                  className="px-3 py-2.5 text-right text-xs font-medium text-gray-500 cursor-pointer select-none hover:text-gray-700"
                  onClick={() => handleSort(field)}
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
              <th className="px-3 py-2.5 text-center text-xs font-medium text-gray-500">
                Crowd
              </th>
              <th className="px-3 py-2.5 text-right text-xs font-medium text-gray-500 w-12"></th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-100">
            {sortedThemes.map((theme) => (
              <>
                <tr
                  key={theme.id}
                  className="hover:bg-gray-50 cursor-pointer"
                  onClick={() => onToggleExpand(theme.id)}
                >
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    {expandedTheme === theme.id ? (
                      <ChevronDown className="w-4 h-4 text-gray-400" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-gray-400" />
                    )}
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    <div>
                      <div className="font-semibold text-gray-900">
                        {theme.name}
                      </div>
                      <div className="text-xs text-gray-500">
                        {theme.stocks.length} stocks
                      </div>
                    </div>
                  </td>
                  {(["1w", "1m", "3m"] as const).map((period) => {
                    const perf = theme[`performance_${period}`];
                    const leader = theme.leaders?.[period];
                    const isLoading = (theme as ThemeWithLoadingState)._pricesLoading;
                    
                    return (
                      <td
                        key={period}
                        className="px-3 py-2.5 whitespace-nowrap text-right"
                      >
                        {isLoading ? (
                          <div className="flex flex-col items-end gap-1">
                            <Skeleton className="h-4 w-12" />
                            <Skeleton className="h-3 w-16" />
                          </div>
                        ) : (
                          <>
                            <div
                              className={`text-sm font-medium ${getPercentColor(perf)}`}
                            >
                              {formatPercent(perf)}
                            </div>
                            {leader && (
                              <div className="flex items-center justify-end gap-1 mt-0.5">
                                <Link
                                  href={`/markets/research/${leader.ticker}`}
                                  className="text-[11px] text-gray-400 hover:text-gray-500 font-medium"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {leader.ticker}
                                </Link>
                                <span
                                  className={`text-[11px] ${getPercentColor(leader.value)}`}
                                >
                                  {formatPercent(leader.value)}
                                </span>
                              </div>
                            )}
                          </>
                        )}
                      </td>
                    );
                  })}
                  <td className="px-3 py-2.5 whitespace-nowrap text-center">
                    {(theme as ThemeWithLoadingState)._pricesLoading ? (
                      <Skeleton className="h-5 w-8 mx-auto rounded-full" />
                    ) : theme.crowdingScore !== undefined ? (
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${getCrowdingBgColor(theme.crowdingScore)}`}
                        title={getCrowdingDescription(
                          theme.crowdingLevel as
                            | "contrarian"
                            | "early"
                            | "forming"
                            | "crowded"
                            | "extreme",
                        )}
                      >
                        {theme.crowdingScore}
                      </span>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap text-right">
                    <div ref={menuRef} className="relative">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setMenuThemeId(menuThemeId === theme.id ? null : theme.id);
                        }}
                        className="p-2 -m-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg touch-manipulation"
                        title="More actions"
                      >
                        <MoreHorizontal className="w-4 h-4" />
                      </button>
                      {menuThemeId === theme.id && (
                        <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-50 min-w-[140px]">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setMenuThemeId(null);
                              onDeleteTheme(theme.id, theme.name);
                            }}
                            className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            Delete theme
                          </button>
                        </div>
                      )}
                    </div>
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
                    onAddStock={onAddStock}
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
