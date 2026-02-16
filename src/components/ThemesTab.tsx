"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus } from "lucide-react";
import { ThemeWithPerformance, ThemePerformance } from "@/lib/types";
import {
  ThemeLeaderboard,
  AddThemeModal,
  EditStockModal,
  SuggestedStock,
  EditingStock,
} from "./themes";

interface ThemesTabProps {
  initialThemes?: ThemeWithPerformance[];
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
      const res = await fetch(`/api/themes/${themeId}/markets`, {
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
        await fetch(`/api/themes/${themeId}/markets`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ticker }),
        });
      }

      await fetchThemes();
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
      const res = await fetch(`/api/themes/${themeId}/markets/${ticker}`, {
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
      const res = await fetch(`/api/themes/${editingStock.themeId}/markets`, {
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
