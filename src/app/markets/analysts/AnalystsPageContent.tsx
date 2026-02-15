"use client";

import { useState, useEffect, useCallback } from "react";
import {
  RefreshCw,
  Plus,
  Trash2,
  Edit2,
  X,
  ChevronDown,
  ChevronUp,
  TrendingUp,
  TrendingDown,
  User,
  Building,
  Target,
  Filter,
} from "lucide-react";
import { formatDate } from "@/lib/format-date";

interface AnalystCall {
  id: number;
  analystId: number;
  analystName?: string;
  analystFirm?: string;
  ticker: string;
  action: string;
  priceTarget: number | null;
  priceAtCall: number | null;
  currentPrice: number | null;
  callDate: string;
  notes: string | null;
  outcome: string | null;
  createdAt: string;
}

interface Analyst {
  id: number;
  name: string;
  firm: string;
  specialty: string | null;
  successRate: number | null;
  avgReturn: number | null;
  notes: string | null;
  createdAt: string;
  callCount: number;
  recentCalls: AnalystCall[];
}

export function AnalystsPageContent() {
  const [analysts, setAnalysts] = useState<Analyst[]>([]);
  const [calls, setCalls] = useState<AnalystCall[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedAnalyst, setExpandedAnalyst] = useState<number | null>(null);
  const [showAddCallModal, setShowAddCallModal] = useState(false);
  const [showAddAnalystModal, setShowAddAnalystModal] = useState(false);
  const [editingCall, setEditingCall] = useState<AnalystCall | null>(null);

  // Filters
  const [filterAnalyst, setFilterAnalyst] = useState<string>("");
  const [filterTicker, setFilterTicker] = useState<string>("");
  const [filterAction, setFilterAction] = useState<string>("");

  const fetchData = useCallback(async () => {
    try {
      const [analystsRes, callsRes] = await Promise.all([
        fetch("/api/analysts"),
        fetch("/api/analysts/calls"),
      ]);
      const analystsData = await analystsRes.json();
      const callsData = await callsRes.json();
      setAnalysts(analystsData.analysts || []);
      setCalls(callsData.calls || []);
    } catch (err) {
      console.error("Failed to fetch data:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleDeleteCall = async (id: number) => {
    if (!confirm("Delete this call?")) return;
    try {
      await fetch(`/api/analysts/calls/${id}`, { method: "DELETE" });
      await fetchData();
    } catch (err) {
      console.error("Failed to delete call:", err);
    }
  };

  const handleDeleteAnalyst = async (id: number) => {
    if (!confirm("Delete this analyst and all their calls?")) return;
    try {
      await fetch(`/api/analysts/${id}`, { method: "DELETE" });
      await fetchData();
    } catch (err) {
      console.error("Failed to delete analyst:", err);
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
    return `${sign}${(value * 100).toFixed(1)}%`;
  };

  const getSuccessRateColor = (rate: number | null) => {
    if (rate === null) return "text-gray-400";
    if (rate >= 0.7) return "text-green-600";
    if (rate >= 0.5) return "text-amber-600";
    return "text-red-600";
  };

  const getSuccessRateBg = (rate: number | null) => {
    if (rate === null) return "bg-gray-100";
    if (rate >= 0.7) return "bg-green-100";
    if (rate >= 0.5) return "bg-amber-100";
    return "bg-red-100";
  };

  const getActionBadge = (action: string) => {
    const colors: Record<string, string> = {
      buy: "bg-green-100 text-green-700",
      sell: "bg-red-100 text-red-700",
      hold: "bg-gray-100 text-gray-700",
      upgrade: "bg-emerald-100 text-emerald-700",
      downgrade: "bg-rose-100 text-rose-700",
    };
    return colors[action] || "bg-gray-100 text-gray-700";
  };

  const getOutcomeBadge = (outcome: string | null) => {
    const colors: Record<string, string> = {
      hit: "bg-green-100 text-green-700",
      miss: "bg-red-100 text-red-700",
      pending: "bg-amber-100 text-amber-700",
    };
    return colors[outcome || "pending"] || "bg-gray-100 text-gray-700";
  };

  const calculateReturn = (call: AnalystCall) => {
    if (!call.priceAtCall || !call.currentPrice) return null;
    const ret = (call.currentPrice - call.priceAtCall) / call.priceAtCall;
    // Invert return for sell calls
    if (call.action === "sell" || call.action === "downgrade") {
      return -ret;
    }
    return ret;
  };

  // Filter calls
  const filteredCalls = calls.filter((call) => {
    if (filterAnalyst && call.analystId !== parseInt(filterAnalyst))
      return false;
    if (
      filterTicker &&
      !call.ticker.toLowerCase().includes(filterTicker.toLowerCase())
    )
      return false;
    if (filterAction && call.action !== filterAction) return false;
    return true;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <RefreshCw className="w-5 h-5 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">📊 Analysts Tracker</h1>
          <p className="text-sm text-gray-500 mt-1">
            Track top-ranked analysts and their stock calls
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowAddAnalystModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors"
          >
            <User className="w-4 h-4" />
            Add Analyst
          </button>
          <button
            onClick={() => setShowAddCallModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Log Call
          </button>
        </div>
      </div>

      {/* Analyst Cards */}
      <section>
        <h2 className="text-lg font-semibold text-gray-800 mb-4">
          Tracked Analysts
        </h2>
        {analysts.length === 0 ? (
          <div className="bg-white rounded-lg border p-8 text-center">
            <User className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 mb-4">No analysts tracked yet.</p>
            <button
              onClick={() => setShowAddAnalystModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700"
            >
              <Plus className="w-4 h-4" />
              Add Your First Analyst
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {analysts.map((analyst) => (
              <div
                key={analyst.id}
                className="bg-white rounded-lg border border-amber-200 shadow-sm overflow-hidden"
              >
                <div
                  className="p-4 cursor-pointer hover:bg-amber-50/50 transition-colors"
                  onClick={() =>
                    setExpandedAnalyst(
                      expandedAnalyst === analyst.id ? null : analyst.id
                    )
                  }
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-gray-900">
                          {analyst.name}
                        </h3>
                        {analyst.successRate !== null && (
                          <span
                            className={`px-2 py-0.5 rounded-full text-xs font-medium ${getSuccessRateBg(
                              analyst.successRate
                            )} ${getSuccessRateColor(analyst.successRate)}`}
                          >
                            {(analyst.successRate * 100).toFixed(0)}%
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-sm text-gray-500 mt-1">
                        <Building className="w-3.5 h-3.5" />
                        {analyst.firm}
                      </div>
                      {analyst.specialty && (
                        <div className="flex items-center gap-2 text-sm text-gray-500 mt-1">
                          <Target className="w-3.5 h-3.5" />
                          {analyst.specialty}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-500">
                        {analyst.callCount} calls
                      </span>
                      {expandedAnalyst === analyst.id ? (
                        <ChevronUp className="w-4 h-4 text-gray-400" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-gray-400" />
                      )}
                    </div>
                  </div>
                  {analyst.notes && (
                    <p className="text-xs text-gray-500 mt-2 line-clamp-2">
                      {analyst.notes}
                    </p>
                  )}
                </div>

                {/* Expanded: Recent Calls */}
                {expandedAnalyst === analyst.id && (
                  <div className="border-t bg-gray-50 p-3 space-y-2">
                    {analyst.recentCalls.length === 0 ? (
                      <p className="text-sm text-gray-500 text-center py-2">
                        No calls logged yet
                      </p>
                    ) : (
                      analyst.recentCalls.map((call) => (
                        <div
                          key={call.id}
                          className="flex items-center justify-between bg-white rounded px-3 py-2 text-sm"
                        >
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{call.ticker}</span>
                            <span
                              className={`px-1.5 py-0.5 rounded text-xs ${getActionBadge(
                                call.action
                              )}`}
                            >
                              {call.action}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 text-gray-500">
                            <span>{formatDate(call.callDate)}</span>
                            <span
                              className={`px-1.5 py-0.5 rounded text-xs ${getOutcomeBadge(
                                call.outcome
                              )}`}
                            >
                              {call.outcome || "pending"}
                            </span>
                          </div>
                        </div>
                      ))
                    )}
                    <div className="flex justify-end pt-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteAnalyst(analyst.id);
                        }}
                        className="text-xs text-red-500 hover:text-red-700 flex items-center gap-1"
                      >
                        <Trash2 className="w-3 h-3" />
                        Remove Analyst
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Recent Calls Table */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-800">Recent Calls</h2>
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-400" />
            <select
              value={filterAnalyst}
              onChange={(e) => setFilterAnalyst(e.target.value)}
              className="text-sm border border-gray-300 rounded-lg px-2 py-1"
            >
              <option value="">All Analysts</option>
              {analysts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
            <input
              type="text"
              placeholder="Ticker..."
              value={filterTicker}
              onChange={(e) => setFilterTicker(e.target.value)}
              className="text-sm border border-gray-300 rounded-lg px-2 py-1 w-24"
            />
            <select
              value={filterAction}
              onChange={(e) => setFilterAction(e.target.value)}
              className="text-sm border border-gray-300 rounded-lg px-2 py-1"
            >
              <option value="">All Actions</option>
              <option value="buy">Buy</option>
              <option value="sell">Sell</option>
              <option value="hold">Hold</option>
              <option value="upgrade">Upgrade</option>
              <option value="downgrade">Downgrade</option>
            </select>
          </div>
        </div>

        <div className="bg-white rounded-lg border overflow-hidden">
          {filteredCalls.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              No calls match your filters.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-left">
                  <tr>
                    <th className="px-4 py-3 font-medium text-gray-600">
                      Date
                    </th>
                    <th className="px-4 py-3 font-medium text-gray-600">
                      Analyst
                    </th>
                    <th className="px-4 py-3 font-medium text-gray-600">
                      Ticker
                    </th>
                    <th className="px-4 py-3 font-medium text-gray-600 text-center">
                      Action
                    </th>
                    <th className="px-4 py-3 font-medium text-gray-600 text-right">
                      Price Target
                    </th>
                    <th className="px-4 py-3 font-medium text-gray-600 text-right">
                      Price @ Call
                    </th>
                    <th className="px-4 py-3 font-medium text-gray-600 text-right">
                      Current
                    </th>
                    <th className="px-4 py-3 font-medium text-gray-600 text-right">
                      Return
                    </th>
                    <th className="px-4 py-3 font-medium text-gray-600 text-center">
                      Status
                    </th>
                    <th className="px-4 py-3 font-medium text-gray-600 text-center">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filteredCalls.map((call) => {
                    const ret = calculateReturn(call);
                    return (
                      <tr key={call.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-gray-600">
                          {formatDate(call.callDate)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-gray-900">
                            {call.analystName || "Unknown"}
                          </div>
                          <div className="text-xs text-gray-500">
                            {call.analystFirm}
                          </div>
                        </td>
                        <td className="px-4 py-3 font-medium">{call.ticker}</td>
                        <td className="px-4 py-3 text-center">
                          <span
                            className={`px-2 py-1 rounded text-xs font-medium ${getActionBadge(
                              call.action
                            )}`}
                          >
                            {call.action}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          {formatPrice(call.priceTarget)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {formatPrice(call.priceAtCall)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {formatPrice(call.currentPrice)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {ret !== null ? (
                            <span
                              className={`flex items-center justify-end gap-1 ${
                                ret >= 0 ? "text-green-600" : "text-red-600"
                              }`}
                            >
                              {ret >= 0 ? (
                                <TrendingUp className="w-3.5 h-3.5" />
                              ) : (
                                <TrendingDown className="w-3.5 h-3.5" />
                              )}
                              {(ret * 100).toFixed(1)}%
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span
                            className={`px-2 py-1 rounded text-xs font-medium ${getOutcomeBadge(
                              call.outcome
                            )}`}
                          >
                            {call.outcome || "pending"}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              onClick={() => setEditingCall(call)}
                              className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                              title="Edit"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteCall(call.id)}
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
      </section>

      {/* Add Call Modal */}
      {(showAddCallModal || editingCall) && (
        <CallModal
          call={editingCall}
          analysts={analysts}
          onClose={() => {
            setShowAddCallModal(false);
            setEditingCall(null);
          }}
          onSave={async () => {
            await fetchData();
            setShowAddCallModal(false);
            setEditingCall(null);
          }}
        />
      )}

      {/* Add Analyst Modal */}
      {showAddAnalystModal && (
        <AnalystModal
          onClose={() => setShowAddAnalystModal(false)}
          onSave={async () => {
            await fetchData();
            setShowAddAnalystModal(false);
          }}
        />
      )}
    </div>
  );
}

// Call Modal Component
function CallModal({
  call,
  analysts,
  onClose,
  onSave,
}: {
  call: AnalystCall | null;
  analysts: Analyst[];
  onClose: () => void;
  onSave: () => Promise<void>;
}) {
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

// Analyst Modal Component
function AnalystModal({
  onClose,
  onSave,
}: {
  onClose: () => void;
  onSave: () => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [firm, setFirm] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [successRate, setSuccessRate] = useState("");
  const [avgReturn, setAvgReturn] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSaving(true);

    try {
      const payload = {
        name: name.trim(),
        firm: firm.trim(),
        specialty: specialty.trim() || null,
        successRate: successRate ? parseFloat(successRate) / 100 : null,
        avgReturn: avgReturn ? parseFloat(avgReturn) / 100 : null,
        notes: notes.trim() || null,
      };

      const res = await fetch("/api/analysts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to add analyst");
        return;
      }

      await onSave();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add analyst");
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
          <h3 className="font-semibold text-lg">Add Analyst</h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name & Firm */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Mark Lipacis"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Firm
              </label>
              <input
                type="text"
                value={firm}
                onChange={(e) => setFirm(e.target.value)}
                placeholder="e.g., Jefferies"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
                required
              />
            </div>
          </div>

          {/* Specialty */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Specialty
            </label>
            <input
              type="text"
              value={specialty}
              onChange={(e) => setSpecialty(e.target.value)}
              placeholder="e.g., Semiconductors"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
            />
          </div>

          {/* Success Rate & Avg Return */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Success Rate (%)
              </label>
              <input
                type="number"
                step="0.1"
                min="0"
                max="100"
                value={successRate}
                onChange={(e) => setSuccessRate(e.target.value)}
                placeholder="e.g., 88"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Avg Return (%)
              </label>
              <input
                type="number"
                step="0.1"
                value={avgReturn}
                onChange={(e) => setAvgReturn(e.target.value)}
                placeholder="e.g., 12.5"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
              />
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
              placeholder="Background, why you're tracking them..."
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none resize-none"
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
              disabled={saving || !name.trim() || !firm.trim()}
              className="px-4 py-2 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
            >
              {saving && <RefreshCw className="w-4 h-4 animate-spin" />}
              Add Analyst
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
