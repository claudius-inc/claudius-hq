"use client";

import { useState } from "react";

interface WatchlistAddFormProps {
  onAdd: (item: { ticker: string; targetPrice: number | null; notes: string | null }) => Promise<boolean>;
  onCancel: () => void;
}

export function WatchlistAddForm({ onAdd, onCancel }: WatchlistAddFormProps) {
  const [ticker, setTicker] = useState("");
  const [targetPrice, setTargetPrice] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ticker.trim()) return;

    setSubmitting(true);
    setError(null);

    const success = await onAdd({
      ticker: ticker.trim().toUpperCase(),
      targetPrice: targetPrice ? parseFloat(targetPrice) : null,
      notes: notes.trim() || null,
    });

    if (success) {
      setTicker("");
      setTargetPrice("");
      setNotes("");
    } else {
      setError("Failed to add item");
    }

    setSubmitting(false);
  };

  return (
    <form onSubmit={handleSubmit} className="card space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Ticker
          </label>
          <input
            type="text"
            value={ticker}
            onChange={(e) => setTicker(e.target.value.toUpperCase())}
            placeholder="AAPL"
            className="input w-full"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Target Price (optional)
          </label>
          <input
            type="number"
            step="0.01"
            value={targetPrice}
            onChange={(e) => setTargetPrice(e.target.value)}
            placeholder="150.00"
            className="input w-full"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Notes (optional)
          </label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Waiting for earnings..."
            className="input w-full"
          />
        </div>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="btn-secondary">
          Cancel
        </button>
        <button type="submit" disabled={submitting} className="btn-primary">
          {submitting ? "Adding..." : "Add"}
        </button>
      </div>
    </form>
  );
}
