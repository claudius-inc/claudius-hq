"use client";

import { useState } from "react";
import { RefreshCw, X } from "lucide-react";
import { StockAlert } from "./types";

interface AlertFormProps {
  alert: StockAlert | null;
  onClose: () => void;
  onSave: () => Promise<void>;
}

export function AlertForm({ alert, onClose, onSave }: AlertFormProps) {
  const [ticker, setTicker] = useState(alert?.ticker || "");
  const [accumulateLow, setAccumulateLow] = useState(
    alert?.accumulateLow?.toString() || ""
  );
  const [accumulateHigh, setAccumulateHigh] = useState(
    alert?.accumulateHigh?.toString() || ""
  );
  const [strongBuyLow, setStrongBuyLow] = useState(
    alert?.strongBuyLow?.toString() || ""
  );
  const [strongBuyHigh, setStrongBuyHigh] = useState(
    alert?.strongBuyHigh?.toString() || ""
  );
  const [notes, setNotes] = useState(alert?.notes || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const isEditing = !!alert;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSaving(true);

    try {
      const payload = {
        ticker: ticker.toUpperCase().trim(),
        accumulate_low: accumulateLow ? parseFloat(accumulateLow) : null,
        accumulate_high: accumulateHigh ? parseFloat(accumulateHigh) : null,
        strong_buy_low: strongBuyLow ? parseFloat(strongBuyLow) : null,
        strong_buy_high: strongBuyHigh ? parseFloat(strongBuyHigh) : null,
        notes: notes || null,
      };

      const url = isEditing ? `/api/alerts/${alert.id}` : "/api/alerts";
      const method = isEditing ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to save alert");
        return;
      }

      await onSave();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save alert");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg p-6 w-full max-w-lg mx-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-lg">
            {isEditing ? `Edit Alert: ${alert.ticker}` : "Add Price Alert"}
          </h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Ticker */}
          {!isEditing && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Ticker Symbol
              </label>
              <input
                type="text"
                value={ticker}
                onChange={(e) => setTicker(e.target.value.toUpperCase())}
                placeholder="e.g., AAPL"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                required
              />
            </div>
          )}

          {/* Accumulate Zone */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Accumulation Zone (start buying)
            </label>
            <div className="grid grid-cols-2 gap-3">
              <input
                type="number"
                step="0.01"
                value={accumulateLow}
                onChange={(e) => setAccumulateLow(e.target.value)}
                placeholder="Low ($)"
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
              />
              <input
                type="number"
                step="0.01"
                value={accumulateHigh}
                onChange={(e) => setAccumulateHigh(e.target.value)}
                placeholder="High ($)"
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
              />
            </div>
          </div>

          {/* Strong Buy Zone */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Strong Buy Zone (aggressive buying)
            </label>
            <div className="grid grid-cols-2 gap-3">
              <input
                type="number"
                step="0.01"
                value={strongBuyLow}
                onChange={(e) => setStrongBuyLow(e.target.value)}
                placeholder="Low ($)"
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
              />
              <input
                type="number"
                step="0.01"
                value={strongBuyHigh}
                onChange={(e) => setStrongBuyHigh(e.target.value)}
                placeholder="High ($)"
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Notes (optional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Thesis, reasons for these price levels..."
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none resize-none"
            />
          </div>

          {/* Error */}
          {error && (
            <div className="p-3 bg-red-50 text-red-700 text-sm rounded-lg">
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || (!isEditing && !ticker.trim())}
              className="px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
            >
              {saving && <RefreshCw className="w-4 h-4 animate-spin" />}
              {isEditing ? "Update Alert" : "Create Alert"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
