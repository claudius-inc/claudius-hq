"use client";

import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { formatPercent } from "./utils";

interface TagPerfRow {
  tag: string;
  avg_return: number;
  stock_count: number;
}

interface TagHeatmapProps {
  selectedTag: string | null;
  onTagSelect: (tag: string | null) => void;
  onReady?: () => void;
}

type Period = "1W" | "1M" | "3M";
const PERIODS: Period[] = ["1W", "1M", "3M"];

function getHeatBg(value: number, isSelected: boolean): string {
  if (isSelected) {
    return value >= 0
      ? "bg-emerald-500 text-white"
      : "bg-red-500 text-white";
  }
  if (value >= 15) return "bg-emerald-600 text-white";
  if (value >= 5) return "bg-emerald-400 text-white";
  if (value >= 0) return "bg-emerald-100 text-emerald-800";
  if (value >= -5) return "bg-red-100 text-red-800";
  if (value >= -15) return "bg-red-400 text-white";
  return "bg-red-600 text-white";
}

export function TagHeatmap({ selectedTag, onTagSelect, onReady }: TagHeatmapProps) {
  const [periodData, setPeriodData] = useState<Record<Period, TagPerfRow[]>>({ "1W": [], "1M": [], "3M": [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch("/api/tags/performance")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d?.periods) return;
        const result: Record<string, TagPerfRow[]> = {};
        for (const period of PERIODS) {
          result[period] = (d.periods[period] || [])
            .map((r: any) => ({
              tag: r.tag,
              avg_return: r.avg_return,
              stock_count: r.stock_count,
            }))
            .sort((a: TagPerfRow, b: TagPerfRow) => Math.abs(b.avg_return) - Math.abs(a.avg_return));
        }
        setPeriodData(result);
        onReady?.();
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const clearBtn = selectedTag ? (
    <button
      onClick={() => onTagSelect(null)}
      className="inline-flex items-center gap-0.5 text-[10px] text-gray-400 hover:text-gray-600 flex-shrink-0 touch-manipulation"
    >
      <X className="w-3 h-3" />
    </button>
  ) : null;

  const hasData = PERIODS.some((p) => periodData[p]?.length > 0);

  if (!hasData) return null;

  return (
    <div className="space-y-1">
      {PERIODS.map((period) => {
        const rows = periodData[period] || [];
        if (rows.length === 0) return null;
        return (
          <div key={period} className="flex items-center gap-1.5">
            <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wider w-6 flex-shrink-0">{period}</span>
            <div className="flex gap-1 overflow-x-auto pb-0.5 scrollbar-none">
              {rows.map((row) => {
                const isSelected = selectedTag === row.tag;
                return (
                  <button
                    key={row.tag}
                    onClick={() => onTagSelect(isSelected ? null : row.tag)}
                    className={`inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium whitespace-nowrap flex-shrink-0 transition-all touch-manipulation
                      ${isSelected
                        ? "ring-1.5 ring-offset-1 ring-emerald-500 " + getHeatBg(row.avg_return, isSelected)
                        : getHeatBg(row.avg_return, isSelected) + " hover:opacity-80"
                      }`}
                    title={`${row.tag}: ${formatPercent(row.avg_return)} (${row.stock_count} stocks)`}
                  >
                    <span>{row.tag}</span>
                    <span className="font-semibold tabular-nums">{formatPercent(row.avg_return)}</span>
                  </button>
                );
              })}
            </div>
            {clearBtn}
          </div>
        );
      })}
    </div>
  );
}
