"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { EmptyState } from "@/components/EmptyState";
import { Plus, Eye } from "lucide-react";
import { PageHero } from "@/components/PageHero";
import { WatchlistItem, WatchlistStatus } from "@/lib/types";
import { useResearchStatus } from "@/hooks/useResearchStatus";
import { WatchlistAddForm, WatchlistRow } from "./watchlist";

interface WatchlistTabProps {
  initialItems: WatchlistItem[];
  onPromoteToPortfolio: (item: WatchlistItem) => void;
}

export function WatchlistTab({ initialItems, onPromoteToPortfolio }: WatchlistTabProps) {
  const [items, setItems] = useState<WatchlistItem[]>(initialItems);
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [loadingPrices, setLoadingPrices] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);

  const watchlistTickers = useMemo(() => items.map((i) => i.ticker), [items]);
  const { statuses: researchStatuses, refetch: refetchResearch } = useResearchStatus(watchlistTickers);

  const fetchPrices = useCallback(async () => {
    if (items.length === 0) return;
    setLoadingPrices(true);
    try {
      const tickers = items.map((i) => i.ticker).join(",");
      const res = await fetch(`/api/markets/prices?tickers=${tickers}`);
      const data = await res.json();
      if (data.prices) setPrices(data.prices);
    } catch {
      // Ignore
    } finally {
      setLoadingPrices(false);
    }
  }, [items]);

  useEffect(() => {
    fetchPrices();
  }, [fetchPrices]);

  const handleAdd = async (data: { ticker: string; targetPrice: number | null; notes: string | null }): Promise<boolean> => {
    try {
      const res = await fetch("/api/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticker: data.ticker,
          target_price: data.targetPrice,
          notes: data.notes,
        }),
      });
      const result = await res.json();
      if (!res.ok) return false;
      setItems([result.item, ...items]);
      setShowAddForm(false);
      return true;
    } catch {
      return false;
    }
  };

  const handleEdit = async (id: number, data: { targetPrice: number | null; notes: string | null; status: WatchlistStatus }) => {
    try {
      const res = await fetch(`/api/watchlist/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target_price: data.targetPrice,
          notes: data.notes,
          status: data.status,
        }),
      });
      const result = await res.json();
      if (res.ok) {
        setItems(items.map((i) => (i.id === id ? result.item : i)));
      }
    } catch {
      // Ignore
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Remove from watchlist?")) return;
    try {
      const res = await fetch(`/api/watchlist/${id}`, { method: "DELETE" });
      if (res.ok) setItems(items.filter((i) => i.id !== id));
    } catch {
      // Ignore
    }
  };

  return (
    <div className="space-y-6">
      <PageHero
        title="Watchlist"
        actions={[
          {
            label: "Add to Watchlist",
            onClick: () => setShowAddForm(!showAddForm),
            icon: <Plus className="w-4 h-4" />,
            variant: "primary",
          },
        ]}
      />

      {showAddForm && (
        <WatchlistAddForm onAdd={handleAdd} onCancel={() => setShowAddForm(false)} />
      )}

      {items.length > 0 ? (
        <div className="card overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ticker</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Research</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Price</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Target</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Gap</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Notes</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {items.map((item) => (
                <WatchlistRow
                  key={item.id}
                  item={item}
                  price={prices[item.ticker]}
                  loadingPrice={loadingPrices}
                  researchStatus={researchStatuses[item.ticker.toUpperCase()] ?? null}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                  onPromote={onPromoteToPortfolio}
                  onResearchTriggered={refetchResearch}
                />
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState
          icon={<Eye className="w-8 h-8" />}
          title="Watchlist is empty"
          description="Add stocks you're monitoring before buying"
        />
      )}
    </div>
  );
}
