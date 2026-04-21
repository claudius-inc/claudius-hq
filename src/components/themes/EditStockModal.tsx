"use client";

import { X } from "lucide-react";
import { ThemeStockStatus } from "@/lib/types";
import { EditingStock } from "./types";
import { Select } from "@/components/ui/Select";

interface EditStockModalProps {
  editingStock: EditingStock;
  editSubmitting: boolean;
  onClose: () => void;
  onChange: (stock: EditingStock) => void;
  onSubmit: (e: React.FormEvent) => void;
}

export function EditStockModal({
  editingStock,
  editSubmitting,
  onClose,
  onChange,
  onSubmit,
}: EditStockModalProps) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl max-w-sm w-full mx-4 p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Edit {editingStock.ticker}</h3>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Ticker</label>
            <input
              type="text"
              value={editingStock.new_ticker}
              onChange={(e) => onChange({ ...editingStock, new_ticker: e.target.value.trim().toUpperCase() })}
              placeholder="e.g., NVDA, 600519.SS"
              className="input w-full font-mono"
            />
            {editingStock.new_ticker !== editingStock.ticker && (
              <p className="text-xs text-amber-600 mt-1">Rename from {editingStock.ticker} to {editingStock.new_ticker}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
            <Select
              value={editingStock.status}
              onChange={(val) => onChange({ ...editingStock, status: val as ThemeStockStatus })}
              options={[
                { value: "watching", label: "Watching" },
                { value: "accumulating", label: "Accumulating" },
                { value: "holding", label: "Holding" },
              ]}
              className="w-full"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Target Price</label>
            <input
              type="number"
              step="0.01"
              value={editingStock.target_price ?? ""}
              onChange={(e) => onChange({ 
                ...editingStock, 
                target_price: e.target.value ? parseFloat(e.target.value) : null 
              })}
              placeholder="e.g., 150.00"
              className="input w-full"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea
              value={editingStock.notes ?? ""}
              onChange={(e) => onChange({ ...editingStock, notes: e.target.value || null })}
              placeholder="Investment thesis, key levels..."
              className="input w-full h-20 resize-none"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary">
              Cancel
            </button>
            <button type="submit" disabled={editSubmitting} className="btn-primary">
              {editSubmitting ? "Saving..." : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
