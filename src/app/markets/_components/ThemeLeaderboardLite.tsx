"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { Layers, ArrowRight, ChevronDown, ChevronUp } from "lucide-react";
import { Skeleton } from "@/components/Skeleton";
import { formatPercent, getPercentColor } from "@/components/themes/utils";
import { getCrowdingBgColor } from "@/lib/crowding-utils";

interface ThemeLite {
  id: number;
  name: string;
  stocks: string[];
}

interface ThemeWithPerf {
  id: number;
  name: string;
  stockCount: number;
  performance_1w: number | null;
  performance_1m: number | null;
  performance_3m: number | null;
  crowdingScore: number | null;
  _pricesLoading: boolean;
}

type SortField = "1w" | "1m" | "3m";
type SortDir = "asc" | "desc";

const MAX_VISIBLE = 8;

export function ThemeLeaderboardLite() {
  const [themes, setThemes] = useState<ThemeWithPerf[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortField, setSortField] = useState<SortField>("1m");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  useEffect(() => {
    // Step 1: Fetch lite themes
    fetch("/api/themes/lite")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data?.themes) {
          setLoading(false);
          return;
        }

        const liteThemes: ThemeLite[] = data.themes.filter(
          (t: ThemeLite) => t.stocks.length > 0,
        );
        // Initialize with loading state
        setThemes(
          liteThemes.map((t) => ({
            id: t.id,
            name: t.name,
            stockCount: t.stocks.length,
            performance_1w: null,
            performance_1m: null,
            performance_3m: null,
            crowdingScore: null,
            _pricesLoading: true,
          })),
        );
        setLoading(false);

        // Step 2: Progressive price loading
        const allTickers = new Set<string>();
        for (const t of liteThemes) {
          for (const s of t.stocks) allTickers.add(s);
        }

        if (allTickers.size === 0) {
          setThemes((prev) => prev.map((t) => ({ ...t, _pricesLoading: false })));
          return;
        }

        fetch(`/api/themes/prices?tickers=${Array.from(allTickers).join(",")}`)
          .then((r) => (r.ok ? r.json() : null))
          .then((pricesData) => {
            if (!pricesData?.prices) {
              setThemes((prev) => prev.map((t) => ({ ...t, _pricesLoading: false })));
              return;
            }

            const prices = pricesData.prices;
            setThemes((prev) =>
              prev.map((theme) => {
                const lt = liteThemes.find((t) => t.id === theme.id);
                if (!lt) return { ...theme, _pricesLoading: false };

                const perfs_1w: number[] = [];
                const perfs_1m: number[] = [];
                const perfs_3m: number[] = [];

                for (const ticker of lt.stocks) {
                  const p = prices[ticker];
                  if (p?.performance_1w != null) perfs_1w.push(p.performance_1w);
                  if (p?.performance_1m != null) perfs_1m.push(p.performance_1m);
                  if (p?.performance_3m != null) perfs_3m.push(p.performance_3m);
                }

                const avg = (arr: number[]) =>
                  arr.length > 0
                    ? Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 100) / 100
                    : null;

                return {
                  ...theme,
                  performance_1w: avg(perfs_1w),
                  performance_1m: avg(perfs_1m),
                  performance_3m: avg(perfs_3m),
                  crowdingScore: pricesData.baskets?.[lt.name]?.crowdingScore ?? null,
                  _pricesLoading: false,
                };
              }),
            );
          })
          .catch(() => {
            setThemes((prev) => prev.map((t) => ({ ...t, _pricesLoading: false })));
          });
      })
      .catch(() => setLoading(false));
  }, []);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  };

  const sorted = useMemo(() => {
    const key = `performance_${sortField}` as keyof ThemeWithPerf;
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
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex items-center gap-2 mb-3">
          <Skeleton className="h-4 w-4 rounded" />
          <Skeleton className="h-4 w-32" />
        </div>
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-8 w-full rounded" />
          ))}
        </div>
      </div>
    );
  }

  if (themes.length === 0) return null;

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-gray-500" />
          <h2 className="text-sm font-semibold text-gray-900">Theme Performance</h2>
          <span className="text-xs text-gray-400">{themes.length} themes</span>
        </div>
        <Link
          href="/markets/themes"
          className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 font-medium"
        >
          View all <ArrowRight className="w-3 h-3" />
        </Link>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-100">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Theme</th>
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
              <th className="px-3 py-2 text-center text-[10px] font-medium text-gray-500 uppercase">Crowd</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-50">
            {visible.map((theme) => (
              <tr key={theme.id} className="hover:bg-gray-50">
                <td className="px-3 py-2 whitespace-nowrap">
                  <div className="text-xs font-medium text-gray-900">{theme.name}</div>
                  <div className="text-[10px] text-gray-400">{theme.stockCount} stocks</div>
                </td>
                {(["1w", "1m", "3m"] as const).map((period) => {
                  const perf = theme[`performance_${period}`];
                  return (
                    <td key={period} className="px-3 py-2 whitespace-nowrap text-right">
                      {theme._pricesLoading ? (
                        <Skeleton className="h-4 w-10 ml-auto" />
                      ) : (
                        <span className={`text-xs font-medium ${getPercentColor(perf)}`}>
                          {formatPercent(perf)}
                        </span>
                      )}
                    </td>
                  );
                })}
                <td className="px-3 py-2 whitespace-nowrap text-center">
                  {theme._pricesLoading ? (
                    <Skeleton className="h-4 w-6 mx-auto rounded-full" />
                  ) : theme.crowdingScore != null ? (
                    <span
                      className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium ${getCrowdingBgColor(theme.crowdingScore)}`}
                    >
                      {theme.crowdingScore}
                    </span>
                  ) : (
                    <span className="text-gray-300 text-xs">-</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {themes.length > MAX_VISIBLE && (
        <div className="px-4 py-2 border-t border-gray-100 bg-gray-50">
          <Link
            href="/markets/themes"
            className="text-xs text-gray-500 hover:text-gray-700 font-medium"
          >
            +{themes.length - MAX_VISIBLE} more themes
          </Link>
        </div>
      )}
    </div>
  );
}
