"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Plus, Trash2, Search, Filter, ToggleLeft, ToggleRight, ChevronLeft, ChevronRight } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";

const ITEMS_PER_PAGE = 50;

interface ScannerTicker {
  id: number;
  ticker: string;
  market: string;
  name: string | null;
  sector: string | null;
  source: string;
  enabled: boolean;
  notes: string | null;
  createdAt: string;
}

interface Summary {
  total: number;
  enabled: number;
  byMarket: {
    US: number;
    SGX: number;
    HK: number;
    JP: number;
    CN: number;
    LSE: number;
  };
}

export function UniverseManager() {
  const [tickers, setTickers] = useState<ScannerTicker[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("");
  const [marketFilter, setMarketFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newTicker, setNewTicker] = useState({ ticker: "", market: "US", notes: "" });
  const [saving, setSaving] = useState<string | null>(null);
  const { confirm, dialogProps } = useConfirmDialog();

  const fetchTickers = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (marketFilter !== "all") params.set("market", marketFilter);
      
      const res = await fetch(`/api/scanner/universe?${params}`);
      const data = await res.json();
      setTickers(data.tickers || []);
      setSummary(data.summary || null);
    } catch (error) {
      console.error("Failed to fetch tickers:", error);
    } finally {
      setLoading(false);
    }
  }, [marketFilter]);

  useEffect(() => {
    fetchTickers();
  }, [fetchTickers]);

  const toggleEnabled = async (ticker: string, enabled: boolean) => {
    setSaving(ticker);
    try {
      await fetch("/api/scanner/universe", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker, enabled }),
      });
      setTickers((prev) =>
        prev.map((t) => (t.ticker === ticker ? { ...t, enabled } : t))
      );
    } catch (error) {
      console.error("Failed to toggle:", error);
    } finally {
      setSaving(null);
    }
  };

  const deleteTicker = async (ticker: string) => {
    const ok = await confirm(`Remove ${ticker}?`, "Remove this ticker from the scan list.", { variant: "danger", confirmLabel: "Remove" });
    if (!ok) return;
    
    setSaving(ticker);
    try {
      await fetch(`/api/scanner/universe?ticker=${ticker}`, { method: "DELETE" });
      setTickers((prev) => prev.filter((t) => t.ticker !== ticker));
      if (summary) {
        setSummary({ ...summary, total: summary.total - 1 });
      }
    } catch (error) {
      console.error("Failed to delete:", error);
    } finally {
      setSaving(null);
    }
  };

  const addTicker = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTicker.ticker.trim()) return;

    setSaving("new");
    try {
      const res = await fetch("/api/scanner/universe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticker: newTicker.ticker.toUpperCase(),
          market: newTicker.market,
          notes: newTicker.notes || null,
          source: "user",
        }),
      });
      
      if (res.ok) {
        setNewTicker({ ticker: "", market: "US", notes: "" });
        setShowAddForm(false);
        fetchTickers();
      }
    } catch (error) {
      console.error("Failed to add:", error);
    } finally {
      setSaving(null);
    }
  };

  const filteredTickers = useMemo(() => {
    return tickers.filter((t) => {
      const matchesSearch = !filter || 
        t.ticker.toLowerCase().includes(filter.toLowerCase()) ||
        t.name?.toLowerCase().includes(filter.toLowerCase());
      return matchesSearch;
    });
  }, [tickers, filter]);

  // Pagination
  const totalPages = Math.ceil(filteredTickers.length / ITEMS_PER_PAGE);
  const paginatedTickers = useMemo(() => {
    const start = (page - 1) * ITEMS_PER_PAGE;
    return filteredTickers.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredTickers, page]);

  // Reset page when filter changes
  useEffect(() => {
    setPage(1);
  }, [filter, marketFilter]);

  const marketColors: Record<string, string> = {
    US: "bg-blue-100 text-blue-700",
    SGX: "bg-emerald-100 text-emerald-700",
    HK: "bg-rose-100 text-rose-700",
    JP: "bg-slate-100 text-slate-700",
    CN: "bg-amber-100 text-amber-700",
    LSE: "bg-rose-50 text-rose-700",
  };

  return (
    <div className="bg-white rounded-lg border p-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold">Scan List</h2>
          {summary && (
            <div className="text-sm text-gray-500">
              <span>{summary.enabled} enabled of {summary.total} total</span>
              <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1">
                <span className="inline-flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                  US: {summary.byMarket.US}
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                  CN: {summary.byMarket.CN || 0}
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                  HK: {summary.byMarket.HK}
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-slate-500"></span>
                  JP: {summary.byMarket.JP}
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                  SGX: {summary.byMarket.SGX}
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-rose-400"></span>
                  LSE: {summary.byMarket.LSE || 0}
                </span>
              </div>
            </div>
          )}
        </div>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="flex items-center gap-1 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700"
        >
          <Plus size={16} />
          Add Ticker
        </button>
      </div>

      {/* Add Form */}
      {showAddForm && (
        <form onSubmit={addTicker} className="mb-4 p-3 bg-gray-50 rounded-lg border">
          <div className="flex gap-2 flex-wrap">
            <input
              type="text"
              placeholder="Ticker (e.g., AAPL)"
              value={newTicker.ticker}
              onChange={(e) => setNewTicker({ ...newTicker, ticker: e.target.value.toUpperCase() })}
              className="px-3 py-1.5 border rounded-md text-sm w-32"
              autoFocus
            />
            <select
              value={newTicker.market}
              onChange={(e) => setNewTicker({ ...newTicker, market: e.target.value })}
              className="px-3 py-1.5 border rounded-md text-sm"
            >
              <option value="US">US</option>
              <option value="SGX">SGX</option>
              <option value="HK">HK</option>
              <option value="JP">Japan</option>
              <option value="CN">China</option>
              <option value="LSE">UK (LSE)</option>
            </select>
            <input
              type="text"
              placeholder="Notes (optional)"
              value={newTicker.notes}
              onChange={(e) => setNewTicker({ ...newTicker, notes: e.target.value })}
              className="px-3 py-1.5 border rounded-md text-sm flex-1 min-w-[150px]"
            />
            <button
              type="submit"
              disabled={saving === "new"}
              className="px-4 py-1.5 bg-green-600 text-white rounded-md text-sm hover:bg-green-700 disabled:opacity-50"
            >
              {saving === "new" ? "Adding..." : "Add"}
            </button>
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="px-4 py-1.5 text-gray-600 text-sm hover:text-gray-900"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Filters */}
      <div className="flex gap-2 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search tickers..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 border rounded-md text-sm"
          />
        </div>
        <div className="flex items-center gap-1">
          <Filter size={16} className="text-gray-400" />
          <select
            value={marketFilter}
            onChange={(e) => setMarketFilter(e.target.value)}
            className="px-3 py-1.5 border rounded-md text-sm"
          >
            <option value="all">All Markets</option>
            <option value="US">US</option>
            <option value="SGX">SGX</option>
            <option value="HK">HK</option>
            <option value="JP">Japan</option>
            <option value="CN">China</option>
            <option value="LSE">UK (LSE)</option>
          </select>
        </div>
      </div>

      {/* Ticker List */}
      {loading ? (
        <div className="text-center py-8 text-gray-500">Loading...</div>
      ) : filteredTickers.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          {filter ? "No tickers match your search" : "No tickers in scan list"}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="pb-2 font-medium">Ticker</th>
                <th className="pb-2 font-medium hidden sm:table-cell">Name</th>
                <th className="pb-2 font-medium">Market</th>
                <th className="pb-2 font-medium text-center">Enabled</th>
                <th className="pb-2 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginatedTickers.map((t) => (
                <tr key={t.id} className={`border-b hover:bg-gray-50 ${!t.enabled ? "opacity-50" : ""}`}>
                  <td className="py-2 font-mono font-medium">{t.ticker}</td>
                  <td className="py-2 text-gray-600 truncate max-w-[200px] hidden sm:table-cell">
                    {t.name || <span className="text-gray-400 italic">—</span>}
                  </td>
                  <td className="py-2">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${marketColors[t.market] || "bg-gray-100 text-gray-700"}`}>
                      {t.market}
                    </span>
                  </td>
                  <td className="py-2 text-center">
                    <button
                      onClick={() => toggleEnabled(t.ticker, !t.enabled)}
                      disabled={saving === t.ticker}
                      className="p-1 hover:bg-gray-100 rounded transition-colors"
                      title={t.enabled ? "Disable" : "Enable"}
                    >
                      {t.enabled ? (
                        <ToggleRight size={20} className="text-green-600" />
                      ) : (
                        <ToggleLeft size={20} className="text-gray-400" />
                      )}
                    </button>
                  </td>
                  <td className="py-2 text-right">
                    <button
                      onClick={() => deleteTicker(t.ticker)}
                      disabled={saving === t.ticker}
                      className="p-1 text-red-500 hover:bg-red-50 rounded transition-colors"
                      title="Remove from list"
                    >
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 pt-4 border-t">
              <span className="text-sm text-gray-500">
                Showing {(page - 1) * ITEMS_PER_PAGE + 1}-{Math.min(page * ITEMS_PER_PAGE, filteredTickers.length)} of {filteredTickers.length}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="p-1.5 border rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ChevronLeft size={16} />
                </button>
                <span className="text-sm px-2">
                  Page {page} of {totalPages}
                </span>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="p-1.5 border rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
      <ConfirmDialog {...dialogProps} />
    </div>
  );
}
