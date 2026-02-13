"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { Plus, ChevronDown, ChevronRight, Trash2, X, Sparkles, Edit2, Target } from "lucide-react";
import { SkeletonTableRow } from "@/components/Skeleton";
import { ThemeWithPerformance, ThemePerformance, ThemeStockStatus } from "@/lib/types";

interface ThemesTabProps {
  initialThemes?: ThemeWithPerformance[];
}

interface SuggestedStock {
  ticker: string;
  adding?: boolean;
}

interface EditingStock {
  themeId: number;
  ticker: string;
  target_price: number | null;
  status: ThemeStockStatus;
  notes: string | null;
}

function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined) return "-";
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

function getPercentColor(value: number | null | undefined): string {
  if (value === null || value === undefined) return "text-gray-400";
  return value >= 0 ? "text-emerald-600" : "text-red-600";
}

function formatPrice(price: number | null | undefined): string {
  if (price === null || price === undefined) return "-";
  return `$${price.toFixed(2)}`;
}

function getTradingViewUrl(ticker: string): string {
  if (ticker.includes(".")) {
    return `https://www.tradingview.com/chart/?symbol=${ticker}`;
  }
  return `https://www.tradingview.com/chart/?symbol=${ticker}`;
}

function StatusBadge({ status }: { status: ThemeStockStatus }) {
  const styles: Record<ThemeStockStatus, string> = {
    watching: "bg-gray-100 text-gray-600",
    accumulating: "bg-amber-100 text-amber-700",
    holding: "bg-emerald-100 text-emerald-700",
  };
  const labels: Record<ThemeStockStatus, string> = {
    watching: "👀",
    accumulating: "📈",
    holding: "💎",
  };
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${styles[status]}`} title={status}>
      {labels[status]}
    </span>
  );
}

function GapIndicator({ gap, hasTarget }: { gap: number | null; hasTarget: boolean }) {
  if (!hasTarget) return <span className="text-gray-300">-</span>;
  if (gap === null) return <span className="text-gray-400">-</span>;
  
  const isAbove = gap > 0;
  const color = isAbove ? "text-red-500" : "text-emerald-600";
  const label = isAbove ? "above" : "below";
  
  return (
    <span className={`text-xs ${color}`} title={`${Math.abs(gap).toFixed(1)}% ${label} target`}>
      {isAbove ? "+" : ""}{gap.toFixed(1)}%
    </span>
  );
}

export function ThemesTab({ initialThemes }: ThemesTabProps) {
  const [themes, setThemes] = useState<ThemeWithPerformance[]>(initialThemes || []);
  const [loading, setLoading] = useState(!initialThemes);
  const [expandedTheme, setExpandedTheme] = useState<number | null>(null);
  const [expandedData, setExpandedData] = useState<ThemeWithPerformance | null>(null);
  const [loadingExpanded, setLoadingExpanded] = useState(false);
  
  // Suggested stocks
  const [suggestions, setSuggestions] = useState<SuggestedStock[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  
  // Add theme modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newStocks, setNewStocks] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Theme name suggestions
  const [themeSuggestions, setThemeSuggestions] = useState<string[]>([]);
  const [loadingThemeSuggestions, setLoadingThemeSuggestions] = useState(false);

  // Edit stock modal
  const [editingStock, setEditingStock] = useState<EditingStock | null>(null);
  const [editSubmitting, setEditSubmitting] = useState(false);

  // Fetch themes
  const fetchThemes = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/themes");
      const data = await res.json();
      setThemes(data.themes || []);
    } catch (e) {
      console.error("Failed to fetch themes:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!initialThemes) {
      fetchThemes();
    }
  }, [fetchThemes, initialThemes]);

  // Theme name suggestions
  useEffect(() => {
    if (!newName.trim() || newName.length < 2) {
      setThemeSuggestions([]);
      return;
    }

    const timer = setTimeout(async () => {
      setLoadingThemeSuggestions(true);
      try {
        const res = await fetch(`/api/themes/suggestions?name=${encodeURIComponent(newName)}`);
        const data = await res.json();
        if (data.matched && data.suggestions) {
          setThemeSuggestions(data.suggestions);
          if (data.description && !newDescription) {
            setNewDescription(data.description);
          }
        } else {
          setThemeSuggestions([]);
        }
      } catch {
        setThemeSuggestions([]);
      } finally {
        setLoadingThemeSuggestions(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [newName, newDescription]);

  // Fetch suggestions for expanded theme
  const fetchSuggestions = async (tickers: string[]) => {
    if (tickers.length === 0) return;
    
    setLoadingSuggestions(true);
    try {
      const res = await fetch(`/api/themes/suggestions?tickers=${tickers.join(",")}`);
      const data = await res.json();
      if (data.suggestions) {
        setSuggestions(data.suggestions.map((t: string) => ({ ticker: t })));
      }
    } catch {
      setSuggestions([]);
    } finally {
      setLoadingSuggestions(false);
    }
  };

  // Toggle expand theme
  const toggleExpand = async (themeId: number) => {
    if (expandedTheme === themeId) {
      setExpandedTheme(null);
      setExpandedData(null);
      setSuggestions([]);
      return;
    }

    setExpandedTheme(themeId);
    setLoadingExpanded(true);
    setSuggestions([]);

    try {
      const res = await fetch(`/api/themes/${themeId}`);
      const data = await res.json();
      setExpandedData(data.theme);
      
      if (data.theme?.stocks?.length > 0) {
        fetchSuggestions(data.theme.stocks);
      }
    } catch (e) {
      console.error("Failed to fetch theme details:", e);
    } finally {
      setLoadingExpanded(false);
    }
  };

  // Refresh expanded theme data
  const refreshExpandedTheme = async (themeId: number) => {
    try {
      const res = await fetch(`/api/themes/${themeId}`);
      const data = await res.json();
      setExpandedData(data.theme);
    } catch (e) {
      console.error("Failed to refresh theme:", e);
    }
  };

  // Add suggested stock
  const handleAddSuggestedStock = async (themeId: number, ticker: string) => {
    setSuggestions(prev => prev.map(s => 
      s.ticker === ticker ? { ...s, adding: true } : s
    ));

    try {
      const res = await fetch(`/api/themes/${themeId}/stocks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker }),
      });

      if (res.ok) {
        setSuggestions(prev => prev.filter(s => s.ticker !== ticker));
        await refreshExpandedTheme(themeId);
        fetchThemes();
      }
    } catch {
      setSuggestions(prev => prev.map(s => 
        s.ticker === ticker ? { ...s, adding: false } : s
      ));
    }
  };

  // Use theme suggestions
  const handleUseThemeSuggestions = () => {
    if (themeSuggestions.length > 0) {
      const currentStocks = newStocks.split(/[,\s]+/).filter(s => s.trim());
      const combined = Array.from(new Set([...currentStocks, ...themeSuggestions]));
      setNewStocks(combined.join(", "));
    }
  };

  // Add new theme
  const handleAddTheme = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/themes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName.trim(),
          description: newDescription.trim(),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to create theme");
        return;
      }

      const themeId = data.theme.id;

      const stockList = newStocks
        .split(/[,\s]+/)
        .map((s) => s.trim().toUpperCase())
        .filter((s) => s.length > 0);

      for (const ticker of stockList) {
        await fetch(`/api/themes/${themeId}/stocks`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ticker }),
        });
      }

      await fetchThemes();

      setNewName("");
      setNewDescription("");
      setNewStocks("");
      setThemeSuggestions([]);
      setShowAddModal(false);
    } catch {
      setError("Network error");
    } finally {
      setSubmitting(false);
    }
  };

  // Delete theme
  const handleDeleteTheme = async (themeId: number, themeName: string) => {
    if (!confirm(`Delete theme "${themeName}"?`)) return;

    try {
      const res = await fetch(`/api/themes/${themeId}`, { method: "DELETE" });
      if (res.ok) {
        setThemes(themes.filter((t) => t.id !== themeId));
        if (expandedTheme === themeId) {
          setExpandedTheme(null);
          setExpandedData(null);
          setSuggestions([]);
        }
      }
    } catch {
      // Ignore
    }
  };

  // Remove stock from theme
  const handleRemoveStock = async (themeId: number, ticker: string) => {
    if (!confirm(`Remove ${ticker} from theme?`)) return;

    try {
      const res = await fetch(`/api/themes/${themeId}/stocks/${ticker}`, {
        method: "DELETE",
      });
      if (res.ok && expandedData) {
        const newStocksList = expandedData.stocks.filter((t) => t !== ticker);
        const newStockPerfs = expandedData.stock_performances?.filter(
          (p) => p.ticker !== ticker
        );
        setExpandedData({
          ...expandedData,
          stocks: newStocksList,
          stock_performances: newStockPerfs,
        });
        fetchThemes();
      }
    } catch {
      // Ignore
    }
  };

  // Edit stock
  const handleEditStock = (themeId: number, stock: ThemePerformance) => {
    setEditingStock({
      themeId,
      ticker: stock.ticker,
      target_price: stock.target_price,
      status: stock.status || "watching",
      notes: stock.notes,
    });
  };

  // Save stock edit
  const handleSaveStockEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStock) return;

    setEditSubmitting(true);
    try {
      const res = await fetch(`/api/themes/${editingStock.themeId}/stocks`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticker: editingStock.ticker,
          target_price: editingStock.target_price,
          status: editingStock.status,
          notes: editingStock.notes,
        }),
      });

      if (res.ok) {
        await refreshExpandedTheme(editingStock.themeId);
        setEditingStock(null);
      }
    } catch (e) {
      console.error("Failed to update stock:", e);
    } finally {
      setEditSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-6 w-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold text-gray-900">Investment Themes</h2>
        <button
          onClick={() => setShowAddModal(true)}
          className="btn-primary flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Add Theme
        </button>
      </div>

      {/* Theme Leaderboard */}
      {themes.length > 0 ? (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-8"></th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Theme</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">1W</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">1M</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">3M</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Leader</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider w-12"></th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {themes.map((theme) => (
                <>
                  <tr
                    key={theme.id}
                    className="hover:bg-gray-50 cursor-pointer"
                    onClick={() => toggleExpand(theme.id)}
                  >
                    <td className="px-4 py-3 whitespace-nowrap">
                      {expandedTheme === theme.id ? (
                        <ChevronDown className="w-4 h-4 text-gray-400" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-gray-400" />
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div>
                        <div className="font-semibold text-gray-900">{theme.name}</div>
                        <div className="text-xs text-gray-500">{theme.stocks.length} stocks</div>
                      </div>
                    </td>
                    <td className={`px-4 py-3 whitespace-nowrap text-right text-sm font-medium ${getPercentColor(theme.performance_1w)}`}>
                      {formatPercent(theme.performance_1w)}
                    </td>
                    <td className={`px-4 py-3 whitespace-nowrap text-right text-sm font-medium ${getPercentColor(theme.performance_1m)}`}>
                      {formatPercent(theme.performance_1m)}
                    </td>
                    <td className={`px-4 py-3 whitespace-nowrap text-right text-sm font-medium ${getPercentColor(theme.performance_3m)}`}>
                      {formatPercent(theme.performance_3m)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {theme.leader ? (
                        <div className="flex items-center gap-2">
                          <Link
                            href={`/stocks/${theme.leader.ticker}`}
                            className="text-emerald-600 hover:text-emerald-700 font-semibold"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {theme.leader.ticker}
                          </Link>
                          <span className={`text-xs ${getPercentColor(theme.leader.performance_1m)}`}>
                            {formatPercent(theme.leader.performance_1m)}
                          </span>
                        </div>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteTheme(theme.id, theme.name);
                        }}
                        className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
                        title="Delete theme"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                  
                  {/* Expanded Stock Details */}
                  {expandedTheme === theme.id && (
                    <tr key={`${theme.id}-expanded`}>
                      <td colSpan={7} className="px-0 py-0">
                        <div className="bg-gray-50 border-t border-gray-200">
                          {loadingExpanded ? (
                            <div className="overflow-x-auto">
                              <table className="min-w-full">
                                <thead>
                                  <tr className="text-xs text-gray-500">
                                    <th className="px-4 py-2 text-center font-medium uppercase w-8">St</th>
                                    <th className="px-4 py-2 text-left font-medium uppercase">Ticker</th>
                                    <th className="px-4 py-2 text-center font-medium uppercase w-8"></th>
                                    <th className="px-4 py-2 text-right font-medium uppercase">Price</th>
                                    <th className="px-4 py-2 text-right font-medium uppercase">Target</th>
                                    <th className="px-4 py-2 text-right font-medium uppercase">Gap</th>
                                    <th className="px-4 py-2 text-right font-medium uppercase">1W</th>
                                    <th className="px-4 py-2 text-right font-medium uppercase">1M</th>
                                    <th className="px-4 py-2 text-right font-medium uppercase">3M</th>
                                    <th className="px-4 py-2 w-20"></th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200">
                                  {Array.from({ length: 4 }).map((_, i) => (
                                    <SkeletonTableRow key={i} cols={10} />
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          ) : expandedData?.stock_performances ? (
                            <>
                              <div className="overflow-x-auto">
                                <table className="min-w-full">
                                  <thead>
                                    <tr className="text-xs text-gray-500">
                                      <th className="px-4 py-2 text-center font-medium uppercase w-8">St</th>
                                      <th className="px-4 py-2 text-left font-medium uppercase">Ticker</th>
                                      <th className="px-4 py-2 text-center font-medium uppercase w-8"></th>
                                      <th className="px-4 py-2 text-right font-medium uppercase">Price</th>
                                      <th className="px-4 py-2 text-right font-medium uppercase">Target</th>
                                      <th className="px-4 py-2 text-right font-medium uppercase">Gap</th>
                                      <th className="px-4 py-2 text-right font-medium uppercase">1W</th>
                                      <th className="px-4 py-2 text-right font-medium uppercase">1M</th>
                                      <th className="px-4 py-2 text-right font-medium uppercase">3M</th>
                                      <th className="px-4 py-2 w-20"></th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-gray-200">
                                    {expandedData.stock_performances.map((stock: ThemePerformance) => (
                                      <tr key={stock.ticker} className="hover:bg-gray-100">
                                        <td className="px-4 py-2 text-center">
                                          <StatusBadge status={stock.status || "watching"} />
                                        </td>
                                        <td className="px-4 py-2">
                                          <div className="flex flex-col">
                                            <div className="flex items-center gap-1">
                                              <Link
                                                href={`/stocks/${stock.ticker}`}
                                                className="text-emerald-600 hover:text-emerald-700 font-semibold"
                                              >
                                                {stock.ticker}
                                              </Link>
                                              {stock.notes && (
                                                <span className="text-gray-400" title={stock.notes}>📝</span>
                                              )}
                                            </div>
                                            {stock.name && (
                                              <span className="text-xs text-gray-500 truncate max-w-[180px]" title={stock.name}>
                                                {stock.name}
                                              </span>
                                            )}
                                          </div>
                                        </td>
                                        <td className="px-4 py-2 text-center">
                                          <a
                                            href={getTradingViewUrl(stock.ticker)}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="inline-block hover:opacity-80"
                                            title={`View ${stock.ticker} on TradingView`}
                                          >
                                            <Image src="/tradingview.svg" alt="TV" width={18} height={18} className="rounded" />
                                          </a>
                                        </td>
                                        <td className="px-4 py-2 text-right text-sm font-medium">
                                          {formatPrice(stock.current_price)}
                                        </td>
                                        <td className="px-4 py-2 text-right text-sm text-gray-600">
                                          {stock.target_price ? (
                                            <span className="flex items-center justify-end gap-1">
                                              <Target className="w-3 h-3 text-gray-400" />
                                              {formatPrice(stock.target_price)}
                                            </span>
                                          ) : (
                                            <span className="text-gray-300">-</span>
                                          )}
                                        </td>
                                        <td className="px-4 py-2 text-right">
                                          <GapIndicator gap={stock.price_gap_percent} hasTarget={stock.target_price !== null} />
                                        </td>
                                        <td className={`px-4 py-2 text-right text-sm font-medium ${getPercentColor(stock.performance_1w)}`}>
                                          {formatPercent(stock.performance_1w)}
                                        </td>
                                        <td className={`px-4 py-2 text-right text-sm font-medium ${getPercentColor(stock.performance_1m)}`}>
                                          {formatPercent(stock.performance_1m)}
                                        </td>
                                        <td className={`px-4 py-2 text-right text-sm font-medium ${getPercentColor(stock.performance_3m)}`}>
                                          {formatPercent(stock.performance_3m)}
                                        </td>
                                        <td className="px-4 py-2 text-right">
                                          <div className="flex items-center justify-end gap-1">
                                            <button
                                              onClick={() => handleEditStock(theme.id, stock)}
                                              className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded"
                                              title="Edit"
                                            >
                                              <Edit2 className="w-3 h-3" />
                                            </button>
                                            <button
                                              onClick={() => handleRemoveStock(theme.id, stock.ticker)}
                                              className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
                                              title="Remove"
                                            >
                                              <X className="w-3 h-3" />
                                            </button>
                                          </div>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                              
                              {/* Suggested Stocks */}
                              {(loadingSuggestions || suggestions.length > 0) && (
                                <div className="px-6 py-4 border-t border-gray-200 bg-gray-100">
                                  <div className="flex items-center gap-2 mb-3">
                                    <Sparkles className="w-4 h-4 text-amber-500" />
                                    <span className="text-sm font-medium text-gray-700">Suggested Stocks</span>
                                  </div>
                                  {loadingSuggestions ? (
                                    <div className="flex items-center gap-2 text-sm text-gray-500">
                                      <div className="h-4 w-4 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                                      Finding related stocks...
                                    </div>
                                  ) : (
                                    <div className="flex flex-wrap gap-2">
                                      {suggestions.map((s) => (
                                        <button
                                          key={s.ticker}
                                          onClick={() => handleAddSuggestedStock(theme.id, s.ticker)}
                                          disabled={s.adding}
                                          className="inline-flex items-center gap-1 px-3 py-1.5 bg-white border border-gray-200 rounded-full text-sm font-medium text-gray-700 hover:bg-emerald-50 hover:border-emerald-200 hover:text-emerald-700 transition-colors disabled:opacity-50"
                                        >
                                          {s.adding ? (
                                            <div className="h-3 w-3 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                                          ) : (
                                            <Plus className="w-3 h-3" />
                                          )}
                                          {s.ticker}
                                        </button>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              )}
                            </>
                          ) : (
                            <div className="py-4 text-center text-gray-500">No stocks in theme</div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      ) : (
        <div className="card text-center py-12">
          <div className="text-4xl mb-3">📊</div>
          <h3 className="text-lg font-semibold text-gray-900 mb-1">No themes yet</h3>
          <p className="text-sm text-gray-500">Create investment themes to track baskets of related stocks</p>
        </div>
      )}

      {/* Add Theme Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4 p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Add Theme</h3>
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setThemeSuggestions([]);
                  setNewName("");
                  setNewDescription("");
                  setNewStocks("");
                }}
                className="p-1 text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddTheme} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g., Quantum Computing"
                  className="input w-full"
                  required
                />
                {loadingThemeSuggestions && (
                  <p className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                    <span className="h-3 w-3 border border-gray-400 border-t-transparent rounded-full animate-spin" />
                    Looking for suggestions...
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description (optional)</label>
                <input
                  type="text"
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder="Brief description"
                  className="input w-full"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-sm font-medium text-gray-700">Stocks</label>
                  {themeSuggestions.length > 0 && (
                    <button
                      type="button"
                      onClick={handleUseThemeSuggestions}
                      className="text-xs text-emerald-600 hover:text-emerald-700 flex items-center gap-1"
                    >
                      <Sparkles className="w-3 h-3" />
                      Use suggestions ({themeSuggestions.length})
                    </button>
                  )}
                </div>
                <input
                  type="text"
                  value={newStocks}
                  onChange={(e) => setNewStocks(e.target.value)}
                  placeholder="IONQ, RGTI, QBTS"
                  className="input w-full"
                />
                {themeSuggestions.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {themeSuggestions.map((ticker) => (
                      <span key={ticker} className="inline-flex items-center px-2 py-0.5 bg-emerald-50 text-emerald-700 text-xs rounded-full border border-emerald-200">
                        {ticker}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {error && <p className="text-sm text-red-600">{error}</p>}

              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowAddModal(false)} className="btn-secondary">
                  Cancel
                </button>
                <button type="submit" disabled={submitting} className="btn-primary">
                  {submitting ? "Creating..." : "Create Theme"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Stock Modal */}
      {editingStock && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full mx-4 p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Edit {editingStock.ticker}</h3>
              <button onClick={() => setEditingStock(null)} className="p-1 text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveStockEdit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                <select
                  value={editingStock.status}
                  onChange={(e) => setEditingStock({ ...editingStock, status: e.target.value as ThemeStockStatus })}
                  className="input w-full"
                >
                  <option value="watching">👀 Watching</option>
                  <option value="accumulating">📈 Accumulating</option>
                  <option value="holding">💎 Holding</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Target Price</label>
                <input
                  type="number"
                  step="0.01"
                  value={editingStock.target_price ?? ""}
                  onChange={(e) => setEditingStock({ 
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
                  onChange={(e) => setEditingStock({ ...editingStock, notes: e.target.value || null })}
                  placeholder="Investment thesis, key levels..."
                  className="input w-full h-20 resize-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setEditingStock(null)} className="btn-secondary">
                  Cancel
                </button>
                <button type="submit" disabled={editSubmitting} className="btn-primary">
                  {editSubmitting ? "Saving..." : "Save"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
