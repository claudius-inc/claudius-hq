"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  RefreshCw,
  Plus,
  Trash2,
  Edit2,
  Pause,
  Play,
  X,
  AlertTriangle,
} from "lucide-react";

interface StockAlert {
  id: number;
  ticker: string;
  accumulateLow: number | null;
  accumulateHigh: number | null;
  strongBuyLow: number | null;
  strongBuyHigh: number | null;
  status: "watching" | "triggered" | "paused";
  lastTriggered: string | null;
  notes: string | null;
  createdAt: string;
  // Live data
  currentPrice: number | null;
  dayChange: number | null;
  companyName: string | null;
}

export function AlertsPageContent() {
  const [alerts, setAlerts] = useState<StockAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingAlert, setEditingAlert] = useState<StockAlert | null>(null);

  const fetchAlerts = useCallback(async () => {
    try {
      const res = await fetch("/api/alerts");
      const data = await res.json();
      setAlerts(data.alerts || []);
    } catch (err) {
      console.error("Failed to fetch alerts:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAlerts();
  }, [fetchAlerts]);

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this alert?")) return;

    try {
      await fetch(`/api/alerts/${id}`, { method: "DELETE" });
      await fetchAlerts();
    } catch (err) {
      console.error("Failed to delete alert:", err);
    }
  };

  const handleToggleStatus = async (alert: StockAlert) => {
    const newStatus = alert.status === "paused" ? "watching" : "paused";

    try {
      await fetch(`/api/alerts/${alert.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      await fetchAlerts();
    } catch (err) {
      console.error("Failed to toggle status:", err);
    }
  };

  const formatPrice = (price: number | null) => {
    if (price === null) return "—";
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
    }).format(price);
  };

  const formatPct = (value: number | null) => {
    if (value === null) return "—";
    const sign = value >= 0 ? "+" : "";
    return `${sign}${value.toFixed(2)}%`;
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "Never";
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  const getZoneStatus = (alert: StockAlert) => {
    const price = alert.currentPrice;
    if (!price) return null;

    // Check strong buy zone first
    if (
      alert.strongBuyLow !== null &&
      alert.strongBuyHigh !== null &&
      price >= alert.strongBuyLow &&
      price <= alert.strongBuyHigh
    ) {
      return "strong-buy";
    }

    // Check accumulate zone
    if (
      alert.accumulateLow !== null &&
      alert.accumulateHigh !== null &&
      price >= alert.accumulateLow &&
      price <= alert.accumulateHigh
    ) {
      return "accumulate";
    }

    // Below strong buy zone
    if (alert.strongBuyLow !== null && price < alert.strongBuyLow) {
      return "below-strong-buy";
    }

    return null;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <RefreshCw className="w-5 h-5 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">🔔 Price Alerts</h1>
          <p className="text-sm text-gray-500 mt-1">
            Monitor stocks for accumulation and buying opportunities
          </p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Alert
        </button>
      </div>

      {/* Alerts Table */}
      <div className="bg-white rounded-lg border overflow-hidden">
        {alerts.length === 0 ? (
          <div className="p-8 text-center">
            <AlertTriangle className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 mb-4">
              No price alerts configured yet.
            </p>
            <button
              onClick={() => setShowAddModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700"
            >
              <Plus className="w-4 h-4" />
              Create Your First Alert
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left">
                <tr>
                  <th className="px-4 py-3 font-medium text-gray-600">
                    Ticker
                  </th>
                  <th className="px-4 py-3 font-medium text-gray-600 text-right">
                    Current Price
                  </th>
                  <th className="px-4 py-3 font-medium text-gray-600 text-center">
                    Accumulate Zone
                  </th>
                  <th className="px-4 py-3 font-medium text-gray-600 text-center">
                    Strong Buy Zone
                  </th>
                  <th className="px-4 py-3 font-medium text-gray-600 text-center">
                    Status
                  </th>
                  <th className="px-4 py-3 font-medium text-gray-600">
                    Last Triggered
                  </th>
                  <th className="px-4 py-3 font-medium text-gray-600 text-center">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {alerts.map((alert) => {
                  const zoneStatus = getZoneStatus(alert);
                  return (
                    <tr key={alert.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <Link
                          href={`/markets/${alert.ticker.toLowerCase()}`}
                          className="flex flex-col hover:text-blue-600"
                        >
                          <span className="font-medium">{alert.ticker}</span>
                          {alert.companyName && (
                            <span className="text-xs text-gray-500 truncate max-w-[150px]">
                              {alert.companyName}
                            </span>
                          )}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="font-medium">
                          {formatPrice(alert.currentPrice)}
                        </div>
                        <div
                          className={`text-xs ${
                            (alert.dayChange ?? 0) >= 0
                              ? "text-green-600"
                              : "text-red-600"
                          }`}
                        >
                          {formatPct(alert.dayChange)}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {alert.accumulateLow !== null &&
                        alert.accumulateHigh !== null ? (
                          <span
                            className={`px-2 py-1 rounded text-xs ${
                              zoneStatus === "accumulate"
                                ? "bg-amber-100 text-amber-700 font-medium"
                                : "bg-gray-100 text-gray-600"
                            }`}
                          >
                            {formatPrice(alert.accumulateLow)} -{" "}
                            {formatPrice(alert.accumulateHigh)}
                          </span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {alert.strongBuyLow !== null &&
                        alert.strongBuyHigh !== null ? (
                          <span
                            className={`px-2 py-1 rounded text-xs ${
                              zoneStatus === "strong-buy"
                                ? "bg-emerald-100 text-emerald-700 font-medium"
                                : zoneStatus === "below-strong-buy"
                                ? "bg-red-100 text-red-700 font-medium"
                                : "bg-gray-100 text-gray-600"
                            }`}
                          >
                            {formatPrice(alert.strongBuyLow)} -{" "}
                            {formatPrice(alert.strongBuyHigh)}
                          </span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className={`px-2 py-1 rounded-full text-xs font-medium ${
                            alert.status === "watching"
                              ? "bg-blue-100 text-blue-700"
                              : alert.status === "triggered"
                              ? "bg-amber-100 text-amber-700"
                              : "bg-gray-100 text-gray-500"
                          }`}
                        >
                          {alert.status === "watching" && "👁️ Watching"}
                          {alert.status === "triggered" && "🔔 Triggered"}
                          {alert.status === "paused" && "⏸️ Paused"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-600 text-sm">
                        {formatDate(alert.lastTriggered)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => setEditingAlert(alert)}
                            className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                            title="Edit"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleToggleStatus(alert)}
                            className="p-1.5 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded transition-colors"
                            title={
                              alert.status === "paused" ? "Resume" : "Pause"
                            }
                          >
                            {alert.status === "paused" ? (
                              <Play className="w-4 h-4" />
                            ) : (
                              <Pause className="w-4 h-4" />
                            )}
                          </button>
                          <button
                            onClick={() => handleDelete(alert.id)}
                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                            title="Delete"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Legend */}
      {alerts.length > 0 && (
        <div className="flex items-center gap-4 text-xs text-gray-500">
          <span className="font-medium">Legend:</span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded bg-amber-100"></span>
            In Accumulate Zone
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded bg-emerald-100"></span>
            In Strong Buy Zone
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded bg-red-100"></span>
            Below Strong Buy
          </span>
        </div>
      )}

      {/* Add/Edit Modal */}
      {(showAddModal || editingAlert) && (
        <AlertModal
          alert={editingAlert}
          onClose={() => {
            setShowAddModal(false);
            setEditingAlert(null);
          }}
          onSave={async () => {
            await fetchAlerts();
            setShowAddModal(false);
            setEditingAlert(null);
          }}
        />
      )}
    </div>
  );
}

// Alert Modal Component
function AlertModal({
  alert,
  onClose,
  onSave,
}: {
  alert: StockAlert | null;
  onClose: () => void;
  onSave: () => Promise<void>;
}) {
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
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded"
          >
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
