"use client";

import { useState } from "react";
import { PortfolioHolding } from "@/lib/types";

interface AddHoldingFormProps {
  onAdd: (holding: PortfolioHolding) => void;
  onCancel: () => void;
}

export function AddHoldingForm({ onAdd, onCancel }: AddHoldingFormProps) {
  const [newTicker, setNewTicker] = useState("");
  const [newAllocation, setNewAllocation] = useState("");
  const [newCostBasis, setNewCostBasis] = useState("");
  const [newShares, setNewShares] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTicker.trim() || !newAllocation) return;

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/portfolio/holdings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticker: newTicker.trim().toUpperCase(),
          target_allocation: parseFloat(newAllocation),
          cost_basis: newCostBasis ? parseFloat(newCostBasis) : null,
          shares: newShares ? parseFloat(newShares) : null,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to add");
        return;
      }

      onAdd(data.holding);
    } catch {
      setError("Network error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="card space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Ticker
          </label>
          <input
            type="text"
            value={newTicker}
            onChange={(e) => setNewTicker(e.target.value.toUpperCase())}
            placeholder="AAPL"
            className="input w-full"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Allocation %
          </label>
          <input
            type="number"
            step="0.1"
            min="0.1"
            value={newAllocation}
            onChange={(e) => setNewAllocation(e.target.value)}
            placeholder="10"
            className="input w-full"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Cost Basis (optional)
          </label>
          <input
            type="number"
            step="0.01"
            value={newCostBasis}
            onChange={(e) => setNewCostBasis(e.target.value)}
            placeholder="150.00"
            className="input w-full"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Shares (optional)
          </label>
          <input
            type="number"
            step="0.0001"
            value={newShares}
            onChange={(e) => setNewShares(e.target.value)}
            placeholder="10"
            className="input w-full"
          />
        </div>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="btn-secondary"
        >
          Cancel
        </button>
        <button type="submit" disabled={submitting} className="btn-primary">
          {submitting ? "Adding..." : "Add"}
        </button>
      </div>
    </form>
  );
}
