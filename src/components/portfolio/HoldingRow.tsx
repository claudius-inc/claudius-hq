"use client";

import Link from "next/link";
import { Pencil, Trash2, X, Check } from "lucide-react";
import { PortfolioHolding } from "@/lib/types";

interface HoldingRowProps {
  holding: PortfolioHolding;
  price: number | undefined;
  loadingPrices: boolean;
  isEditing: boolean;
  editTicker: string;
  editAllocation: string;
  editCostBasis: string;
  onEditTickerChange: (value: string) => void;
  onEditAllocationChange: (value: string) => void;
  onEditCostBasisChange: (value: string) => void;
  onStartEdit: () => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onDelete: () => void;
}

function formatPrice(price: number | null | undefined) {
  if (price === null || price === undefined) return "-";
  return `$${price.toFixed(2)}`;
}

function calculatePL(current: number | undefined, costBasis: number | null) {
  if (!current || !costBasis) return null;
  return ((current - costBasis) / costBasis) * 100;
}

export function HoldingRow({
  holding,
  price,
  loadingPrices,
  isEditing,
  editTicker,
  editAllocation,
  editCostBasis,
  onEditTickerChange,
  onEditAllocationChange,
  onEditCostBasisChange,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onDelete,
}: HoldingRowProps) {
  const pl = calculatePL(price, holding.cost_basis);

  return (
    <tr className="hover:bg-gray-50">
      <td className="px-4 py-3 whitespace-nowrap">
        {isEditing ? (
          <input
            type="text"
            value={editTicker}
            onChange={(e) => onEditTickerChange(e.target.value.toUpperCase())}
            className="input w-28 font-semibold"
          />
        ) : (
          <Link
            href={`/markets/research/${holding.ticker}`}
            className="text-emerald-600 hover:text-emerald-700 font-semibold"
          >
            {holding.ticker}
          </Link>
        )}
      </td>
      <td className="px-4 py-3 whitespace-nowrap text-right text-sm">
        {isEditing ? (
          <input
            type="number"
            step="0.1"
            value={editAllocation}
            onChange={(e) => onEditAllocationChange(e.target.value)}
            className="input w-20 text-right"
          />
        ) : (
          <span className="font-medium">{holding.target_allocation}%</span>
        )}
      </td>
      <td className="px-4 py-3 whitespace-nowrap text-right text-sm">
        {loadingPrices ? (
          <span className="text-gray-400">...</span>
        ) : (
          formatPrice(price)
        )}
      </td>
      <td className="px-4 py-3 whitespace-nowrap text-right text-sm">
        {isEditing ? (
          <input
            type="number"
            step="0.01"
            value={editCostBasis}
            onChange={(e) => onEditCostBasisChange(e.target.value)}
            className="input w-24 text-right"
          />
        ) : (
          formatPrice(holding.cost_basis)
        )}
      </td>
      <td className="px-4 py-3 whitespace-nowrap text-right text-sm">
        {pl !== null ? (
          <span className={pl >= 0 ? "text-emerald-600" : "text-red-600"}>
            {pl >= 0 ? "+" : ""}
            {pl.toFixed(1)}%
          </span>
        ) : (
          "-"
        )}
      </td>
      <td className="px-4 py-3 whitespace-nowrap text-right">
        <div className="flex items-center justify-end gap-0.5">
          {isEditing ? (
            <>
              <button
                onClick={onSaveEdit}
                className="p-2 -m-1 text-emerald-600 hover:bg-emerald-50 rounded-lg touch-manipulation"
                title="Save"
              >
                <Check className="w-4 h-4" />
              </button>
              <button
                onClick={onCancelEdit}
                className="p-2 -m-1 text-gray-400 hover:bg-gray-100 rounded-lg touch-manipulation"
                title="Cancel"
              >
                <X className="w-4 h-4" />
              </button>
            </>
          ) : (
            <>
              <button
                onClick={onStartEdit}
                className="p-2 -m-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg touch-manipulation"
                title="Edit"
              >
                <Pencil className="w-4 h-4" />
              </button>
              <button
                onClick={onDelete}
                className="p-2 -m-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg touch-manipulation"
                title="Delete"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </>
          )}
        </div>
      </td>
    </tr>
  );
}
