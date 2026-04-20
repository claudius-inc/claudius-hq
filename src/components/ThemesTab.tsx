"use client";

import { useState, useEffect, useCallback } from "react";
import useSWR from "swr";
import { Plus } from "lucide-react";
import { PageHero } from "@/components/PageHero";
import { ThemeWithPerformance, ThemePerformance } from "@/lib/types";
import {
  ThemeLeaderboard,
  AddThemeModal,
  EditStockModal,
  SuggestedStock,
  EditingStock,
} from "./themes";

// Lite theme from DB (no prices)
interface ThemeLite {
  id: number;
  name: string;
  description: string;
  created_at: string;
  stocks: string[];
}

// Price data from /api/themes/prices
interface ThemePriceData {
  prices: Record<string, {
    ticker: string;
    name: string | null;
    performance_1w: number | null;
    performance_1m: number | null;
    performance_3m: number | null;
    current_price: number | null;
    crowdingScore?: number;
    crowdingLevel?: string;
  }>;
  basket: {
    performance_1w: number | null;
    performance_1m: number | null;
    performance_3m: number | null;
    leaders: {
      "1w": { ticker: string; value: number } | null;
      "1m": { ticker: string; value: number } | null;
      "3m": { ticker: string; value: number } | null;
    };
    crowdingScore?: number;
    crowdingLevel?: string;
  };
}

const fetcher = (url: string) => fetch(url).then((r) => r.ok ? r.json() : null);

interface ThemesTabProps {
  initialThemes?: ThemeWithPerformance[];
  initialThemesLite?: ThemeLite[];
  hideHero?: boolean;
}

