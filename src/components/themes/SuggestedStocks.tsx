"use client";

import { Plus, Sparkles } from "lucide-react";
import { SuggestedStock } from "./types";

interface SuggestedStocksProps {
  themeId: number;
  suggestions: SuggestedStock[];
  loadingSuggestions: boolean;
  onAddStock: (themeId: number, ticker: string) => void;
}

export function SuggestedStocks({
  themeId,
  suggestions,
  loadingSuggestions,
  onAddStock,
}: SuggestedStocksProps) {
  if (!loadingSuggestions && suggestions.length === 0) {
    return null;
  }

  return (
    <div className="px-6 py-4 border-t border-gray-200 bg-gray-100">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles className="w-4 h-4 text-amber-500" />
        <span className="text-sm font-medium text-gray-700">Suggested Stocks</span>
      </div>
      {loadingSuggestions ? (
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <div className="h-4 w-4 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          Finding related stocks...
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {suggestions.map((s) => (
            <button
              key={s.ticker}
              onClick={() => onAddStock(themeId, s.ticker)}
              disabled={s.adding}
              className="inline-flex items-center gap-1 px-3 py-1.5 bg-white border border-gray-200 rounded-full text-sm font-medium text-gray-700 hover:bg-emerald-50 hover:border-emerald-200 hover:text-emerald-700 transition-colors disabled:opacity-50"
            >
              {s.adding ? (
                <div className="h-3 w-3 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
              ) : (
                <Plus className="w-3 h-3" />
              )}
              <span>{s.ticker}</span>
              {s.name && (
                <span className="text-gray-400 font-normal">{s.name}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
