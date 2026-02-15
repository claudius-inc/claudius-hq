"use client";

import { X, Sparkles } from "lucide-react";

interface AddThemeModalProps {
  newName: string;
  newDescription: string;
  newStocks: string;
  themeSuggestions: string[];
  loadingThemeSuggestions: boolean;
  submitting: boolean;
  error: string | null;
  onNameChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onStocksChange: (value: string) => void;
  onUseSuggestions: () => void;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
}

export function AddThemeModal({
  newName,
  newDescription,
  newStocks,
  themeSuggestions,
  loadingThemeSuggestions,
  submitting,
  error,
  onNameChange,
  onDescriptionChange,
  onStocksChange,
  onUseSuggestions,
  onClose,
  onSubmit,
}: AddThemeModalProps) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4 p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Add Theme</h3>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input
              type="text"
              value={newName}
              onChange={(e) => onNameChange(e.target.value)}
              placeholder="e.g., Quantum Computing"
              className="input w-full"
              required
            />
            {loadingThemeSuggestions && (
              <p className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                <span className="h-3 w-3 border border-gray-400 border-t-transparent rounded-full animate-spin" />
                Looking for suggestions...
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description (optional)</label>
            <input
              type="text"
              value={newDescription}
              onChange={(e) => onDescriptionChange(e.target.value)}
              placeholder="Brief description"
              className="input w-full"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-sm font-medium text-gray-700">Stocks</label>
              {themeSuggestions.length > 0 && (
                <button
                  type="button"
                  onClick={onUseSuggestions}
                  className="text-xs text-emerald-600 hover:text-emerald-700 flex items-center gap-1"
                >
                  <Sparkles className="w-3 h-3" />
                  Use suggestions ({themeSuggestions.length})
                </button>
              )}
            </div>
            <input
              type="text"
              value={newStocks}
              onChange={(e) => onStocksChange(e.target.value)}
              placeholder="IONQ, RGTI, QBTS"
              className="input w-full"
            />
            {themeSuggestions.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {themeSuggestions.map((ticker) => (
                  <span key={ticker} className="inline-flex items-center px-2 py-0.5 bg-emerald-50 text-emerald-700 text-xs rounded-full border border-emerald-200">
                    {ticker}
                  </span>
                ))}
              </div>
            )}
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary">
              Cancel
            </button>
            <button type="submit" disabled={submitting} className="btn-primary">
              {submitting ? "Creating..." : "Create Theme"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
