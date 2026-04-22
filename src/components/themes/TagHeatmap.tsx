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
}

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

export function TagHeatmap({ selectedTag, onTagSelect }: TagHeatmapProps) {
  const [data, setData] = useState<TagPerfRow[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch("/api/tags/performance")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d?.periods) return;
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
      <div className="flex gap-1.5 overflow-x-auto scrollbar-none">
        {Array.from({ length: 16 }).map((_, i) => (
          <div key={i} className="h-6 w-16 bg-gray-100 rounded animate-pulse flex-shrink-0" />
        ))}
      </div>
    );
  }

  if (!data || data.length === 0) return null;

  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wider flex-shrink-0">1M</span>
      <div className="flex gap-1 overflow-x-auto pb-0.5 scrollbar-none">
        {data.map((row) => {
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
      {selectedTag && (
        <button
          onClick={() => onTagSelect(null)}
          className="inline-flex items-center gap-0.5 text-[10px] text-gray-400 hover:text-gray-600 flex-shrink-0 touch-manipulation"
        >
          <X className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}