export function ThemesTab({ initialThemes, initialThemesLite, hideHero = false }: ThemesTabProps) {
  // If we have full themes, use them; otherwise start with lite
  const [themesLite, setThemesLite] = useState<ThemeLite[]>(
    initialThemesLite || 
    initialThemes?.map(t => ({ id: t.id, name: t.name, description: t.description, created_at: t.created_at, stocks: t.stocks })) || 
    []
  );
  const [themePrices, setThemePrices] = useState<Map<number, ThemePriceData>>(new Map());
  const [loading, setLoading] = useState(!initialThemes && !initialThemesLite);
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

  // Fetch themes lite if not provided
  const fetchThemesLite = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/themes/lite");
      const data = await res.json();
      setThemesLite(data.themes || []);
    } catch (e) {
      console.error("Failed to fetch themes:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!initialThemes && !initialThemesLite) {
      fetchThemesLite();
    }
  }, [fetchThemesLite, initialThemes, initialThemesLite]);

  // Progressively fetch prices for each theme
  useEffect(() => {
    if (themesLite.length === 0) return;
    
    // Fetch prices for themes that don't have them yet
    themesLite.forEach(async (theme) => {
      if (themePrices.has(theme.id) || theme.stocks.length === 0) return;
      
      try {
        const res = await fetch(`/api/themes/prices?tickers=${theme.stocks.join(",")}`);
        if (res.ok) {
          const data: ThemePriceData = await res.json();
          setThemePrices(prev => new Map(prev).set(theme.id, data));
        }
      } catch (e) {
        console.error(`Failed to fetch prices for theme ${theme.id}:`, e);
      }
    });
  }, [themesLite, themePrices]);

  // Build themes with performance from lite + prices
  const themes: ThemeWithPerformance[] = themesLite.map((theme) => {
    const priceData = themePrices.get(theme.id);
    return {
      id: theme.id,
      name: theme.name,
      description: theme.description,
      created_at: theme.created_at,
      stocks: theme.stocks,
      performance_1w: priceData?.basket.performance_1w ?? null,
      performance_1m: priceData?.basket.performance_1m ?? null,
      performance_3m: priceData?.basket.performance_3m ?? null,
      leaders: priceData?.basket.leaders ?? { "1w": null, "1m": null, "3m": null },
      crowdingScore: priceData?.basket.crowdingScore,
      crowdingLevel: priceData?.basket.crowdingLevel,
      // Mark if prices are still loading
      _pricesLoading: !priceData && theme.stocks.length > 0,
    } as ThemeWithPerformance & { _pricesLoading?: boolean };
  });

  // Sort by 1M performance (themes with prices first)
  themes.sort((a, b) => {
    // Put themes with prices first
    const aHasPrice = a.performance_1m !== null;
    const bHasPrice = b.performance_1m !== null;
    if (aHasPrice && !bHasPrice) return -1;
    if (!aHasPrice && bHasPrice) return 1;
    // Then sort by performance
    return (b.performance_1m ?? -999) - (a.performance_1m ?? -999);
  });

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
        // Also update lite list
        setThemesLite(prev => prev.map(t => 
          t.id === themeId ? { ...t, stocks: [...t.stocks, ticker] } : t
        ));
        // Clear cached prices so they re-fetch
        setThemePrices(prev => {
          const next = new Map(prev);
          next.delete(themeId);
          return next;
        });
      }
    } catch {
      setSuggestions(prev => prev.map(s => 
        s.ticker === ticker ? { ...s, adding: false } : s
      ));
    }
  };

  // Use theme suggestions
  const handleToggleSuggestion = (ticker: string) => {
    const currentStocks = newStocks.split(/[, ,\s]+/).map(s => s.trim().toUpperCase()).filter(Boolean);
    const upper = ticker.toUpperCase();
    if (currentStocks.includes(upper)) {
      const filtered = currentStocks.filter(t => t !== upper);
      setNewStocks(filtered.join(", "));
    } else {
      const combined = [...currentStocks, upper];
      setNewStocks(combined.join(", "));
    }
  };

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

      // Refresh lite themes
      await fetchThemesLite();
      handleCloseAddModal();
    } catch {
      setError("Network error");
    } finally {
      setSubmitting(false);
    }
  };

  // Close add modal
  const handleCloseAddModal = () => {
    setShowAddModal(false);
    setThemeSuggestions([]);
    setNewName("");
    setNewDescription("");
    setNewStocks("");
    setError(null);
  };

  // Delete theme
  const handleDeleteTheme = async (themeId: number, themeName: string) => {
    if (!confirm(`Delete theme "${themeName}"?`)) return;

    try {
      const res = await fetch(`/api/themes/${themeId}`, { method: "DELETE" });
      if (res.ok) {
        setThemesLite(prev => prev.filter((t) => t.id !== themeId));
        setThemePrices(prev => {
          const next = new Map(prev);
          next.delete(themeId);
          return next;
        });
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
        // Update lite list
        setThemesLite(prev => prev.map(t => 
          t.id === themeId ? { ...t, stocks: newStocksList } : t
        ));
        // Clear cached prices
        setThemePrices(prev => {
          const next = new Map(prev);
          next.delete(themeId);
          return next;
        });
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
      {!hideHero && (
        <PageHero
          title="Investment Themes"
          subtitle="Track thematic baskets and their performance"
          actions={[
            { label: "Add Theme", onClick: () => setShowAddModal(true), icon: <Plus className="w-4 h-4" />, variant: "primary" },
          ]}
        />
      )}


      {/* Theme Leaderboard */}
      <ThemeLeaderboard
        themes={themes}
        expandedTheme={expandedTheme}
        expandedData={expandedData}
        loadingExpanded={loadingExpanded}
        suggestions={suggestions}
        loadingSuggestions={loadingSuggestions}
        onToggleExpand={toggleExpand}
        onDeleteTheme={handleDeleteTheme}
        onEditStock={handleEditStock}
        onRemoveStock={handleRemoveStock}
        onAddSuggestedStock={handleAddSuggestedStock}
        onAddStock={handleAddSuggestedStock}
        onAddTheme={() => setShowAddModal(true)}
      />

      {/* Add Theme Modal */}
      {showAddModal && (
        <AddThemeModal
          newName={newName}
          newDescription={newDescription}
          newStocks={newStocks}
          themeSuggestions={themeSuggestions}
          loadingThemeSuggestions={loadingThemeSuggestions}
          submitting={submitting}
          error={error}
          onNameChange={setNewName}
          onDescriptionChange={setNewDescription}
          onStocksChange={setNewStocks}
          onUseSuggestions={handleUseThemeSuggestions}
          onToggleSuggestion={handleToggleSuggestion}
          onClose={handleCloseAddModal}
          onSubmit={handleAddTheme}
        />
      )}

      {/* Edit Stock Modal */}
      {editingStock && (
        <EditStockModal
          editingStock={editingStock}
          editSubmitting={editSubmitting}
          onClose={() => setEditingStock(null)}
          onChange={setEditingStock}
          onSubmit={handleSaveStockEdit}
        />
      )}
    </div>
  );
}
