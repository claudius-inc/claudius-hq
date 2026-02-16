export interface StockAlert {
  id: number;
  ticker: string;
  accumulateLow: number | null;
  accumulateHigh: number | null;
  strongBuyLow: number | null;
  strongBuyHigh: number | null;
  status: "watching" | "triggered" | "paused";
  lastTriggered: string | null;
  notes: string | null;
  createdAt: string;
  // Live data
  currentPrice: number | null;
  dayChange: number | null;
  companyName: string | null;
}

export type ZoneStatus = "strong-buy" | "accumulate" | "below-strong-buy" | null;

export function formatPrice(price: number | null): string {
  if (price === null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(price);
}

export function formatPct(value: number | null): string {
  if (value === null) return "—";
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

export function getZoneStatus(alert: StockAlert): ZoneStatus {
  const price = alert.currentPrice;
  if (!price) return null;

  // Check strong buy zone first
  if (
    alert.strongBuyLow !== null &&
    alert.strongBuyHigh !== null &&
    price >= alert.strongBuyLow &&
    price <= alert.strongBuyHigh
  ) {
    return "strong-buy";
  }

  // Check accumulate zone
  if (
    alert.accumulateLow !== null &&
    alert.accumulateHigh !== null &&
    price >= alert.accumulateLow &&
    price <= alert.accumulateHigh
  ) {
    return "accumulate";
  }

  // Below strong buy zone
  if (alert.strongBuyLow !== null && price < alert.strongBuyLow) {
    return "below-strong-buy";
  }

  return null;
}
