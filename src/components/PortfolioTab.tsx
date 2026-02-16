"use client";

import { useState, useEffect, useCallback } from "react";
import { PortfolioHolding, PortfolioReport } from "@/lib/types";
import { ConfirmDialog } from "./ConfirmDialog";
import {
  AddHoldingForm,
  AnalysisReport,
  PortfolioSummary,
  PortfolioTable,
} from "./portfolio";

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
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: number; ticker: string } | null>(null);

  // Fetch prices for all tickers
  const fetchPrices = useCallback(async () => {
    if (holdings.length === 0) return;

    setLoadingPrices(true);
    try {
      const tickers = holdings.map((h) => h.ticker).join(",");
      const res = await fetch(`/api/markets/prices?tickers=${tickers}`);
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

  const handleAddHolding = (holding: PortfolioHolding) => {
    setHoldings(
      [...holdings, holding].sort((a, b) => b.target_allocation - a.target_allocation)
    );
    setShowAddForm(false);
  };

  const handleUpdateHolding = (updatedHolding: PortfolioHolding) => {
    setHoldings(
      holdings
        .map((h) => (h.id === updatedHolding.id ? updatedHolding : h))
        .sort((a, b) => b.target_allocation - a.target_allocation)
    );
  };

  const handleDeleteHolding = (id: number, ticker: string) => {
    setDeleteConfirm({ id, ticker });
  };

  const confirmDelete = async () => {
    if (!deleteConfirm) return;
    
    try {
      const res = await fetch(`/api/portfolio/holdings/${deleteConfirm.id}`, { method: "DELETE" });
      if (res.ok) {
        setHoldings(holdings.filter((h) => h.id !== deleteConfirm.id));
      }
    } catch {
      // Ignore
    } finally {
      setDeleteConfirm(null);
    }
  };

  const latestReport = reports[0];

  return (
    <div className="space-y-8">
      <PortfolioSummary
        holdings={holdings}
        showAddForm={showAddForm}
        onToggleAddForm={() => setShowAddForm(!showAddForm)}
      />

      {showAddForm && (
        <AddHoldingForm
          onAdd={handleAddHolding}
          onCancel={() => setShowAddForm(false)}
        />
      )}

      <PortfolioTable
        holdings={holdings}
        prices={prices}
        loadingPrices={loadingPrices}
        onUpdateHolding={handleUpdateHolding}
        onDeleteHolding={handleDeleteHolding}
      />

      {latestReport && (
        <AnalysisReport report={latestReport} holdings={holdings} />
      )}

      {reports.length > 1 && (
        <div className="text-sm text-gray-500">
          + {reports.length - 1} historical report{reports.length > 2 ? "s" : ""}
        </div>
      )}

      <ConfirmDialog
        open={!!deleteConfirm}
        title="Remove holding"
        description={`Are you sure you want to remove ${deleteConfirm?.ticker || ""} from your portfolio?`}
        confirmLabel="Remove"
        cancelLabel="Cancel"
        variant="destructive"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteConfirm(null)}
      />
    </div>
  );
}
