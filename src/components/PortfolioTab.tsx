"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Pencil, Trash2, Plus, X, Check, ChevronDown, ChevronUp } from "lucide-react";
import { PortfolioHolding, PortfolioReport } from "@/lib/types";
import { AllocationBar } from "./AllocationBar";
import { InvestorCritiques, parseCritiquesFromMarkdown } from "./InvestorCritiques";
import { formatDate } from "@/lib/date";
import { marked } from "marked";

interface PortfolioTabProps {
  initialHoldings: PortfolioHolding[];
  initialReports: PortfolioReport[];
}

export function PortfolioTab({ initialHoldings, initialReports }: PortfolioTabProps) {
  const [holdings, setHoldings] = useState<PortfolioHolding[]>(initialHoldings);
  const [reports] = useState<PortfolioReport[]>(initialReports);
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [loadingPrices, setLoadingPrices] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  // Form state
  const [newTicker, setNewTicker] = useState("");
  const [newAllocation, setNewAllocation] = useState("");
  const [newCostBasis, setNewCostBasis] = useState("");
  const [newShares, setNewShares] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Edit form state
  const [editAllocation, setEditAllocation] = useState("");
  const [editCostBasis, setEditCostBasis] = useState("");
  const [editShares, setEditShares] = useState("");
  const [reportExpanded, setReportExpanded] = useState(false);

  // Fetch prices for all tickers
  const fetchPrices = useCallback(async () => {
    if (holdings.length === 0) return;

    setLoadingPrices(true);
    try {
      const tickers = holdings.map((h) => h.ticker).join(",");
      const res = await fetch(`/api/stocks/prices?tickers=${tickers}`);
      const data = await res.json();
      if (data.prices) {
        setPrices(data.prices);
      }
    } catch {
      // Ignore price errors
    } finally {
      setLoadingPrices(false);
    }
  }, [holdings]);

  useEffect(() => {
    fetchPrices();
  }, [fetchPrices]);

  const totalAllocation = holdings.reduce((sum, h) => sum + h.target_allocation, 0);

  const handleAddHolding = async (e: React.FormEvent) => {
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

      setHoldings([...holdings, data.holding].sort(
        (a, b) => b.target_allocation - a.target_allocation
      ));
      setNewTicker("");
      setNewAllocation("");
      setNewCostBasis("");
      setNewShares("");
      setShowAddForm(false);
    } catch {
      setError("Network error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Remove from portfolio?")) return;

    try {
      const res = await fetch(`/api/portfolio/holdings/${id}`, { method: "DELETE" });
      if (res.ok) {
        setHoldings(holdings.filter((h) => h.id !== id));
      }
    } catch {
      // Ignore
    }
  };

  const startEdit = (holding: PortfolioHolding) => {
    setEditingId(holding.id);
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
          target_allocation: parseFloat(editAllocation),
          cost_basis: editCostBasis ? parseFloat(editCostBasis) : null,
          shares: editShares ? parseFloat(editShares) : null,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setHoldings(
          holdings
            .map((h) => (h.id === id ? data.holding : h))
            .sort((a, b) => b.target_allocation - a.target_allocation)
        );
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

  const calculatePL = (current: number | undefined, costBasis: number | null) => {
    if (!current || !costBasis) return null;
    return ((current - costBasis) / costBasis) * 100;
  };

  const latestReport = reports[0];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold text-gray-900">Portfolio Holdings</h2>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="btn-primary flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Add Holding
        </button>
      </div>

      {/* Add Form */}
      {showAddForm && (
        <form onSubmit={handleAddHolding} className="card space-y-4">
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

      {/* Allocation Bar */}
      {holdings.length > 0 && (
        <div className="card">
          <AllocationBar
            items={holdings.map((h) => ({
              ticker: h.ticker,
              allocation: h.target_allocation,
            }))}
          />
        </div>
      )}

      {/* Holdings Table */}
      {holdings.length > 0 ? (
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
              {holdings.map((holding) => {
                const price = prices[holding.ticker];
                const pl = calculatePL(price, holding.cost_basis);
                const isEditing = editingId === holding.id;

                return (
                  <tr key={holding.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 whitespace-nowrap">
                      <Link
                        href={`/stocks/${holding.ticker}`}
                        className="text-emerald-600 hover:text-emerald-700 font-semibold"
                      >
                        {holding.ticker}
                      </Link>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-right text-sm">
                      {isEditing ? (
                        <input
                          type="number"
                          step="0.1"
                          value={editAllocation}
                          onChange={(e) => setEditAllocation(e.target.value)}
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
                          onChange={(e) => setEditCostBasis(e.target.value)}
                          className="input w-24 text-right"
                        />
                      ) : (
                        formatPrice(holding.cost_basis)
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-right text-sm">
                      {pl !== null ? (
                        <span
                          className={pl >= 0 ? "text-emerald-600" : "text-red-600"}
                        >
                          {pl >= 0 ? "+" : ""}
                          {pl.toFixed(1)}%
                        </span>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-right">
                      <div className="flex items-center justify-end gap-1">
                        {isEditing ? (
                          <>
                            <button
                              onClick={() => saveEdit(holding.id)}
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
                              onClick={() => startEdit(holding)}
                              className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
                              title="Edit"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDelete(holding.id)}
                              className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
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
              })}
              {/* Total Row */}
              <tr className="bg-gray-50 font-medium">
                <td className="px-4 py-3 text-sm">Total</td>
                <td className="px-4 py-3 text-right text-sm">{totalAllocation}%</td>
                <td colSpan={4}></td>
              </tr>
            </tbody>
          </table>
        </div>
      ) : (
        <div className="card text-center py-12">
          <div className="text-4xl mb-3">💼</div>
          <h3 className="text-lg font-semibold text-gray-900 mb-1">
            Portfolio is empty
          </h3>
          <p className="text-sm text-gray-500">
            Add your first holding to start tracking
          </p>
        </div>
      )}

      {/* Investor Critiques */}
      {latestReport && (
        <InvestorCritiques critiques={parseCritiquesFromMarkdown(latestReport.content)} />
      )}

      {/* Latest Report */}
      {latestReport && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            Latest Analysis
            <span className="text-sm font-normal text-gray-500">
              {formatDate(latestReport.created_at)}
            </span>
          </h2>
          <div className="card">
            {latestReport.summary && (
              <div className="mb-4 p-4 bg-emerald-50 rounded-lg">
                <p className="text-sm text-emerald-800">{latestReport.summary}</p>
              </div>
            )}
            
            {/* Expand/Collapse Button */}
            <button
              onClick={() => setReportExpanded(!reportExpanded)}
              className="w-full flex items-center justify-center gap-2 py-3 text-sm font-medium text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors"
            >
              {reportExpanded ? (
                <>
                  <ChevronUp className="w-4 h-4" />
                  Collapse Report
                </>
              ) : (
                <>
                  <ChevronDown className="w-4 h-4" />
                  View Full Report
                </>
              )}
            </button>
            
            {/* Expandable Report Content */}
            {reportExpanded && (
              <div
                className="mt-4 pt-4 border-t border-gray-100 prose prose-sm max-w-none prose-table:text-xs [&_table]:block [&_table]:overflow-x-auto [&_table]:whitespace-nowrap [&_th]:px-2 [&_td]:px-2"
                dangerouslySetInnerHTML={{
                  __html: marked(latestReport.content) as string,
                }}
              />
            )}
          </div>
        </div>
      )}

      {/* Historical Reports placeholder */}
      {reports.length > 1 && (
        <div className="text-sm text-gray-500">
          + {reports.length - 1} historical report{reports.length > 2 ? "s" : ""}
        </div>
      )}
    </div>
  );
}
