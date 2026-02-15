"use client";

import { useState, useEffect } from "react";
import { formatDate } from "@/lib/format-date";

interface Analyst {
  id: number;
  name: string;
  firm: string;
  specialty: string | null;
  successRate: number | null;
  avgReturn: number | null;
  notes: string | null;
  callCount: number;
}

interface Call {
  id: number;
  analystId: number | null;
  ticker: string;
  action: string;
  priceTarget: number | null;
  priceAtCall: number | null;
  currentPrice: number | null;
  callDate: string;
  notes: string | null;
  outcome: string | null;
  analystName?: string;
  analystFirm?: string;
}

export function AnalystsContent() {
  const [analysts, setAnalysts] = useState<Analyst[]>([]);
  const [calls, setCalls] = useState<Call[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddCall, setShowAddCall] = useState(false);
  const [selectedAnalyst, setSelectedAnalyst] = useState<number | null>(null);

  // Form state
  const [newCall, setNewCall] = useState({
    analystId: "",
    ticker: "",
    action: "buy",
    priceTarget: "",
    priceAtCall: "",
    callDate: new Date().toISOString().split("T")[0],
    notes: "",
  });

  useEffect(() => {
    Promise.all([
      fetch("/api/analysts").then((r) => r.json()),
      fetch("/api/analysts/calls").then((r) => r.json()),
    ])
      .then(([analystsData, callsData]) => {
        setAnalysts(analystsData.analysts || []);
        setCalls(callsData.calls || []);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const handleAddCall = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch("/api/analysts/calls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...newCall,
          analystId: parseInt(newCall.analystId),
          priceTarget: newCall.priceTarget ? parseFloat(newCall.priceTarget) : null,
          priceAtCall: newCall.priceAtCall ? parseFloat(newCall.priceAtCall) : null,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const analyst = analysts.find((a) => a.id === parseInt(newCall.analystId));
        setCalls([
          {
            ...data.call,
            analystName: analyst?.name,
            analystFirm: analyst?.firm,
          },
          ...calls,
        ]);
        setShowAddCall(false);
        setNewCall({
          analystId: "",
          ticker: "",
          action: "buy",
          priceTarget: "",
          priceAtCall: "",
          callDate: new Date().toISOString().split("T")[0],
          notes: "",
        });
      }
    } catch (error) {
      console.error("Error adding call:", error);
    }
  };

  const getSuccessRateColor = (rate: number | null) => {
    if (rate === null) return "text-gray-500";
    if (rate >= 0.7) return "text-emerald-600";
    if (rate >= 0.5) return "text-amber-600";
    return "text-red-600";
  };

  const getActionColor = (action: string) => {
    switch (action.toLowerCase()) {
      case "buy":
      case "upgrade":
        return "bg-emerald-100 text-emerald-700";
      case "sell":
      case "downgrade":
        return "bg-red-100 text-red-700";
      default:
        return "bg-gray-100 text-gray-700";
    }
  };

  const filteredCalls = selectedAnalyst
    ? calls.filter((c) => c.analystId === selectedAnalyst)
    : calls;

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 bg-gray-200 rounded w-1/3 animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="card p-5 animate-pulse">
              <div className="h-6 bg-gray-200 rounded w-2/3 mb-2" />
              <div className="h-4 bg-gray-200 rounded w-1/2" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">🎯 Analyst Tracker</h1>
        <p className="text-sm text-gray-500 mt-1">
          Track high-accuracy analysts and their calls
        </p>
      </div>

      {/* Analyst Cards */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
            Tracked Analysts
          </h2>
          {selectedAnalyst && (
            <button
              onClick={() => setSelectedAnalyst(null)}
              className="text-xs text-blue-600 hover:underline"
            >
              Show all calls
            </button>
          )}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {analysts.map((analyst) => (
            <button
              key={analyst.id}
              onClick={() =>
                setSelectedAnalyst(selectedAnalyst === analyst.id ? null : analyst.id)
              }
              className={`card p-5 text-left transition-all ${
                selectedAnalyst === analyst.id
                  ? "ring-2 ring-amber-500 bg-amber-50"
                  : "hover:bg-gray-50"
              }`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-semibold text-gray-900">{analyst.name}</div>
                  <div className="text-sm text-gray-500">{analyst.firm}</div>
                  {analyst.specialty && (
                    <div className="text-xs text-amber-600 mt-1">{analyst.specialty}</div>
                  )}
                </div>
                {analyst.successRate !== null && (
                  <div
                    className={`text-lg font-bold ${getSuccessRateColor(analyst.successRate)}`}
                  >
                    {(analyst.successRate * 100).toFixed(0)}%
                  </div>
                )}
              </div>
              <div className="text-xs text-gray-400 mt-3">
                {analyst.callCount} call{analyst.callCount !== 1 ? "s" : ""} tracked
              </div>
              {analyst.notes && (
                <div className="text-xs text-gray-500 mt-2 line-clamp-2">{analyst.notes}</div>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Add Call Button */}
      <div className="mb-4">
        <button
          onClick={() => setShowAddCall(!showAddCall)}
          className="text-sm bg-amber-600 text-white px-4 py-2 rounded-lg hover:bg-amber-700 transition-colors"
        >
          {showAddCall ? "Cancel" : "+ Log New Call"}
        </button>
      </div>

      {/* Add Call Form */}
      {showAddCall && (
        <form onSubmit={handleAddCall} className="card p-5 mb-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Analyst
              </label>
              <select
                value={newCall.analystId}
                onChange={(e) => setNewCall({ ...newCall, analystId: e.target.value })}
                required
                className="w-full px-3 py-2 border rounded-lg text-sm"
              >
                <option value="">Select analyst...</option>
                {analysts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.firm})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Ticker
              </label>
              <input
                type="text"
                value={newCall.ticker}
                onChange={(e) =>
                  setNewCall({ ...newCall, ticker: e.target.value.toUpperCase() })
                }
                required
                placeholder="AAPL"
                className="w-full px-3 py-2 border rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Action
              </label>
              <select
                value={newCall.action}
                onChange={(e) => setNewCall({ ...newCall, action: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg text-sm"
              >
                <option value="buy">Buy</option>
                <option value="sell">Sell</option>
                <option value="hold">Hold</option>
                <option value="upgrade">Upgrade</option>
                <option value="downgrade">Downgrade</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Price Target
              </label>
              <input
                type="number"
                step="0.01"
                value={newCall.priceTarget}
                onChange={(e) => setNewCall({ ...newCall, priceTarget: e.target.value })}
                placeholder="150.00"
                className="w-full px-3 py-2 border rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Price at Call
              </label>
              <input
                type="number"
                step="0.01"
                value={newCall.priceAtCall}
                onChange={(e) => setNewCall({ ...newCall, priceAtCall: e.target.value })}
                placeholder="120.00"
                className="w-full px-3 py-2 border rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Call Date
              </label>
              <input
                type="date"
                value={newCall.callDate}
                onChange={(e) => setNewCall({ ...newCall, callDate: e.target.value })}
                required
                className="w-full px-3 py-2 border rounded-lg text-sm"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Notes
            </label>
            <input
              type="text"
              value={newCall.notes}
              onChange={(e) => setNewCall({ ...newCall, notes: e.target.value })}
              placeholder="Optional notes..."
              className="w-full px-3 py-2 border rounded-lg text-sm"
            />
          </div>
          <button
            type="submit"
            className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-emerald-700"
          >
            Save Call
          </button>
        </form>
      )}

      {/* Calls Table */}
      <div>
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">
          {selectedAnalyst
            ? `Calls by ${analysts.find((a) => a.id === selectedAnalyst)?.name}`
            : "Recent Calls"}
        </h2>
        {filteredCalls.length > 0 ? (
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50">
                  <th className="text-left p-3 font-medium text-gray-600">Date</th>
                  <th className="text-left p-3 font-medium text-gray-600">Analyst</th>
                  <th className="text-left p-3 font-medium text-gray-600">Ticker</th>
                  <th className="text-left p-3 font-medium text-gray-600">Action</th>
                  <th className="text-right p-3 font-medium text-gray-600">Target</th>
                  <th className="text-right p-3 font-medium text-gray-600">At Call</th>
                  <th className="text-left p-3 font-medium text-gray-600">Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredCalls.map((call) => (
                  <tr key={call.id} className="border-b hover:bg-gray-50">
                    <td className="p-3 text-gray-600">
                      {formatDate(call.callDate, { style: "date-only" })}
                    </td>
                    <td className="p-3">
                      <div className="font-medium text-gray-900">{call.analystName}</div>
                      <div className="text-xs text-gray-500">{call.analystFirm}</div>
                    </td>
                    <td className="p-3 font-medium text-gray-900">{call.ticker}</td>
                    <td className="p-3">
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-medium ${getActionColor(
                          call.action
                        )}`}
                      >
                        {call.action.toUpperCase()}
                      </span>
                    </td>
                    <td className="p-3 text-right text-gray-600">
                      {call.priceTarget ? `$${call.priceTarget.toFixed(2)}` : "—"}
                    </td>
                    <td className="p-3 text-right text-gray-600">
                      {call.priceAtCall ? `$${call.priceAtCall.toFixed(2)}` : "—"}
                    </td>
                    <td className="p-3">
                      <span
                        className={`px-2 py-1 rounded-full text-xs ${
                          call.outcome === "hit"
                            ? "bg-emerald-100 text-emerald-700"
                            : call.outcome === "miss"
                            ? "bg-red-100 text-red-700"
                            : "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {call.outcome || "pending"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="card p-8 text-center">
            <div className="text-4xl mb-3">📋</div>
            <div className="text-gray-500">No calls logged yet</div>
            <div className="text-sm text-gray-400 mt-1">
              Click &ldquo;Log New Call&rdquo; to start tracking
            </div>
          </div>
        )}
      </div>
    </>
  );
}
