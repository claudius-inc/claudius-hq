"use client";

import { useState, useMemo } from "react";
import useSWR from "swr";
import Link from "next/link";
import { ArrowRight, ChevronDown, ChevronUp } from "lucide-react";
import { Skeleton } from "@/components/Skeleton";
import { formatPercent, getPercentColor } from "@/components/themes/utils";
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
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden min-h-[220px]">
        {/* Header bar — mirrors loaded structure */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Skeleton className="h-4 w-4 rounded" />
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-14" />
          </div>
          <Skeleton className="h-3 w-16" />
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-100">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">
                  Theme
                </th>
                <th className="px-3 py-2 text-right text-[10px] font-medium text-gray-500 uppercase">
                  1w
                </th>
                <th className="px-3 py-2 text-right text-[10px] font-medium text-gray-500 uppercase">
                  1m
                </th>
                <th className="px-3 py-2 text-right text-[10px] font-medium text-gray-500 uppercase">
                  3m
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-50">
              {Array.from({ length: MAX_VISIBLE }).map((_, i) => (
                <tr key={i}>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <Skeleton className="h-3 w-32 mb-1" />
                    <Skeleton className="h-2.5 w-14" />
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-right">
                    <Skeleton className="h-3 w-10 ml-auto" />
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-right">
                    <Skeleton className="h-3 w-10 ml-auto" />
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-right">
                    <Skeleton className="h-3 w-10 ml-auto" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  if (themes.length === 0) return null;

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden min-h-[220px]">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-100">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">
                Theme
              </th>
              {(["1w", "1m", "3m"] as SortField[]).map((field) => (
                <th
                  key={field}
                  className="px-3 py-2 text-right text-[10px] font-medium text-gray-500 uppercase cursor-pointer select-none hover:text-gray-700"
                  onClick={() => handleSort(field)}
                >
                  <span className="inline-flex items-center justify-end gap-0.5">
                    {field}
                    {sortField === field &&
                      (sortDir === "desc" ? (
                        <ChevronDown className="w-2.5 h-2.5" />
                      ) : (
                        <ChevronUp className="w-2.5 h-2.5" />
                      ))}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-50">
            {visible.map((theme) => (
              <tr key={theme.id} className="hover:bg-gray-50">
                <td className="px-3 py-2 whitespace-nowrap">
                  <div className="text-xs font-medium text-gray-900">
                    {theme.name}
                  </div>
                  <div className="text-[10px] text-gray-400">
                    {theme.stockCount} stocks
                  </div>
                </td>
                {(["1w", "1m", "3m"] as const).map((period) => {
                  const perf = theme[`performance_${period}`];
                  return (
                    <td
                      key={period}
                      className="px-3 py-2 whitespace-nowrap text-right"
                    >
                      <span
                        className={`text-xs font-medium ${getPercentColor(perf)}`}
                      >
                        {formatPercent(perf)}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {themes.length > MAX_VISIBLE && (
        <div className="px-4 py-2 border-t border-gray-100 bg-gray-50">
          <Link
            href="/markets/scanner/themes"
            className="text-xs text-gray-500 hover:text-gray-700 font-medium"
          >
            +{themes.length - MAX_VISIBLE} more themes
          </Link>
        </div>
      )}
    </div>
  );
}
