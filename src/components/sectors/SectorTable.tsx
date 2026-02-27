"use client";

import { TrendingUp, TrendingDown, Minus, ExternalLink, List } from "lucide-react";
import { SectorData } from "./types";
import { formatPercent, getPercentColor, getPercentBg, getHoldingsUrl } from "./utils";

function MomentumTrendIcon({ trend }: { trend: SectorData["momentum_trend"] }) {
  if (trend === "accelerating") {
    return <span title="Accelerating"><TrendingUp className="w-4 h-4 text-emerald-600" /></span>;
  }
  if (trend === "decelerating") {
    return <span title="Decelerating"><TrendingDown className="w-4 h-4 text-red-600" /></span>;
  }
  if (trend === "stable") {
    return <span title="Stable"><Minus className="w-4 h-4 text-gray-400" /></span>;
  }
  return null;
}

function RelativeStrengthBar({ value }: { value: number | null }) {
  if (value === null) return <span className="text-gray-400">-</span>;
  const maxWidth = 60;
  const absValue = Math.min(Math.abs(value), 10);
  const width = (absValue / 10) * maxWidth;
  const isPositive = value >= 0;

  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-2 bg-gray-200 rounded-full overflow-hidden relative">
        <div className="absolute inset-y-0 left-1/2 w-px bg-gray-300" />
        {isPositive ? (
          <div
            className="absolute inset-y-0 left-1/2 bg-emerald-500 rounded-r-full"
            style={{ width: `${width / 2}px` }}
          />
        ) : (
          <div
            className="absolute inset-y-0 right-1/2 bg-red-500 rounded-l-full"
            style={{ width: `${width / 2}px` }}
          />
        )}
      </div>
      <span className={`text-xs font-medium ${isPositive ? "text-emerald-600" : "text-red-600"}`}>
        {isPositive ? "+" : ""}{value.toFixed(1)}%
      </span>
    </div>
  );
}

interface SectorTableProps {
  sectors: SectorData[];
}

export function SectorTable({ sectors }: SectorTableProps) {
  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-8">#</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Sector</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">1D</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">1W</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">1M</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">3M</th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Trend</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">vs SPY</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Score</th>
              <th className="px-4 py-3 w-10"></th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {sectors.map((sector, idx) => (
              <tr key={sector.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">{idx + 1}</td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <div>
                    <div className="font-semibold text-gray-900">{sector.name}</div>
                    <div className="text-xs text-gray-500">{sector.ticker}</div>
                  </div>
                </td>
                <td className={`px-4 py-3 whitespace-nowrap text-right text-sm font-medium ${getPercentColor(sector.change_1d)}`}>
                  {formatPercent(sector.change_1d)}
                </td>
                <td className={`px-4 py-3 whitespace-nowrap text-right text-sm font-medium ${getPercentColor(sector.change_1w)}`}>
                  {formatPercent(sector.change_1w)}
                </td>
                <td className={`px-4 py-3 whitespace-nowrap text-right text-sm font-medium ${getPercentColor(sector.change_1m)}`}>
                  {formatPercent(sector.change_1m)}
                </td>
                <td className={`px-4 py-3 whitespace-nowrap text-right text-sm font-medium ${getPercentColor(sector.change_3m)}`}>
                  {formatPercent(sector.change_3m)}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-center">
                  <MomentumTrendIcon trend={sector.momentum_trend} />
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <RelativeStrengthBar value={sector.relative_strength_1m} />
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-right">
                  <span className={`inline-flex items-center px-2 py-1 rounded-md text-sm font-bold ${getPercentBg(sector.composite_score)} ${getPercentColor(sector.composite_score)}`}>
                    {sector.composite_score !== null ? sector.composite_score.toFixed(1) : "-"}
                  </span>
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <div className="flex items-center gap-1">
                    <a href={getHoldingsUrl(sector.ticker)} target="_blank" rel="noopener noreferrer" className="p-1 text-gray-400 hover:text-blue-600 inline-block" title="View ETF holdings">
                      <List className="w-4 h-4" />
                    </a>
                    <a href={`https://www.tradingview.com/chart/?symbol=${sector.ticker}`} target="_blank" rel="noopener noreferrer" className="p-1 text-gray-400 hover:text-gray-600 inline-block" title="View chart on TradingView">
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
