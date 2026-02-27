/**
 * Global Markets Types
 */

export interface MarketData {
  id: string;
  name: string;
  ticker: string;
  region: string;
  price: number | null;
  change_1d: number | null;
  change_1w: number | null;
  change_1m: number | null;
  change_3m: number | null;
  change_6m: number | null;
  composite_score: number | null;
  relative_strength_1m: number | null;
  momentum_trend: "accelerating" | "decelerating" | "stable" | null;
}

export interface BenchmarkData {
  ticker: string;
  name: string;
  change_1w: number | null;
  change_1m: number | null;
  change_3m: number | null;
}
