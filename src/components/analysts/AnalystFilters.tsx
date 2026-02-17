"use client";

import { Filter } from "lucide-react";
import type { Analyst } from "./types";

interface AnalystFiltersProps {
  analysts: Analyst[];
  filterAnalyst: string;
  filterTicker: string;
  filterAction: string;
  onFilterAnalystChange: (value: string) => void;
  onFilterTickerChange: (value: string) => void;
  onFilterActionChange: (value: string) => void;
}

export function AnalystFilters({
  analysts,
  filterAnalyst,
  filterTicker,
  filterAction,
  onFilterAnalystChange,
  onFilterTickerChange,
  onFilterActionChange,
}: AnalystFiltersProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Filter className="w-4 h-4 text-gray-400" />
      <select
        value={filterAnalyst}
        onChange={(e) => onFilterAnalystChange(e.target.value)}
        className="text-sm border border-gray-300 rounded-lg px-2 py-1"
      >
        <option value="">All Analysts</option>
        {analysts.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </select>
      <input
        type="text"
        placeholder="Ticker..."
        value={filterTicker}
        onChange={(e) => onFilterTickerChange(e.target.value)}
        className="text-sm border border-gray-300 rounded-lg px-2 py-1 w-24"
      />
      <select
        value={filterAction}
        onChange={(e) => onFilterActionChange(e.target.value)}
        className="text-sm border border-gray-300 rounded-lg px-2 py-1"
      >
        <option value="">All Actions</option>
        <option value="buy">Buy</option>
        <option value="sell">Sell</option>
        <option value="hold">Hold</option>
        <option value="upgrade">Upgrade</option>
        <option value="downgrade">Downgrade</option>
      </select>
    </div>
  );
}
