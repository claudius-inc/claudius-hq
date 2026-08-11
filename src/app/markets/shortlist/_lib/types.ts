/** One bar, compact: [openTimeMs, open, high, low, close, volume]. */
export type CompactBar = [number, number, number, number, number, number];

export interface ShortlistChart {
  base: string;
  symbol: string;
  side: "long" | "short";
  category: string;
  score: number;
  maxScore: number;
  /** Which factors fired, as initials. `Q` (quarterly VWAP) is worth 2 points. */
  factors: string;
  rsi: number | null;
  /** Own-history volatility rank, 0-100. Low = coiled, high = already moving. */
  volPctl: number | null;
  changePct: number | null;
  vwapDistPct: number | null;
  oiChangePct: number | null;
  qvwap: number | null;
  /** Relative volume: this bar's traded value over its own 20-bar average. */
  rvol: number | null;
  /** Negated 1-day return — high means the name just fell hardest. */
  rev6: number | null;
  /** |latest funding rate|, as a fraction. */
  fundingAbs: number | null;
  /** True when the name cleared the volume-and-funding magnitude gate. */
  comboGated: boolean;
  bars: CompactBar[];
}

/**
 * Chart height, shared by the loaded chart and its skeleton.
 *
 * Exported as a constant so the placeholder reserves exactly the height the
 * canvas will occupy — a skeleton with a hand-picked height is how layout shift
 * gets reintroduced.
 */
export const CHART_HEIGHT = 200;

/** Cards rendered by the skeleton. Matches a typical full shortlist. */
export const SKELETON_CARDS = 16;
