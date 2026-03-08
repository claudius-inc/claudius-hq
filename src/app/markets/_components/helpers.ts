import type { MacroIndicator, RegimeData } from "./types";
import type { HealthLevel } from "@/components/HealthDot";

export function getStatusColor(label: string): string {
  const colors: Record<string, string> = {
    "Target Zone": "bg-emerald-100 text-emerald-700",
    "At Target": "bg-emerald-100 text-emerald-700",
    Healthy: "bg-emerald-100 text-emerald-700",
    Normal: "bg-emerald-100 text-emerald-700",
    "Full Employment": "bg-emerald-100 text-emerald-700",
    Expansion: "bg-emerald-100 text-emerald-700",
    Balanced: "bg-emerald-100 text-emerald-700",
    Steep: "bg-emerald-100 text-emerald-700",
    Sustainable: "bg-emerald-100 text-emerald-700",
    Surplus: "bg-emerald-100 text-emerald-700",
    "Strong Growth": "bg-emerald-100 text-emerald-700",
    "Attractive Carry": "bg-emerald-100 text-emerald-700",
    "Moderate Growth": "bg-emerald-100 text-emerald-700",
    Accommodative: "bg-blue-100 text-blue-700",
    Normalizing: "bg-blue-100 text-blue-700",
    Neutral: "bg-gray-100 text-gray-700",
    Moderate: "bg-gray-100 text-gray-700",
    "Moderate Strength": "bg-gray-100 text-gray-700",
    Low: "bg-blue-100 text-blue-700",
    "Below Target": "bg-blue-100 text-blue-700",
    "Extremely Low": "bg-blue-100 text-blue-700",
    "Very Low": "bg-blue-100 text-blue-700",
    Flat: "bg-amber-100 text-amber-700",
    "Above Target": "bg-amber-100 text-amber-700",
    Elevated: "bg-amber-100 text-amber-700",
    Softening: "bg-amber-100 text-amber-700",
    Restrictive: "bg-amber-100 text-amber-700",
    Inverted: "bg-amber-100 text-amber-700",
    Contraction: "bg-amber-100 text-amber-700",
    Concerning: "bg-amber-100 text-amber-700",
    Weakness: "bg-amber-100 text-amber-700",
    "Moderate Deficit": "bg-amber-100 text-amber-700",
    "Large Deficit": "bg-amber-100 text-amber-700",
    Overheating: "bg-amber-100 text-amber-700",
    Unattractive: "bg-amber-100 text-amber-700",
    "Very Tight": "bg-amber-100 text-amber-700",
    High: "bg-red-100 text-red-700",
    "Very Restrictive": "bg-red-100 text-red-700",
    "Deeply Inverted": "bg-red-100 text-red-700",
    "Deep Contraction": "bg-red-100 text-red-700",
    Crisis: "bg-red-100 text-red-700",
    Recession: "bg-red-100 text-red-700",
    Stressed: "bg-red-100 text-red-700",
    Extreme: "bg-red-100 text-red-700",
    "Crisis Deficit": "bg-red-100 text-red-700",
    "Crisis/ZIRP": "bg-purple-100 text-purple-700",
    "Deflation Risk": "bg-purple-100 text-purple-700",
    "Yen Strength": "bg-blue-100 text-blue-700",
    "Yen Weakness": "bg-amber-100 text-amber-700",
    "Extreme Weakness": "bg-red-100 text-red-700",
    "Dollar Strength": "bg-amber-100 text-amber-700",
    "Euro Strength": "bg-blue-100 text-blue-700",
    "Extreme Euro Strength": "bg-amber-100 text-amber-700",
    "Weak Dollar": "bg-emerald-100 text-emerald-700",
    "Strong Dollar": "bg-amber-100 text-amber-700",
    "Very Strong Dollar": "bg-red-100 text-red-700",
    "YCC Zone": "bg-blue-100 text-blue-700",
    Transition: "bg-amber-100 text-amber-700",
    Normalization: "bg-amber-100 text-amber-700",
    "Negative/ZIRP": "bg-purple-100 text-purple-700",
  };
  return colors[label] || "bg-gray-100 text-gray-700";
}

export function getTrendArrow(current: number, avg: number): { arrow: string; color: string } {
  const pctChange = ((current - avg) / avg) * 100;
  if (pctChange > 2) return { arrow: "\u2191", color: "text-emerald-600" };
  if (pctChange < -2) return { arrow: "\u2193", color: "text-red-600" };
  return { arrow: "\u2192", color: "text-gray-500" };
}

export function formatSentimentLevel(level: string | null | undefined): string {
  if (!level) return "\u2014";
  return level.charAt(0).toUpperCase() + level.slice(1);
}

export function formatIndicatorVal(indicator: MacroIndicator): string {
  if (!indicator.data) return "\u2014";
  const v = indicator.data.current;
  const num = typeof v === "number"
    ? v.toLocaleString(undefined, { maximumFractionDigits: 2 })
    : String(v);
  if (indicator.unit === "%" || indicator.unit === "% YoY") return num + "%";
  if (indicator.unit === "bps") return num + " bps";
  if (indicator.unit === "thousands") return num + "K";
  return num;
}

export function etfColorToHealthLevel(color: string | null | undefined): HealthLevel {
  if (!color) return "neutral";
  if (color === "green" || color === "blue") return "healthy";
  if (color === "amber") return "caution";
  if (color === "red") return "warning";
  return "neutral";
}

export function detectRegime(realYield: number | null, debtToGdp: number | null): RegimeData {
  if (realYield !== null && realYield < 0 && debtToGdp !== null && debtToGdp > 100) {
    return {
      name: "Financial Repression",
      description: "Negative real rates inflating away debt",
      color: "bg-amber-100 border-amber-300 text-amber-800",
      indicators: { realYield, debtToGdp, deficitToGdp: null, dxy: null },
      implications: ["Gold outperforms", "Bonds lose purchasing power", "Real assets favored"],
    };
  }
  if (debtToGdp !== null && debtToGdp > 120) {
    return {
      name: "Fiscal Dominance",
      description: "Debt levels constraining monetary policy",
      color: "bg-red-100 border-red-300 text-red-800",
      indicators: { realYield, debtToGdp, deficitToGdp: null, dxy: null },
      implications: ["Currency debasement risk", "Hard assets critical", "Bond vigilantes watching"],
    };
  }
  if (realYield !== null && realYield > 2) {
    return {
      name: "Restrictive Policy",
      description: "Real rates positive, liquidity tightening",
      color: "bg-blue-100 border-blue-300 text-blue-800",
      indicators: { realYield, debtToGdp, deficitToGdp: null, dxy: null },
      implications: ["Bonds may outperform", "Gold faces headwinds", "Cash competitive"],
    };
  }
  return {
    name: "Transitional",
    description: "Mixed signals, regime unclear",
    color: "bg-gray-100 border-gray-300 text-gray-700",
    indicators: { realYield, debtToGdp, deficitToGdp: null, dxy: null },
    implications: ["Diversification key", "Watch for regime signals"],
  };
}
