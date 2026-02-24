import { ThemeStockStatus } from "@/lib/types";

export interface SuggestedStock {
  ticker: string;
  name?: string;
  adding?: boolean;
}

export interface EditingStock {
  themeId: number;
  ticker: string;
  target_price: number | null;
  status: ThemeStockStatus;
  notes: string | null;
}
