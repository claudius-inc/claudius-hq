/**
 * Sector Momentum Types
 */

export interface SectorData {
  id: string;
  name: string;
  ticker: string;
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

export interface MarketBenchmark {
  ticker: string;
  change_1w: number | null;
  change_1m: number | null;
  change_3m: number | null;
}
