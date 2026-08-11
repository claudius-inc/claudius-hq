/** One row of the stored search ledger. */
export interface ComboResultRow {
  runDate: string;
  horizon: number;
  objective: string;
  /** Pipe-joined, sorted signal names. */
  signals: string;
  k: number;
  effectiveRank: number | null;
  trainValue: number | null;
  holdoutValue: number | null;
  holdoutIc: number | null;
  holdoutIcT: number | null;
  holdoutCapture: number | null;
  holdoutBasket: number | null;
  holdoutBasketT: number | null;
  holdoutAbs: number | null;
  baselineAbs: number | null;
  nTimestamps: number | null;
  isFrontier: boolean;
  isChampion: boolean;
}

/**
 * Skeleton row count, shared by the loaded table and its placeholder so the
 * outer height is reserved identically on both branches.
 */
export const SKELETON_ROWS = 12;

/** Signal-group colours, one system across the picker and the result chips. */
export const GROUP_COLOR: Record<string, string> = {
  incumbent: "text-neutral-500 border-neutral-300 dark:border-neutral-700",
  structure: "text-sky-700 border-sky-300 dark:text-sky-400 dark:border-sky-800",
  volume: "text-amber-700 border-amber-300 dark:text-amber-400 dark:border-amber-800",
  momentum: "text-violet-700 border-violet-300 dark:text-violet-400 dark:border-violet-800",
  volatility: "text-rose-700 border-rose-300 dark:text-rose-400 dark:border-rose-800",
  attention: "text-emerald-700 border-emerald-300 dark:text-emerald-400 dark:border-emerald-800",
};
