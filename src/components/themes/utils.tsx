import { ThemeStockStatus } from "@/lib/types";

export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined) return "-";
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

export function getPercentColor(value: number | null | undefined): string {
  if (value === null || value === undefined) return "text-gray-400";
  return value >= 0 ? "text-emerald-600" : "text-red-600";
}

export function formatPrice(price: number | null | undefined): string {
  if (price === null || price === undefined) return "-";
  return `$${price.toFixed(2)}`;
}

export function getTradingViewUrl(ticker: string): string {
  if (ticker.includes(".")) {
    return `https://www.tradingview.com/chart/?symbol=${ticker}`;
  }
  return `https://www.tradingview.com/chart/?symbol=${ticker}`;
}

export function StatusBadge({ status }: { status: ThemeStockStatus }) {
  const styles: Record<ThemeStockStatus, string> = {
    watching: "bg-gray-100 text-gray-600",
    accumulating: "bg-amber-100 text-amber-700",
    holding: "bg-emerald-100 text-emerald-700",
  };
  const labels: Record<ThemeStockStatus, string> = {
    watching: "👀",
    accumulating: "📈",
    holding: "💎",
  };
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${styles[status]}`} title={status}>
      {labels[status]}
    </span>
  );
}

export function GapIndicator({ gap, hasTarget }: { gap: number | null; hasTarget: boolean }) {
  if (!hasTarget) return <span className="text-gray-300">-</span>;
  if (gap === null) return <span className="text-gray-400">-</span>;
  
  const isAbove = gap > 0;
  const color = isAbove ? "text-red-500" : "text-emerald-600";
  const label = isAbove ? "above" : "below";
  
  return (
    <span className={`text-xs ${color}`} title={`${Math.abs(gap).toFixed(1)}% ${label} target`}>
      {isAbove ? "+" : ""}{gap.toFixed(1)}%
    </span>
  );
}
