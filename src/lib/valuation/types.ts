/**
 * Relative Valuation Framework Types
 * 
 * Types for expected returns calculations across asset classes.
 */

export type AssetSymbol = "SPY" | "GLD" | "BTC" | "TLT";

export type ConfidenceLevel = "low" | "medium" | "high";

export type TacticalSignal = "below" | "at" | "above";

export type MomentumSignal = "bearish" | "neutral" | "bullish";

export type SentimentLevel = "fear" | "neutral" | "greed" | "extreme-fear" | "extreme-greed";

export type PositioningZone = "extreme-long" | "long" | "neutral" | "short" | "extreme-short";

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
  /** Position relative to 50 DMA (for SPY) */
  vs50dma?: TacticalSignal;
  /** RSI 14-day (for SPY) */
  rsi?: number;
  /** VIX level (for SPY) */
  vix?: number;
  /** Yield curve slope: 10Y - 2Y (for bonds) */
  yieldCurveSlope?: number;
  /** Sentiment level (for BTC) */
  sentiment?: SentimentLevel;
  /** CFTC positioning zone (for Gold) */
  positioning?: PositioningZone;
  /** Composite tactical bias */
  bias: "bullish" | "neutral" | "bearish";
  /** Brief tactical note */
  note?: string;
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

export type SignalAlignment = "strong-buy" | "buy" | "mixed" | "sell" | "strong-sell";

export interface TacticalSummary {
  /** Overall alignment between strategic and tactical */
  alignment: SignalAlignment;
  /** Brief summary message */
  message: string;
  /** Assets with aligned signals (strategic + tactical agree) */
  aligned: AssetSymbol[];
  /** Assets with divergent signals */
  divergent: AssetSymbol[];
}

export interface ExpectedReturnsResponse {
  /** Array of asset valuations */
  assets: AssetValuation[];
  /** Assets ranked by expected return (highest first) */
  relativeRanking: AssetSymbol[];
  /** Combined tactical summary */
  tacticalSummary: TacticalSummary;
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
