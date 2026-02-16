"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { EmptyState } from "@/components/EmptyState";
import Link from "next/link";
import { Pencil, Trash2, ArrowRight, Plus, X, Check } from "lucide-react";
import { WatchlistItem, WatchlistStatus } from "@/lib/types";
import { formatDate } from "@/lib/date";
import { useResearchStatus } from "@/hooks/useResearchStatus";
import { ResearchStatusBadge } from "@/components/ResearchStatusBadge";

interface WatchlistTabProps {
  initialItems: WatchlistItem[];
  onPromoteToPortfolio: (item: WatchlistItem) => void;
}

const STATUS_CONFIG: Record<WatchlistStatus, { icon: string; label: string; className: string }> = {
  watching: { icon: "👀", label: "Watching", className: "bg-gray-100 text-gray-700" },
  accumulating: { icon: "📈", label: "Accumulating", className: "bg-amber-100 text-amber-700" },
  graduated: { icon: "✅", label: "Graduated", className: "bg-emerald-100 text-emerald-700" },
};

export function WatchlistTab({ initialItems, onPromoteToPortfolio }: WatchlistTabProps) {
  const [items, setItems] = useState<WatchlistItem[]>(initialItems);
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [loadingPrices, setLoadingPrices] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  
  // Form state
  const [newTicker, setNewTicker] = useState("");
  const [newTargetPrice, setNewTargetPrice] = useState("");
  const [newNotes, setNewNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Edit form state
  const [editTargetPrice, setEditTargetPrice] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editStatus, setEditStatus] = useState<WatchlistStatus>("watching");

  // Research status for watchlist items
  const watchlistTickers = useMemo(() => items.map((i) => i.ticker), [items]);
  const { statuses: researchStatuses, refetch: refetchResearch } = useResearchStatus(watchlistTickers);

  // Fetch prices for all tickers
  const fetchPrices = useCallback(async () => {
    if (items.length === 0) return;
    
    setLoadingPrices(true);
    try {
      const tickers = items.map((i) => i.ticker).join(",");
      const res = await fetch(`/api/markets/prices?tickers=${tickers}`);
      const data = await res.json();
      if (data.prices) {
        setPrices(data.prices);
      }
    } catch {
      // Ignore price errors
    } finally {
      setLoadingPrices(false);
    }
  }, [items]);

  useEffect(() => {
    fetchPrices();
  }, [fetchPrices]);

  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTicker.trim()) return;

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticker: newTicker.trim().toUpperCase(),
          target_price: newTargetPrice ? parseFloat(newTargetPrice) : null,
          notes: newNotes.trim() || null,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to add");
        return;
      }

      setItems([data.item, ...items]);
      setNewTicker("");
      setNewTargetPrice("");
      setNewNotes("");
      setShowAddForm(false);
    } catch {
      setError("Network error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Remove from watchlist?")) return;

    try {
      const res = await fetch(`/api/watchlist/${id}`, { method: "DELETE" });
      if (res.ok) {
        setItems(items.filter((i) => i.id !== id));
      }
    } catch {
      // Ignore
    }
  };

  const startEdit = (item: WatchlistItem) => {
    setEditingId(item.id);
    setEditTargetPrice(item.target_price?.toString() || "");
    setEditNotes(item.notes || "");
    setEditStatus(item.status);
  };

  const cancelEdit = () => {
    setEditingId(null);
  };

  const saveEdit = async (id: number) => {
    try {
      const res = await fetch(`/api/watchlist/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target_price: editTargetPrice ? parseFloat(editTargetPrice) : null,
          notes: editNotes.trim() || null,
          status: editStatus,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setItems(items.map((i) => (i.id === id ? data.item : i)));
        setEditingId(null);
      }
    } catch {
      // Ignore
    }
  };

  const formatPrice = (price: number | null | undefined) => {
    if (price === null || price === undefined) return "-";
    return `$${price.toFixed(2)}`;
  };

  const calculateGap = (current: number | undefined, target: number | null) => {
    if (!current || !target) return null;
    return ((current - target) / target) * 100;
  };

  return (
    <div className="space-y-6">
      {/* Add Button */}
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold text-gray-900">Watchlist</h2>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="btn-primary flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Add to Watchlist
        </button>
      </div>

      {/* Add Form */}
      {showAddForm && (
        <form onSubmit={handleAddItem} className="card space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
                Target Price (optional)
              </label>
              <input
                type="number"
                step="0.01"
                value={newTargetPrice}
                onChange={(e) => setNewTargetPrice(e.target.value)}
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
                value={newNotes}
                onChange={(e) => setNewNotes(e.target.value)}
                placeholder="Waiting for earnings..."
                className="input w-full"
              />
            </div>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="btn-secondary"
            >
              Cancel
            </button>
            <button type="submit" disabled={submitting} className="btn-primary">
              {submitting ? "Adding..." : "Add"}
            </button>
          </div>
        </form>
      )}

      {/* Table */}
      {items.length > 0 ? (
        <div className="card overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Ticker
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Research
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Price
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Target
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Gap
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Notes
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {items.map((item) => {
                const price = prices[item.ticker];
                const gap = calculateGap(price, item.target_price);
                const isEditing = editingId === item.id;

                return (
                  <tr key={item.id} className="hover:bg-gray-50">
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
                        status={researchStatuses[item.ticker.toUpperCase()] ?? null}
                        compact
                        onResearchTriggered={refetchResearch}
                      />
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
                        <span
                          className={
                            gap < 0 ? "text-emerald-600" : "text-red-600"
                          }
                        >
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
                          onChange={(e) =>
                            setEditStatus(e.target.value as WatchlistStatus)
                          }
                          className="input text-sm"
                        >
                          <option value="watching">👀 Watching</option>
                          <option value="accumulating">📈 Accumulating</option>
                          <option value="graduated">✅ Graduated</option>
                        </select>
                      ) : (
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${STATUS_CONFIG[item.status].className}`}
                        >
                          <span>{STATUS_CONFIG[item.status].icon}</span>
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
                            <button
                              onClick={() => saveEdit(item.id)}
                              className="p-1 text-emerald-600 hover:bg-emerald-50 rounded"
                              title="Save"
                            >
                              <Check className="w-4 h-4" />
                            </button>
                            <button
                              onClick={cancelEdit}
                              className="p-1 text-gray-400 hover:bg-gray-100 rounded"
                              title="Cancel"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => startEdit(item)}
                              className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
                              title="Edit"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDelete(item.id)}
                              className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
                              title="Delete"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                            {item.status !== "graduated" && (
                              <button
                                onClick={() => onPromoteToPortfolio(item)}
                                className="p-1 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded"
                                title="Add to Portfolio"
                              >
                                <ArrowRight className="w-4 h-4" />
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState
          icon="👀"
          title="Watchlist is empty"
          description="Add stocks you're monitoring before buying"
        />
      )}
    </div>
  );
}
