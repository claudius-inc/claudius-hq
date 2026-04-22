"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import useSWR from "swr";
import { Plus } from "lucide-react";
import { PageHero } from "@/components/PageHero";
import { ThemeWithPerformance, ThemePerformance } from "@/lib/types";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";
import {
  ThemeLeaderboard,
  AddThemeModal,
  EditStockModal,
  SuggestedStock,
  EditingStock,
  EditThemeModal,
  TagPerformanceTab,
  TagHeatmap,
} from "./themes";

// Lite theme from DB (no prices)
interface ThemeLite {
  id: number;
  name: string;
  description: string;
  tags: string[];
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
    initialThemes?.map(t => ({ id: t.id, name: t.name, description: t.description, tags: t.tags || [], created_at: t.created_at, stocks: t.stocks })) || 
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
  const [newTags, setNewTags] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Theme name suggestions
  const [themeSuggestions, setThemeSuggestions] = useState<string[]>([]);
  const [loadingThemeSuggestions, setLoadingThemeSuggestions] = useState(false);

  // Confirm dialog
  const { confirm, dialogProps } = useConfirmDialog();

  // Edit stock modal
  const [editingStock, setEditingStock] = useState<EditingStock | null>(null);
  const [editSubmitting, setEditSubmitting] = useState(false);

  // Edit theme modal
  const [editingTheme, setEditingTheme] = useState<{ id: number; name: string; description: string; tags: string[] } | null>(null);

  // Tab toggle: "static" | "dynamic"
  const [activeTab, setActiveTab] = useState<"static" | "dynamic">("static");

  // Stock tags mapping (ticker -> tags) for heatmap filtering
  const [stockTagsMap, setStockTagsMap] = useState<Record<string, string[]>>({});

  // Heatmap tag filter
  const [selectedTag, setSelectedTag] = useState<string | null>(null);

  // Fetch themes lite if not provided
  const fetchThemesLite = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/themes/lite");
      const data = await res.json();
      setThemesLite(data.themes || []);
      if (data.stock_tags) {
        setStockTagsMap(data.stock_tags);
      }
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

  // Filter themes by selected tag (heatmap)
  const filteredThemes = useMemo(() => {
    if (!selectedTag) return themes;
    return themes.filter((theme) =>
      theme.stocks.some((ticker) => stockTagsMap[ticker]?.includes(selectedTag))
    );
  }, [themes, selectedTag, stockTagsMap]);

