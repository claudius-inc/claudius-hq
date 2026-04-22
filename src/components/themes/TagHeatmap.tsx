"use client";

import { useState, useEffect, useMemo } from "react";
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
}

function getHeatColor(value: number): string {
  // 5-level gradient: deep red → light red → gray → light green → deep green
  if (value >= 15) return "bg-emerald-600 text-white";
  if (value >= 5) return "bg-emerald-400 text-white";
  if (value >= 0) return "bg-emerald-100 text-emerald-800";
  if (value >= -5) return "bg-red-100 text-red-800";
  if (value >= -15) return "bg-red-400 text-white";
  return "bg-red-600 text-white";
}

export function TagHeatmap({ selectedTag, onTagSelect }: TagHeatmapProps) {
  const [data, setData] = useState<TagPerfRow[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch("/api/tags/performance")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d?.periods) return;
        // Use 1M data, sort by absolute return
        const rows = (d.periods["1M"] || [])
          .map((r: any) => ({
            tag: r.tag,
            avg_return: r.avg_return,
            stock_count: r.stock_count,
          }))
          .sort((a: TagPerfRow, b: TagPerfRow) => Math.abs(b.avg_return) - Math.abs(a.avg_return));
        setData(rows);
      })
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center gap-2 overflow-x-auto pb-2 px-1">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="h-8 w-20 bg-gray-100 rounded-lg animate-pulse flex-shrink-0" />
        ))}
      </div>
    );
  }

  if (!data || data.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Tag Heatmap (1M)</span>
        {selectedTag && (
          <button
            onClick={() => onTagSelect(null)}
            className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 touch-manipulation"
          >
            <X className="w-3 h-3" />
            Clear filter
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {data.map((row) => {
          const isSelected = selectedTag === row.tag;
          return (
            <button
              key={row.tag}
              onClick={() => onTagSelect(isSelected ? null : row.tag)}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all touch-manipulation
                ${isSelected
                  ? "ring-2 ring-offset-1 ring-emerald-500 " + getHeatColor(row.avg_return)
                  : getHeatColor(row.avg_return) + " hover:opacity-80"
                }
              `}
              title={`${row.tag}: ${formatPercent(row.avg_return)} (${row.stock_count} stocks)`}
            >
              <span className="truncate max-w-[80px]">{row.tag}</span>
              <span className="font-semibold tabular-nums">{formatPercent(row.avg_return)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
