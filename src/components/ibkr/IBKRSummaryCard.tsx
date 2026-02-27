"use client";

import { Upload } from "lucide-react";
import { Summary } from "./types";
import { formatCurrency, formatPct } from "./utils";

interface IBKRSummaryCardProps {
  summary: Summary;
  baseCurrency: string;
  onImportClick: () => void;
}

export function IBKRSummaryCard({
  summary,
  baseCurrency,
  onImportClick,
}: IBKRSummaryCardProps) {
  return (
    <div className="bg-white rounded-lg border p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-gray-400 uppercase tracking-wide">
          Portfolio Summary ({baseCurrency})
        </span>
        <button
          onClick={onImportClick}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <Upload className="w-3.5 h-3.5" />
          Import
        </button>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div>
          <div className="text-sm text-gray-500">Market Value</div>
          <div className="text-xl font-semibold">
            {formatCurrency(summary.totalMarketValue, baseCurrency)}
          </div>
        </div>
        <div>
          <div className="text-sm text-gray-500">Day P&L</div>
          <div
            className={`text-xl font-semibold ${
              summary.dayPnl >= 0 ? "text-emerald-600" : "text-red-600"
            }`}
          >
            {formatCurrency(summary.dayPnl, baseCurrency)} (
            {formatPct(summary.dayPnlPct)})
          </div>
        </div>
        <div>
          <div className="text-sm text-gray-500">Unrealized P&L</div>
          <div
            className={`text-xl font-semibold ${
              summary.totalUnrealizedPnl >= 0
                ? "text-emerald-600"
                : "text-red-600"
            }`}
          >
            {formatCurrency(summary.totalUnrealizedPnl, baseCurrency)} (
            {formatPct(summary.totalUnrealizedPnlPct)})
          </div>
        </div>
        <div>
          <div className="text-sm text-gray-500">Realized P&L</div>
          <div
            className={`text-xl font-semibold ${
              summary.totalRealizedPnl >= 0
                ? "text-emerald-600"
                : "text-red-600"
            }`}
          >
            {formatCurrency(summary.totalRealizedPnl, baseCurrency)}
          </div>
        </div>
      </div>
    </div>
  );
}
