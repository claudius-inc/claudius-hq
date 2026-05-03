"use client";

import { useState } from "react";
import Link from "next/link";
import { ExternalLink, TrendingUp, TrendingDown, Minus, ChevronUp, ChevronDown, FileText } from "lucide-react";
import { MarketData, formatPercent, getPercentColor, getPercentBg, getInfoUrl } from "./index";
import { RegionBadge } from "./MarketIndicators";

function TrendArrow({ trend }: { trend: MarketData["momentum_trend"] }) {
  if (trend === "accelerating") return <TrendingUp className="w-3 h-3 text-emerald-500 shrink-0" />;
  if (trend === "decelerating") return <TrendingDown className="w-3 h-3 text-red-500 shrink-0" />;
  if (trend === "stable") return <Minus className="w-3 h-3 text-gray-300 shrink-0" />;
  return null;
}

function getRelStrengthBg(value: number | null): string {
  if (value === null) return "";
  if (value > 3) return "bg-emerald-50";
  if (value > 0) return "bg-emerald-50/50";
  if (value < -3) return "bg-red-50";
  if (value < 0) return "bg-red-50/50";
  return "";
}

function relStrengthTooltip(value: number | null, bench: string): string | undefined {
  if (value === null) return undefined;
  return `vs ${bench}: ${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}

type SortKey = "change_1d" | "change_1w" | "change_1m" | "change_3m" | "composite_score";
type SortDir = "asc" | "desc";

function SortIcon({ column, sortKey, sortDir }: { column: SortKey; sortKey: SortKey | null; sortDir: SortDir }) {
  if (sortKey !== column) return <ChevronDown className="w-3 h-3 text-gray-300" />;
  return sortDir === "desc"
    ? <ChevronDown className="w-3 h-3 text-gray-700" />
    : <ChevronUp className="w-3 h-3 text-gray-700" />;
}

interface GlobalMarketsTableProps {
  markets: MarketData[];
}

export function GlobalMarketsTable({ markets }: GlobalMarketsTableProps) {
  const [sortKey, setSortKey] = useState<SortKey | null>("composite_score");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const sorted = sortKey
    ? [...markets].sort((a, b) => {
        const av = a[sortKey] ?? -9999;
        const bv = b[sortKey] ?? -9999;
        return sortDir === "desc" ? bv - av : av - bv;
      })
    : markets;

  const thBase = "px-3 py-2.5 text-xs font-medium text-gray-500";
  const sortableTh = `${thBase} text-right cursor-pointer select-none hover:text-gray-700 transition-colors`;

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-100">
          <thead className="bg-gray-50">
            <tr>
              <th className={`${thBase} text-left w-8`}>#</th>
              <th className={`${thBase} text-left`}>Market</th>
              <th className={`${thBase} text-left`}>Region</th>
              <th className={sortableTh} onClick={() => handleSort("change_1d")}>
                <div className="flex items-center justify-end gap-1">
                  1D <SortIcon column="change_1d" sortKey={sortKey} sortDir={sortDir} />
                </div>
              </th>
              <th className={sortableTh} onClick={() => handleSort("change_1w")}>
                <div className="flex items-center justify-end gap-1">
                  1W <SortIcon column="change_1w" sortKey={sortKey} sortDir={sortDir} />
                </div>
              </th>
              <th className={sortableTh} onClick={() => handleSort("change_1m")}>
                <div className="flex items-center justify-end gap-1">
                  1M <SortIcon column="change_1m" sortKey={sortKey} sortDir={sortDir} />
                </div>
              </th>
              <th className={sortableTh} onClick={() => handleSort("change_3m")}>
                <div className="flex items-center justify-end gap-1">
                  3M <SortIcon column="change_3m" sortKey={sortKey} sortDir={sortDir} />
                </div>
              </th>
              <th className={sortableTh} onClick={() => handleSort("composite_score")}>
                <div className="flex items-center justify-end gap-1">
                  Score <SortIcon column="composite_score" sortKey={sortKey} sortDir={sortDir} />
                </div>
              </th>
              <th className={`${thBase} w-10`}></th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-100">
            {sorted.map((m, idx) => (
              <tr key={m.id} className="hover:bg-gray-50">
                <td className="px-3 py-2.5 whitespace-nowrap text-sm text-gray-500">{idx + 1}</td>
                <td className="px-3 py-2.5 whitespace-nowrap">
                  <div>
                    <div className="font-semibold text-gray-900">{m.name}</div>
                    <div className="text-xs text-gray-500">{m.ticker}</div>
                  </div>
                </td>
                <td className="px-3 py-2.5 whitespace-nowrap"><RegionBadge region={m.region} /></td>
                <td className={`px-3 py-2.5 whitespace-nowrap text-right text-sm font-medium ${getPercentColor(m.change_1d)}`}>
                  {formatPercent(m.change_1d)}
                </td>
                {/* 1W: trend arrow + relative strength tint */}
                <td
                  className={`px-3 py-2.5 whitespace-nowrap text-right text-sm font-medium ${getPercentColor(m.change_1w)} ${getRelStrengthBg(m.relative_strength_1w)}`}
                  title={relStrengthTooltip(m.relative_strength_1w, "VT")}
                >
                  <div className="flex items-center justify-end gap-1 cursor-default">
                    <TrendArrow trend={m.momentum_trend} />
                    <span>{formatPercent(m.change_1w)}</span>
                  </div>
                </td>
                {/* 1M: relative strength tint */}
                <td
                  className={`px-3 py-2.5 whitespace-nowrap text-right text-sm font-medium ${getPercentColor(m.change_1m)} ${getRelStrengthBg(m.relative_strength_1m)}`}
                  title={relStrengthTooltip(m.relative_strength_1m, "VT")}
                >
                  <span className="cursor-default">{formatPercent(m.change_1m)}</span>
                </td>
                {/* 3M: relative strength tint */}
                <td
                  className={`px-3 py-2.5 whitespace-nowrap text-right text-sm font-medium ${getPercentColor(m.change_3m)} ${getRelStrengthBg(m.relative_strength_3m)}`}
                  title={relStrengthTooltip(m.relative_strength_3m, "VT")}
                >
                  <span className="cursor-default">{formatPercent(m.change_3m)}</span>
                </td>
                <td className="px-3 py-2.5 whitespace-nowrap text-right">
                  <span className={`inline-flex items-center px-2 py-1 rounded-md text-sm font-bold ${getPercentBg(m.composite_score)} ${getPercentColor(m.composite_score)}`}>
                    {m.composite_score !== null ? m.composite_score.toFixed(1) : "-"}
                  </span>
                </td>
                <td className="px-3 py-2.5 whitespace-nowrap">
                  <div className="flex items-center gap-1">
                    <Link href={`/markets/research/${m.ticker}`} className="p-1 text-gray-400 hover:text-emerald-600 inline-block" title="View research">
                      <FileText className="w-4 h-4" />
                    </Link>
                    <a href={getInfoUrl(m.ticker)} target="_blank" rel="noopener noreferrer" className="p-1 text-gray-400 hover:text-gray-600 inline-block" title="View ETF details">
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
