"use client";

import { useState } from "react";
import Link from "next/link";
import { Pencil, Trash2, ArrowRight, X, Check, Eye, TrendingUp, CheckCircle } from "lucide-react";
import { WatchlistItem, WatchlistStatus } from "@/lib/types";
import { ResearchStatusBadge } from "@/components/ResearchStatusBadge";
import { ResearchStatus } from "@/hooks/useResearchStatus";

const STATUS_ICONS: Record<WatchlistStatus, React.ReactNode> = {
  watching: <Eye className="w-3.5 h-3.5" />,
  accumulating: <TrendingUp className="w-3.5 h-3.5" />,
  graduated: <CheckCircle className="w-3.5 h-3.5" />,
};

const STATUS_CONFIG: Record<WatchlistStatus, { label: string; className: string }> = {
  watching: { label: "Watching", className: "bg-gray-100 text-gray-700" },
  accumulating: { label: "Accumulating", className: "bg-amber-100 text-amber-700" },
  graduated: { label: "Graduated", className: "bg-emerald-100 text-emerald-700" },
};

interface WatchlistRowProps {
  item: WatchlistItem;
  price?: number;
  loadingPrice: boolean;
  researchStatus: ResearchStatus | null;
  onEdit: (id: number, data: { targetPrice: number | null; notes: string | null; status: WatchlistStatus }) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
  onPromote: (item: WatchlistItem) => void;
  onResearchTriggered: () => void;
}

function formatPrice(price: number | null | undefined): string {
  if (price === null || price === undefined) return "-";
  return `$${price.toFixed(2)}`;
}

function calculateGap(current: number | undefined, target: number | null): number | null {
  if (!current || !target) return null;
  return ((current - target) / target) * 100;
}

export function WatchlistRow({
  item,
  price,
  loadingPrice,
  researchStatus,
  onEdit,
  onDelete,
  onPromote,
  onResearchTriggered,
}: WatchlistRowProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editTargetPrice, setEditTargetPrice] = useState(item.target_price?.toString() || "");
  const [editNotes, setEditNotes] = useState(item.notes || "");
  const [editStatus, setEditStatus] = useState<WatchlistStatus>(item.status);

  const gap = calculateGap(price, item.target_price);

  const handleSave = async () => {
    await onEdit(item.id, {
      targetPrice: editTargetPrice ? parseFloat(editTargetPrice) : null,
      notes: editNotes.trim() || null,
      status: editStatus,
    });
    setIsEditing(false);
  };

  const handleStartEdit = () => {
    setEditTargetPrice(item.target_price?.toString() || "");
    setEditNotes(item.notes || "");
    setEditStatus(item.status);
    setIsEditing(true);
  };

  return (
    <tr className="hover:bg-gray-50">
      <td className="px-4 py-3 whitespace-nowrap">
        <Link
          href={`/markets/research/${item.ticker}`}
          className="text-emerald-600 hover:text-emerald-700 font-semibold"
        >
          {item.ticker}
        </Link>
      </td>
      <td className="px-4 py-3 whitespace-nowrap text-center">
        <ResearchStatusBadge
          ticker={item.ticker}
          status={researchStatus}
          compact
          onResearchTriggered={onResearchTriggered}
        />
      </td>
      <td className="px-4 py-3 whitespace-nowrap text-right text-sm">
        {loadingPrice ? <span className="text-gray-400">...</span> : formatPrice(price)}
      </td>
      <td className="px-4 py-3 whitespace-nowrap text-right text-sm">
        {isEditing ? (
          <input
            type="number"
            step="0.01"
            value={editTargetPrice}
            onChange={(e) => setEditTargetPrice(e.target.value)}
            className="input w-24 text-right"
          />
        ) : (
          formatPrice(item.target_price)
        )}
      </td>
      <td className="px-4 py-3 whitespace-nowrap text-right text-sm">
        {gap !== null ? (
          <span className={gap < 0 ? "text-emerald-600" : "text-red-600"}>
            {gap > 0 ? "+" : ""}
            {gap.toFixed(1)}%
          </span>
        ) : (
          "-"
        )}
      </td>
      <td className="px-4 py-3 whitespace-nowrap text-center">
        {isEditing ? (
          <select
            value={editStatus}
            onChange={(e) => setEditStatus(e.target.value as WatchlistStatus)}
            className="input text-sm"
          >
            <option value="watching">Watching</option>
            <option value="accumulating">Accumulating</option>
            <option value="graduated">Graduated</option>
          </select>
        ) : (
          <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${STATUS_CONFIG[item.status].className}`}>
            {STATUS_ICONS[item.status]}
            <span>{STATUS_CONFIG[item.status].label}</span>
          </span>
        )}
      </td>
      <td className="px-4 py-3 text-sm text-gray-500 max-w-xs truncate">
        {isEditing ? (
          <input
            type="text"
            value={editNotes}
            onChange={(e) => setEditNotes(e.target.value)}
            className="input w-full"
          />
        ) : (
          item.notes || "-"
        )}
      </td>
      <td className="px-4 py-3 whitespace-nowrap text-right">
        <div className="flex items-center justify-end gap-1">
          {isEditing ? (
            <>
              <button onClick={handleSave} className="p-1 text-emerald-600 hover:bg-emerald-50 rounded" title="Save">
                <Check className="w-4 h-4" />
              </button>
              <button onClick={() => setIsEditing(false)} className="p-1 text-gray-400 hover:bg-gray-100 rounded" title="Cancel">
                <X className="w-4 h-4" />
              </button>
            </>
          ) : (
            <>
              <button onClick={handleStartEdit} className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded" title="Edit">
                <Pencil className="w-4 h-4" />
              </button>
              <button onClick={() => onDelete(item.id)} className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded" title="Delete">
                <Trash2 className="w-4 h-4" />
              </button>
              {item.status !== "graduated" && (
                <button onClick={() => onPromote(item)} className="p-1 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded" title="Add to Portfolio">
                  <ArrowRight className="w-4 h-4" />
                </button>
              )}
            </>
          )}
        </div>
      </td>
    </tr>
  );
}
