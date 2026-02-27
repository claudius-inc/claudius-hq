"use client";

import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { MarketData } from "./types";

export function MomentumTrendIcon({ trend }: { trend: MarketData["momentum_trend"] }) {
  if (trend === "accelerating") {
    return (
      <span title="Accelerating">
        <TrendingUp className="w-4 h-4 text-emerald-600" />
      </span>
    );
  }
  if (trend === "decelerating") {
    return (
      <span title="Decelerating">
        <TrendingDown className="w-4 h-4 text-red-600" />
      </span>
    );
  }
  if (trend === "stable") {
    return (
      <span title="Stable">
        <Minus className="w-4 h-4 text-gray-400" />
      </span>
    );
  }
  return null;
}

export function RelativeStrengthBar({ value }: { value: number | null }) {
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
      <span
        className={`text-xs font-medium ${isPositive ? "text-emerald-600" : "text-red-600"}`}
      >
        {isPositive ? "+" : ""}
        {value.toFixed(1)}%
      </span>
    </div>
  );
}

export function RegionBadge({ region }: { region: string }) {
  const colors: Record<string, string> = {
    Americas: "bg-blue-100 text-blue-700",
    Europe: "bg-purple-100 text-purple-700",
    "Asia Pacific": "bg-amber-100 text-amber-700",
    Global: "bg-gray-100 text-gray-700",
  };
  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${colors[region] || "bg-gray-100 text-gray-700"}`}
    >
      {region}
    </span>
  );
}
