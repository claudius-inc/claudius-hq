/**
 * IBKR Portfolio Types
 */

export interface Position {
  symbol: string;
  quantity: number;
  avgCost: number;
  currency: string;
  priceCurrency?: string;
  totalCost: number;
  realizedPnl: number;
  currentPrice: number;
  dayChange: number;
  dayChangePct: number;
  marketValue: number;
  unrealizedPnl: number;
  unrealizedPnlPct: number;
  totalPnl: number;
  // Base currency (SGD) values
  liveFxRate?: number;
  historicalFxRate?: number;
  marketValueBase?: number;
  totalCostBase?: number;
  unrealizedPnlBase?: number;
  unrealizedPnlBasePct?: number;
  realizedPnlBase?: number;
}

export interface Summary {
  totalCost: number;
  totalMarketValue: number;
  totalUnrealizedPnl: number;
  totalUnrealizedPnlPct: number;
  totalRealizedPnl: number;
  dayPnl: number;
  dayPnlPct: number;
  baseCurrency?: string;
}

export interface Trade {
  id: number;
  tradeDate: string;
  symbol: string;
  action: "BUY" | "SELL";
  quantity: number;
  price: number;
  currency: string;
  commission: number;
  total: number;
}

export interface Import {
  id: number;
  filename: string;
  statementStart: string | null;
  statementEnd: string | null;
  tradeCount: number;
  dividendCount: number;
  createdAt: string;
}
