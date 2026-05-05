"use client";

import { useState, useMemo } from "react";
import useSWR from "swr";
import Link from "next/link";
import { ChevronDown, ChevronUp, ChevronRight } from "lucide-react";
import { Skeleton } from "@/components/Skeleton";
import { RefreshIndicator } from "@/components/ui/RefreshIndicator";
import { formatPercent, getPercentColor } from "../themes/_components/themes/utils";
import { fetcher, ssrHydratedConfig } from "@/lib/swr-config";

interface ThemeRow {
  id: number;
  name: string;
  stockCount: number;
  performance_1w: number | null;
  performance_1m: number | null;
  performance_3m: number | null;
}

interface ThemePerformanceResponse {
  themes: ThemeRow[];
}

type SortField = "1w" | "1m" | "3m";
type SortDir = "asc" | "desc";

const MAX_VISIBLE = 3;

export interface ThemeLeaderboardLiteProps {
  initialData?: ThemePerformanceResponse | null;
}

export function ThemeLeaderboardLite(props: ThemeLeaderboardLiteProps = {}) {
  const { initialData } = props;
  const { data, isValidating } = useSWR<ThemePerformanceResponse>(
    "/api/themes/performance",
    fetcher,
    {
      ...ssrHydratedConfig,
      fallbackData: initialData ?? undefined,
    },
  );
  const themes = data?.themes ?? [];
  const loading = !data;
  const [sortField, setSortField] = useState<SortField>("1m");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  };

  const sorted = useMemo(() => {
    const key = `performance_${sortField}` as keyof ThemeRow;
    return [...themes].sort((a, b) => {
      const aVal = a[key] as number | null;
      const bVal = b[key] as number | null;
      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return 1;
      if (bVal == null) return -1;
      return sortDir === "desc" ? bVal - aVal : aVal - bVal;
    });
  }, [themes, sortField, sortDir]);

  const visible = sorted.slice(0, MAX_VISIBLE);

  if (loading) {
    return (
      <div>
        <h3 className="text-xs font-semibold text-gray-900 mb-1.5 flex items-center gap-1.5">
          Themes
        </h3>
        <div className="card overflow-hidden !p-0">
          <div className="flex items-center gap-3 px-3 py-1.5 bg-gray-50">
            <div className="w-3 shrink-0" />
            <Skeleton className="h-2.5 w-12" />
            <div className="flex-1" />
            <Skeleton className="h-2.5 w-6" />
            <Skeleton className="h-2.5 w-6" />
            <Skeleton className="h-2.5 w-6" />
          </div>
          <div className="divide-y divide-gray-100">
            {Array.from({ length: MAX_VISIBLE }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-3 py-2.5">
                <ChevronRight className="w-3 h-3 text-gray-300 shrink-0" />
                <div className="flex-1 min-w-0">
                  <Skeleton className="h-3 w-32 mb-1" />
                  <Skeleton className="h-2.5 w-14" />
                </div>
                <Skeleton className="h-3 w-12 shrink-0" />
                <Skeleton className="h-3 w-12 shrink-0" />
                <Skeleton className="h-3 w-12 shrink-0" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (themes.length === 0) return null;

  return (
    <div>
      <h3 className="text-xs font-semibold text-gray-900 mb-1.5 flex items-center gap-1.5">
        Themes
        <RefreshIndicator active={isValidating} />
      </h3>

      <div className="card overflow-hidden !p-0">
        {/* Column header row — uses the same uppercase, gray-50 treatment as
            Market Mood's "VOLATILITY" / "BREADTH" group labels, but the three
            period labels remain individually clickable for sorting. */}
        <div className="flex items-center gap-3 px-3 py-1.5 bg-gray-50 border-b border-gray-100">
          <div className="w-3 shrink-0" />
          <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide flex-1">
            Theme
          </span>
          {(["1w", "1m", "3m"] as SortField[]).map((field) => (
            <button
              key={field}
              onClick={() => handleSort(field)}
              className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide w-12 text-right cursor-pointer select-none hover:text-gray-700 inline-flex items-center justify-end gap-0.5"
            >
              {field}
              {sortField === field &&
                (sortDir === "desc" ? (
                  <ChevronDown className="w-2.5 h-2.5" />
                ) : (
                  <ChevronUp className="w-2.5 h-2.5" />
                ))}
            </button>
          ))}
        </div>

        {/* Theme rows — chevron + name (+ stock count) + 3 numeric values,
            mirroring the row shape used in MarketMood and HardAssets. */}
        <div className="divide-y divide-gray-100">
          {visible.map((theme) => (
            <Link
              key={theme.id}
              href="/markets/scanner/themes"
              className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 transition-colors text-left"
            >
              <ChevronRight className="w-3 h-3 text-gray-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold text-gray-900 truncate">
                  {theme.name}
                </div>
                <div className="text-[10px] text-gray-400">
                  {theme.stockCount} stocks
                </div>
              </div>
              {(["1w", "1m", "3m"] as const).map((period) => {
                const perf = theme[`performance_${period}`];
                return (
                  <span
                    key={period}
                    className={`text-xs font-medium tabular-nums w-12 text-right shrink-0 ${getPercentColor(perf)}`}
                  >
                    {formatPercent(perf)}
                  </span>
                );
              })}
            </Link>
          ))}
        </div>

        {themes.length > MAX_VISIBLE && (
          <div className="px-3 py-2 border-t border-gray-100 bg-gray-50">
            <Link
              href="/markets/scanner/themes"
              className="text-[10px] text-gray-500 hover:text-gray-700 font-medium"
            >
              +{themes.length - MAX_VISIBLE} more themes
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
