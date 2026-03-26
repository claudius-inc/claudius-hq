/**
 * Common types for market-specific signals.
 * These are supplementary signals - scanner works without them.
 */

// US: OpenInsider signals
export interface USInsiderSignals {
  insiderBuyCount: number;
  insiderSellCount: number;
  isClusterBuy: boolean; // 3+ insiders buying in 30 days
  totalBuyValue: number;
  totalSellValue: number;
  lastTransactionDate?: string;
}

// China: Stock Connect flows
export interface CNStockConnectSignals {
  northboundHolding: number; // Number of shares held
  dailyChange: number; // Change in shares (positive = buying)
  percentOfFloat: number; // Holdings as % of float
  dailyChangeValue?: number; // Change in value (RMB)
}

// Hong Kong: Short selling data
export interface HKShortSellingSignals {
  shortVolume: number;
  shortTurnoverRatio: number; // Short volume / total turnover
  dataDate: string;
}

// Japan: Governance catalyst flags
export interface JPGovernanceSignals {
  hasPBRBelowOne: boolean;
  hasCapitalEfficiencyPlan: boolean;
  governanceCatalystScore: number; // 0-10
}

// Singapore: GLC and S-chip flags
export interface SGMarketFlags {
  isGLC: boolean; // Temasek-linked
  isSChip: boolean; // China-domiciled SGX stock
  glcParent?: string; // e.g., "Temasek"
}

// Combined market signals (stored in market_signals JSON field)
export interface MarketSignals {
  us?: USInsiderSignals | null;
  cn?: CNStockConnectSignals | null;
  hk?: HKShortSellingSignals | null;
  jp?: JPGovernanceSignals | null;
  sg?: SGMarketFlags | null;
  fetchedAt: string;
  errors?: string[];
}

// Signal fetcher function type
export type SignalFetcher<T> = (ticker: string) => Promise<T | null>;
