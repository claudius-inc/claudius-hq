"use client";

import { useState } from "react";
import { PortfolioHolding } from "@/lib/types";
import { HoldingRow } from "./HoldingRow";

interface PortfolioTableProps {
  holdings: PortfolioHolding[];
  prices: Record<string, number>;
  loadingPrices: boolean;
  onUpdateHolding: (holding: PortfolioHolding) => void;
  onDeleteHolding: (id: number, ticker: string) => void;
}

export function PortfolioTable({
  holdings,
  prices,
  loadingPrices,
  onUpdateHolding,
  onDeleteHolding,
}: PortfolioTableProps) {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editTicker, setEditTicker] = useState("");
  const [editAllocation, setEditAllocation] = useState("");
  const [editCostBasis, setEditCostBasis] = useState("");
  const [editShares, setEditShares] = useState("");

  const totalAllocation = holdings.reduce((sum, h) => sum + h.target_allocation, 0);

  const startEdit = (holding: PortfolioHolding) => {
    setEditingId(holding.id);
    setEditTicker(holding.ticker);
    setEditAllocation(holding.target_allocation.toString());
    setEditCostBasis(holding.cost_basis?.toString() || "");
    setEditShares(holding.shares?.toString() || "");
  };

  const cancelEdit = () => {
    setEditingId(null);
  };

  const saveEdit = async (id: number) => {
    try {
      const res = await fetch(`/api/portfolio/holdings/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticker: editTicker.trim().toUpperCase(),
          target_allocation: parseFloat(editAllocation),
          cost_basis: editCostBasis ? parseFloat(editCostBasis) : null,
          shares: editShares ? parseFloat(editShares) : null,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        onUpdateHolding(data.holding);
        setEditingId(null);
      }
    } catch {
      // Ignore
    }
  };

  if (holdings.length === 0) {
    return (
      <div className="card text-center py-12">
        <div className="text-4xl mb-3">💼</div>
        <h3 className="text-lg font-semibold text-gray-900 mb-1">
          Portfolio is empty
        </h3>
        <p className="text-sm text-gray-500">
          Add your first holding to start tracking
        </p>
      </div>
    );
  }

  return (
    <div className="card overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Ticker
            </th>
            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
              Allocation
            </th>
            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
              Price
            </th>
            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
              Cost Basis
            </th>
            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
              P/L
            </th>
            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {holdings.map((holding) => (
            <HoldingRow
              key={holding.id}
              holding={holding}
              price={prices[holding.ticker]}
              loadingPrices={loadingPrices}
              isEditing={editingId === holding.id}
              editTicker={editTicker}
              editAllocation={editAllocation}
              editCostBasis={editCostBasis}
              onEditTickerChange={setEditTicker}
              onEditAllocationChange={setEditAllocation}
              onEditCostBasisChange={setEditCostBasis}
              onStartEdit={() => startEdit(holding)}
              onSaveEdit={() => saveEdit(holding.id)}
              onCancelEdit={cancelEdit}
              onDelete={() => onDeleteHolding(holding.id, holding.ticker)}
            />
          ))}
          {/* Total Row */}
          <tr className="bg-gray-50 font-medium">
            <td className="px-4 py-3 text-sm">Total</td>
            <td className="px-4 py-3 text-right text-sm">{totalAllocation}%</td>
            <td colSpan={4}></td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
