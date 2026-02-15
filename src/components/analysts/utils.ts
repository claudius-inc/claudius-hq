import type { AnalystCall } from "./types";

export const formatPrice = (price: number | null): string => {
  if (price === null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(price);
};

export const formatPct = (value: number | null): string => {
  if (value === null) return "—";
  const sign = value >= 0 ? "+" : "";
  return `${sign}${(value * 100).toFixed(1)}%`;
};

export const getSuccessRateColor = (rate: number | null): string => {
  if (rate === null) return "text-gray-400";
  if (rate >= 0.7) return "text-green-600";
  if (rate >= 0.5) return "text-amber-600";
  return "text-red-600";
};

export const getSuccessRateBg = (rate: number | null): string => {
  if (rate === null) return "bg-gray-100";
  if (rate >= 0.7) return "bg-green-100";
  if (rate >= 0.5) return "bg-amber-100";
  return "bg-red-100";
};

export const getActionBadge = (action: string): string => {
  const colors: Record<string, string> = {
    buy: "bg-green-100 text-green-700",
    sell: "bg-red-100 text-red-700",
    hold: "bg-gray-100 text-gray-700",
    upgrade: "bg-emerald-100 text-emerald-700",
    downgrade: "bg-rose-100 text-rose-700",
  };
  return colors[action] || "bg-gray-100 text-gray-700";
};

export const getOutcomeBadge = (outcome: string | null): string => {
  const colors: Record<string, string> = {
    hit: "bg-green-100 text-green-700",
    miss: "bg-red-100 text-red-700",
    pending: "bg-amber-100 text-amber-700",
  };
  return colors[outcome || "pending"] || "bg-gray-100 text-gray-700";
};

export const calculateReturn = (call: AnalystCall): number | null => {
  if (!call.priceAtCall || !call.currentPrice) return null;
  const ret = (call.currentPrice - call.priceAtCall) / call.priceAtCall;
  // Invert return for sell calls
  if (call.action === "sell" || call.action === "downgrade") {
    return -ret;
  }
  return ret;
};