  // Sort filtered themes by 1M performance
  filteredThemes.sort((a, b) => {
    const aHasPrice = a.performance_1m !== null;
    const bHasPrice = b.performance_1m !== null;
    if (aHasPrice && !bHasPrice) return -1;
    if (!aHasPrice && bHasPrice) return 1;
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

  // Add stock (suggested or manual) — optimistic, no full refresh
  const handleAddSuggestedStock = async (themeId: number, ticker: string) => {
    // Check if already in theme
    const theme = themesLite.find(t => t.id === themeId);
    if (theme?.stocks.includes(ticker.toUpperCase())) {
      alert(`${ticker.toUpperCase()} is already in this theme`);
      return;
    }
    // Also check expanded data if available
    if (expandedData?.id === themeId && expandedData.stocks?.includes(ticker.toUpperCase())) {
      alert(`${ticker.toUpperCase()} is already in this theme`);
      return;
    }

    const isSuggestion = suggestions.some(s => s.ticker === ticker);
    if (isSuggestion) {
      setSuggestions(prev => prev.map(s => 
        s.ticker === ticker ? { ...s, adding: true } : s
      ));
    }

    try {
      const res = await fetch(`/api/themes/${themeId}/stocks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker }),
      });

      if (res.ok) {
        // Optimistically add to all state layers — no clearing
        const newStockPerf: ThemePerformance = {
          ticker,
          name: null,
          performance_1w: null,
          performance_1m: null,
          performance_3m: null,
          current_price: null,
          target_price: null,
          status: "watching",
          notes: null,
          price_gap_percent: null,
        };

        if (isSuggestion) {
          setSuggestions(prev => prev.filter(s => s.ticker !== ticker));
        }

        // Update expanded row
        if (expandedData && expandedData.id === themeId) {
          setExpandedData({
            ...expandedData,
            stocks: [...expandedData.stocks, ticker],
            stock_performances: [
              ...(expandedData.stock_performances || []),
              newStockPerf,
            ],
          });
        }

        // Update lite list
        setThemesLite(prev => prev.map(t => 
          t.id === themeId ? { ...t, stocks: [...t.stocks, ticker] } : t
        ));

        // Fetch just this ticker's price and patch it in
        fetch(`/api/themes/prices?tickers=${ticker}`)
          .then(r => r.json())
          .then(data => {
            const price = data?.prices?.[ticker];
            if (!price) return;
            const updatedPerf: ThemePerformance = {
              ...newStockPerf,
              name: price.name ?? null,
              performance_1w: price.performance_1w,
              performance_1m: price.performance_1m,
              performance_3m: price.performance_3m,
              current_price: price.current_price,
              crowdingScore: price.crowdingScore,
              crowdingLevel: price.crowdingLevel,
            };
            setExpandedData(prev => {
              if (!prev || prev.id !== themeId) return prev;
              return {
                ...prev,
                stock_performances: (prev.stock_performances || []).map(s =>
                  s.ticker === ticker ? updatedPerf : s
                ),
              };
            });
            // Update themePrices so basket perf recalculates
            setThemePrices(prev => {
              const next = new Map(prev);
              const existing = next.get(themeId);
              if (existing) {
                const newPrices = { ...existing.prices, [ticker]: price };
                next.set(themeId, { ...existing, prices: newPrices });
              }
              return next;
            });
          })
          .catch(() => {});
      } else {
        if (isSuggestion) {
          setSuggestions(prev => prev.map(s => 
            s.ticker === ticker ? { ...s, adding: false } : s
          ));
        }
      }
    } catch {
      if (isSuggestion) {
        setSuggestions(prev => prev.map(s => 
          s.ticker === ticker ? { ...s, adding: false } : s
        ));
      }
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
          tags: newTags,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to create theme");
        return;
      }

      const themeId = data.theme.id;

      // Deduplicate tickers
      const stockList = newStocks
        .split(/[,\s]+/)
        .map((s) => s.trim().toUpperCase())
        .filter((s) => s.length > 0);
      const uniqueStocks = Array.from(new Set(stockList));
      if (uniqueStocks.length < stockList.length) {
        setError("Duplicate tickers detected: " + stockList.filter((t, i, a) => a.indexOf(t) !== i).join(", "));
        return;
      }

      for (const ticker of uniqueStocks) {
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
    setNewTags([]);
    setError(null);
  };

  // Delete theme
  const handleDeleteTheme = async (themeId: number, themeName: string) => {
    const ok = await confirm(`Delete "${themeName}"?`, "This will remove the theme and all its stocks. This cannot be undone.", { variant: "danger", confirmLabel: "Delete" });
    if (!ok) return;

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

  // Remove stock — optimistic splice, no full refresh
  const handleRemoveStock = async (themeId: number, ticker: string) => {
    const ok = await confirm(`Remove ${ticker}?`, `Remove ${ticker} from this theme.`, { variant: "danger", confirmLabel: "Remove" });
    if (!ok) return;

    try {
      const res = await fetch(`/api/themes/${themeId}/stocks/${ticker}`, {
        method: "DELETE",
      });
      if (res.ok) {
        // Optimistically remove from expanded row
        if (expandedData && expandedData.id === themeId) {
          setExpandedData({
            ...expandedData,
            stocks: expandedData.stocks.filter(t => t !== ticker),
            stock_performances: (expandedData.stock_performances || []).filter(p => p.ticker !== ticker),
          });
        }
        // Update lite list
        setThemesLite(prev => prev.map(t => 
          t.id === themeId ? { ...t, stocks: t.stocks.filter(s => s !== ticker) } : t
        ));
        // Remove from themePrices basket
        setThemePrices(prev => {
          const next = new Map(prev);
          const existing = next.get(themeId);
          if (existing) {
            const newPrices = { ...existing.prices };
            delete newPrices[ticker];
            next.set(themeId, { ...existing, prices: newPrices });
          }
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
      new_ticker: stock.ticker,
      target_price: stock.target_price,
      status: stock.status || "watching",
      notes: stock.notes,
    });
  };

  // Save stock edit
  const handleSaveStockEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStock) return;

    const isRename = editingStock.new_ticker !== editingStock.ticker;

    setEditSubmitting(true);
    try {
      const res = await fetch(`/api/themes/${editingStock.themeId}/stocks`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticker: editingStock.ticker,
          new_ticker: isRename ? editingStock.new_ticker : undefined,
          target_price: editingStock.target_price,
          status: editingStock.status,
          notes: editingStock.notes,
        }),
      });

      if (res.ok) {
        const oldTicker = editingStock.ticker;
        // Patch in-place instead of full refreshh
        setExpandedData(prev => {
          if (!prev || prev.id !== editingStock.themeId) return prev;
          return {
            ...prev,
            stocks: isRename
              ? prev.stocks.map(t => t === oldTicker ? editingStock.new_ticker : t)
              : prev.stocks,
            stock_performances: (prev.stock_performances || []).map(s =>
              s.ticker === oldTicker
                ? { ...s, ticker: editingStock.new_ticker, target_price: editingStock.target_price, status: editingStock.status, notes: editingStock.notes }
                : s
            ),
          };
        });
        // Update lite list
        if (isRename) {
          setThemesLite(prev => prev.map(t =>
            t.id === editingStock.themeId
              ? { ...t, stocks: t.stocks.map(s => s === oldTicker ? editingStock.new_ticker : s) }
              : t
          ));
        }
        setEditingStock(null);
      } else {
        const err = await res.text();
        console.error("[EditStock] failed", res.status, err);
        alert(`Failed to update stock: ${err}`);
      }
    } catch (e) {
      console.error("[EditStock] network error:", e);
    } finally {
      setEditSubmitting(false);
    }
  };

  const handleSaveThemeEdit = async (themeId: number, name: string, description: string, tags: string[]) => {
    console.log("[EditTheme] saving", { themeId, name, description, tags });
    const res = await fetch(`/api/themes/${themeId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, description, tags }),
    });
    if (!res.ok) {
      const err = await res.text();
      console.error("[EditTheme] failed", res.status, err);
      throw new Error(err);
    }

    setThemesLite(prev => prev.map(t =>
      t.id === themeId ? { ...t, name, description, tags } : t
    ));
    if (expandedData && expandedData.id === themeId) {
      setExpandedData({ ...expandedData, name, description, tags });
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


      {/* Tab toggle */}
      <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5 w-fit">
        <button
          onClick={() => setActiveTab("static")}
          className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors touch-manipulation ${
            activeTab === "static"
              ? "bg-white text-gray-900 shadow-sm"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          Static Themes
        </button>
        <button
          onClick={() => setActiveTab("dynamic")}
          className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors touch-manipulation ${
            activeTab === "dynamic"
              ? "bg-white text-gray-900 shadow-sm"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          Trending Tags
        </button>
      </div>

      {/* Tab content */}
      {activeTab === "dynamic" ? (
        <TagPerformanceTab />
      ) : (
        <>
      {/* Tag Heatmap (static themes only) */}
      <TagHeatmap selectedTag={selectedTag} onTagSelect={setSelectedTag} />
      {selectedTag && (
        <p className="text-xs text-gray-500">
          Showing {filteredThemes.length} theme{filteredThemes.length !== 1 ? "s" : ""} containing stocks tagged <span className="font-semibold text-emerald-600">{selectedTag}</span>
        </p>
      )}

      {/* Theme Leaderboard */}
      <ThemeLeaderboard
        themes={filteredThemes}
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
        onEditTheme={(themeId, name, description) => {
          const theme = themesLite.find(t => t.id === themeId);
          console.log("[EditTheme] clicked", { themeId, name, description, theme, tags: theme?.tags });
          setEditingTheme({ id: themeId, name, description, tags: theme?.tags || [] });
        }}
      />

      {/* Add Theme Modal */}
      {showAddModal && (
        <AddThemeModal
          newName={newName}
          newDescription={newDescription}
          newStocks={newStocks}
          newTags={newTags}
          themeSuggestions={themeSuggestions}
          loadingThemeSuggestions={loadingThemeSuggestions}
          submitting={submitting}
          error={error}
          onNameChange={setNewName}
          onDescriptionChange={setNewDescription}
          onStocksChange={setNewStocks}
          onTagsChange={setNewTags}
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

      {/* Edit Theme Modal */}
      {editingTheme && (
        <EditThemeModal
          open={!!editingTheme}
          themeId={editingTheme.id}
          initialName={editingTheme.name}
          initialDescription={editingTheme.description}
          initialTags={editingTheme.tags}
          onClose={() => setEditingTheme(null)}
          onSave={handleSaveThemeEdit}
        />
      )}

      <ConfirmDialog {...dialogProps} />
        </>
      )}
    </div>
  );
}
