/**
 * Relative Valuation Framework Types
 * 
 * Types for expected returns calculations across asset classes.
 */

export type AssetSymbol = "SPY" | "GLD" | "BTC" | "TLT";

export type ConfidenceLevel = "low" | "medium" | "high";

export type TacticalSignal = "below" | "at" | "above";

export type MomentumSignal = "bearish" | "neutral" | "bullish";

export interface ValuationMetric {
  /** Metric name (e.g., "PE", "Au/M2", "Yield") */
  metric: string;
  /** Current value of the metric */
  value: number;
  /** Historical percentile (0-100) */
  percentile: number;
  /** Valuation zone */
  zone: "cheap" | "fair" | "expensive";
}

export interface ExpectedReturn {
  /** Expected 10-year annualized real return */
  tenYear: number;
  /** Confidence in the estimate */
  confidence: ConfidenceLevel;
}

export interface TacticalOverlay {
  /** Position relative to 200 DMA */
  vs200dma: TacticalSignal;
  /** Short-term momentum */
  momentum: MomentumSignal;
}

export interface AssetValuation {
  /** Ticker symbol */
  symbol: AssetSymbol;
  /** Human-readable name */
  name: string;
  /** Current price (USD) */
  price: number;
  /** Valuation metrics */
  valuation: ValuationMetric;
  /** Expected returns based on valuation */
  expectedReturn: ExpectedReturn;
  /** Tactical signals */
  tactical: TacticalOverlay;
}

export interface ExpectedReturnsResponse {
  /** Array of asset valuations */
  assets: AssetValuation[];
  /** Assets ranked by expected return (highest first) */
  relativeRanking: AssetSymbol[];
  /** Timestamp of last update */
  updatedAt: string;
  /** Status of data fetch */
  status: "live" | "partial" | "error";
  /** Optional error message */
  error?: string;
}

// Lookup table types
export interface ReturnLookupEntry {
  min: number;
  max: number;
  expectedReturn: number;
  confidence: ConfidenceLevel;
}

export type ReturnLookupTable = ReturnLookupEntry[];
