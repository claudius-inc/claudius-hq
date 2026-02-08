"use client";

import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { WatchlistItem, PortfolioHolding } from "@/lib/types";
import { AllocationBar } from "./AllocationBar";

interface PortfolioInclusionModalProps {
  item: WatchlistItem;
  existingHoldings: PortfolioHolding[];
  onClose: () => void;
  onSubmit: (holding: {
    ticker: string;
    target_allocation: number;
    cost_basis: number | null;
    shares: number | null;
  }) => Promise<void>;
}

export function PortfolioInclusionModal({
  item,
  existingHoldings,
  onClose,
  onSubmit,
}: PortfolioInclusionModalProps) {
  const [allocation, setAllocation] = useState("");
  const [costBasis, setCostBasis] = useState("");
  const [shares, setShares] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Calculate current allocation
  const totalAllocation = existingHoldings.reduce(
    (sum, h) => sum + h.target_allocation,
    0
  );
  const unallocated = 100 - totalAllocation;

  // Close on escape
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [onClose]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const allocationNum = parseFloat(allocation);
    if (isNaN(allocationNum) || allocationNum <= 0) {
      setError("Please enter a valid allocation percentage");
      return;
    }

    if (allocationNum > unallocated) {
      setError(`Only ${unallocated.toFixed(1)}% unallocated. Reduce allocation or adjust other holdings.`);
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      await onSubmit({
        ticker: item.ticker,
        target_allocation: allocationNum,
        cost_basis: costBasis ? parseFloat(costBasis) : null,
        shares: shares ? parseFloat(shares) : null,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-white rounded-xl shadow-xl max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold text-gray-900">
            Portfolio Inclusion Strategy
          </h2>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600 rounded"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-6">
          {/* Adding ticker */}
          <div className="bg-emerald-50 rounded-lg p-4">
            <p className="text-sm text-emerald-700">
              Adding: <span className="font-bold">{item.ticker}</span>
            </p>
          </div>

          {/* Current Portfolio */}
          {existingHoldings.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-3">
                Current Portfolio Composition
              </h3>
              <AllocationBar
                items={existingHoldings.map((h) => ({
                  ticker: h.ticker,
                  allocation: h.target_allocation,
                }))}
              />
            </div>
          )}

          {existingHoldings.length === 0 && (
            <div className="bg-gray-50 rounded-lg p-4 text-center">
              <p className="text-sm text-gray-500">
                This will be your first portfolio holding
              </p>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Allocation */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Target Allocation for {item.ticker}
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="0.1"
                  min="0.1"
                  max={unallocated}
                  value={allocation}
                  onChange={(e) => setAllocation(e.target.value)}
                  placeholder="5"
                  className="input w-24"
                  required
                />
                <span className="text-gray-500">%</span>
                <span className="text-sm text-gray-400 ml-4">
                  ({unallocated.toFixed(1)}% available)
                </span>
              </div>
            </div>

            {/* Cost Basis */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Cost Basis (optional)
              </label>
              <div className="flex items-center gap-2">
                <span className="text-gray-500">$</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={costBasis}
                  onChange={(e) => setCostBasis(e.target.value)}
                  placeholder="150.00"
                  className="input w-32"
                />
              </div>
              <p className="text-xs text-gray-400 mt-1">
                Average price you paid per share
              </p>
            </div>

            {/* Shares */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Shares (optional)
              </label>
              <input
                type="number"
                step="0.0001"
                min="0"
                value={shares}
                onChange={(e) => setShares(e.target.value)}
                placeholder="10"
                className="input w-32"
              />
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 rounded p-2">
                {error}
              </p>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-4 border-t">
              <button
                type="button"
                onClick={onClose}
                className="btn-secondary"
                disabled={submitting}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn-primary"
                disabled={submitting}
              >
                {submitting ? "Adding..." : "Add to Portfolio"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
