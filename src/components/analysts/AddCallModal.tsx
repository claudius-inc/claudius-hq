"use client";

import { useState } from "react";
import { RefreshCw, X } from "lucide-react";
import type { Analyst, AnalystCall } from "./types";

interface AddCallModalProps {
  call: AnalystCall | null;
  analysts: Analyst[];
  onClose: () => void;
  onSave: () => Promise<void>;
}

export function AddCallModal({
  call,
  analysts,
  onClose,
  onSave,
}: AddCallModalProps) {
  const [analystId, setAnalystId] = useState(call?.analystId?.toString() || "");
  const [ticker, setTicker] = useState(call?.ticker || "");
  const [action, setAction] = useState(call?.action || "buy");
  const [priceTarget, setPriceTarget] = useState(
    call?.priceTarget?.toString() || ""
  );
  const [priceAtCall, setPriceAtCall] = useState(
    call?.priceAtCall?.toString() || ""
  );
  const [currentPrice, setCurrentPrice] = useState(
    call?.currentPrice?.toString() || ""
  );
  const [callDate, setCallDate] = useState(
    call?.callDate || new Date().toISOString().split("T")[0]
  );
  const [notes, setNotes] = useState(call?.notes || "");
  const [outcome, setOutcome] = useState(call?.outcome || "pending");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const isEditing = !!call;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSaving(true);

    try {
      const payload = {
        analystId,
        ticker: ticker.toUpperCase().trim(),
        action,
        priceTarget: priceTarget || null,
        priceAtCall: priceAtCall || null,
        currentPrice: currentPrice || null,
        callDate,
        notes: notes || null,
        outcome,
      };

      const url = isEditing
        ? `/api/analysts/calls/${call.id}`
        : "/api/analysts/calls";
      const method = isEditing ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to save call");
        return;
      }

      await onSave();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save call");
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
        className="bg-white rounded-lg p-6 w-full max-w-lg mx-4 shadow-xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-lg">
            {isEditing ? `Edit Call: ${call.ticker}` : "Log Analyst Call"}
          </h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Analyst */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Analyst
            </label>
            <select
              value={analystId}
              onChange={(e) => setAnalystId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
              required
            >
              <option value="">Select analyst...</option>
              {analysts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.firm})
                </option>
              ))}
            </select>
          </div>

          {/* Ticker & Action */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Ticker
              </label>
              <input
                type="text"
                value={ticker}
                onChange={(e) => setTicker(e.target.value.toUpperCase())}
                placeholder="e.g., NVDA"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Action
              </label>
              <select
                value={action}
                onChange={(e) => setAction(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
              >
                <option value="buy">Buy</option>
                <option value="sell">Sell</option>
                <option value="hold">Hold</option>
                <option value="upgrade">Upgrade</option>
                <option value="downgrade">Downgrade</option>
              </select>
            </div>
          </div>

          {/* Prices */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Price Target
              </label>
              <input
                type="number"
                step="0.01"
                value={priceTarget}
                onChange={(e) => setPriceTarget(e.target.value)}
                placeholder="$"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Price @ Call
              </label>
              <input
                type="number"
                step="0.01"
                value={priceAtCall}
                onChange={(e) => setPriceAtCall(e.target.value)}
                placeholder="$"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Current
              </label>
              <input
                type="number"
                step="0.01"
                value={currentPrice}
                onChange={(e) => setCurrentPrice(e.target.value)}
                placeholder="$"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
              />
            </div>
          </div>

          {/* Date & Outcome */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Call Date
              </label>
              <input
                type="date"
                value={callDate}
                onChange={(e) => setCallDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Outcome
              </label>
              <select
                value={outcome}
                onChange={(e) => setOutcome(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
              >
                <option value="pending">Pending</option>
                <option value="hit">Hit</option>
                <option value="miss">Miss</option>
              </select>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Rationale, context..."
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
              disabled={saving || !analystId || !ticker.trim()}
              className="px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
            >
              {saving && <RefreshCw className="w-4 h-4 animate-spin" />}
              {isEditing ? "Update Call" : "Log Call"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
