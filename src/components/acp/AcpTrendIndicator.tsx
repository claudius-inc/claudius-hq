"use client";

import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface AcpTrendIndicatorProps {
  value: number; // percentage change
  size?: "sm" | "md";
}

export function AcpTrendIndicator({ value, size = "sm" }: AcpTrendIndicatorProps) {
  const iconSize = size === "sm" ? "w-3.5 h-3.5" : "w-4 h-4";
  const textSize = size === "sm" ? "text-xs" : "text-sm";

  if (value > 0) {
    return (
      <span className={`inline-flex items-center gap-0.5 text-green-600 ${textSize}`}>
        <TrendingUp className={iconSize} />
        <span>+{value.toFixed(0)}%</span>
      </span>
    );
  }

  if (value < 0) {
    return (
      <span className={`inline-flex items-center gap-0.5 text-red-600 ${textSize}`}>
        <TrendingDown className={iconSize} />
        <span>{value.toFixed(0)}%</span>
      </span>
    );
  }

  return (
    <span className={`inline-flex items-center gap-0.5 text-gray-400 ${textSize}`}>
      <Minus className={iconSize} />
      <span>flat</span>
    </span>
  );
}
