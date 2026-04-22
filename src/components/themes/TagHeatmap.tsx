"use client";

import { useState, useEffect, useMemo } from "react";
import { X, LayoutGrid, ArrowRightLeft, Minus, ChevronDown } from "lucide-react";
import { formatPercent } from "./utils";

interface TagPerfRow {
  tag: string;
  avg_return: number;
  stock_count: number;
}

type HeatmapStyle = "chips" | "compact" | "bar" | "dropdown";

interface TagHeatmapProps {
  selectedTag: string | null;
  onTagSelect: (tag: string | null) => void;
}

function getHeatBg(value: number, isSelected: boolean): string {
  if (isSelected) {
    if (value >= 0) return "bg-emerald-500 text-white";
    return "bg-red-500 text-white";
  }
  if (value >= 15) return "bg-emerald-600 text-white";
  if (value >= 5) return "bg-emerald-400 text-white";
  if (value >= 0) return "bg-emerald-100 text-emerald-800";
  if (value >= -5) return "bg-red-100 text-red-800";
  if (value >= -15) return "bg-red-400 text-white";
  return "bg-red-600 text-white";
}

function getBarColor(value: number): string {
  if (value >= 15) return "#059669";
  if (value >= 5) return "#34d399";
  if (value >= 0) return "#d1fae5";
  if (value >= -5) return "#fee2e2";
  if (value >= -15) return "#f87171";
  return "#dc2626";
}

const STYLES: { key: HeatmapStyle; label: string; icon: typeof LayoutGrid }[] = [
  { key: "chips", label: "Grid", icon: LayoutGrid },
  { key: "compact", label: "Row", icon: ArrowRightLeft },
  { key: "bar", label: "Bar", icon: Minus },
  { key: "dropdown", label: "Menu", icon: ChevronDown },
];

export function TagHeatmap({ selectedTag, onTagSelect }: TagHeatmapProps) {
  const [data, setData] = useState<TagPerfRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [style, setStyle] = useState<HeatmapStyle>("chips");

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

  // Shared header
  const header = (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
        Tag Heatmap (1M)
      </span>
      <div className="flex items-center gap-1.5">
        {selectedTag && (
          <button
            onClick={() => onTagSelect(null)}
            className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 mr-1 touch-manipulation"
          >
            <X className="w-3 h-3" />
            Clear
          </button>
        )}
        <div className="flex items-center bg-gray-100 rounded p-0.5">
          {STYLES.map((s) => (
            <button
              key={s.key}
              onClick={() => setStyle(s.key)}
              title={s.label}
              className={`p-1 rounded transition-colors touch-manipulation ${
                style === s.key
                  ? "bg-white text-gray-700 shadow-sm"
                  : "text-gray-400 hover:text-gray-600"
              }`}
            >
              <s.icon className="w-3 h-3" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="space-y-2">
        {header}
        <div className="flex gap-2 overflow-hidden">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="h-7 w-16 bg-gray-100 rounded animate-pulse flex-shrink-0" />
          ))}
        </div>
      </div>
    );
  }

  if (!data || data.length === 0) return null;

  // ========== CHIPS (default, multi-row wrap) ==========
  if (style === "chips") {
    return (
      <div className="space-y-2">
        {header}
        <div className="flex flex-wrap gap-1.5">
          {data.map((row) => {
            const isSelected = selectedTag === row.tag;
            return (
              <button
                key={row.tag}
                onClick={() => onTagSelect(isSelected ? null : row.tag)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all touch-manipulation
                  ${isSelected
                    ? "ring-2 ring-offset-1 ring-emerald-500 " + getHeatBg(row.avg_return, isSelected)
                    : getHeatBg(row.avg_return, isSelected) + " hover:opacity-80"
                  }`}
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

  // ========== COMPACT ROW (single scrollable line) ==========
  if (style === "compact") {
    return (
      <div className="space-y-1.5">
        {header}
        <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-none">
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
      </div>
    );
  }

  // ========== SEGMENTED BAR ==========
  if (style === "bar") {
    const totalStocks = data.reduce((s, r) => s + r.stock_count, 0);
    return (
      <div className="space-y-1.5">
        {header}
        <div className="flex h-7 rounded-lg overflow-hidden cursor-pointer">
          {data.map((row) => {
            const widthPct = Math.max((row.stock_count / totalStocks) * 100, 0.5);
            const isSelected = selectedTag === row.tag;
            return (
              <button
                key={row.tag}
                onClick={() => onTagSelect(isSelected ? null : row.tag)}
                className={`relative flex-shrink-0 transition-opacity hover:opacity-80 touch-manipulation ${
                  isSelected ? "ring-2 ring-inset ring-white z-10 opacity-100" : ""
                }`}
                style={{
                  width: `${widthPct}%`,
                  backgroundColor: getBarColor(row.avg_return),
                }}
                title={`${row.tag}: ${formatPercent(row.avg_return)} (${row.stock_count} stocks)`}
              >
                {widthPct > 3 && (
                  <span className="absolute inset-0 flex items-center justify-center text-[9px] font-medium truncate px-0.5"
                    style={{ color: Math.abs(row.avg_return) >= 5 ? "white" : "#374151" }}
                  >
                    {row.tag}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // ========== DROPDOWN ==========
  return (
    <div className="space-y-1.5">
      {header}
      <select
        value={selectedTag || ""}
        onChange={(e) => onTagSelect(e.target.value || null)}
        className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
      >
        <option value="">All tags</option>
        {data.map((row) => (
          <option key={row.tag} value={row.tag}>
            {row.tag} — {formatPercent(row.avg_return)} ({row.stock_count} stocks)
          </option>
        ))}
      </select>
    </div>
  );
}
