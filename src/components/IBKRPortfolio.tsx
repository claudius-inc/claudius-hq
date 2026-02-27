"use client";

import { useState, useEffect, useCallback } from "react";
import { RefreshCw, Upload } from "lucide-react";
import {
  Position,
  Summary,
  Trade,
  Import,
  IBKRImportModal,
  IBKRSummaryCard,
  IBKRPositionsTable,
  IBKRTradesTable,
  IBKRImportsTable,
} from "./ibkr";

type Section = "positions" | "trades" | "imports";

export default function IBKRPortfolio() {
  const [positions, setPositions] = useState<Position[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [baseCurrency, setBaseCurrency] = useState<string>("SGD");
  const [trades, setTrades] = useState<Trade[]>([]);
  const [imports, setImports] = useState<Import[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeSection, setActiveSection] = useState<Section>("positions");
  const [showImportModal, setShowImportModal] = useState(false);

  const fetchPositions = useCallback(async () => {
    try {
      const res = await fetch("/api/ibkr/positions");
      const data = await res.json();
      setPositions(data.positions || []);
      setSummary(data.summary || null);
      setBaseCurrency(data.baseCurrency || "SGD");
    } catch (err) {
      console.error("Failed to fetch positions:", err);
    }
  }, []);

  const fetchTrades = useCallback(async () => {
    try {
      const res = await fetch("/api/ibkr/trades?limit=100");
      const data = await res.json();
      setTrades(data.trades || []);
    } catch (err) {
      console.error("Failed to fetch trades:", err);
    }
  }, []);

  const fetchImports = useCallback(async () => {
    try {
      const res = await fetch("/api/ibkr/imports");
      const data = await res.json();
      setImports(data.imports || []);
    } catch (err) {
      console.error("Failed to fetch imports:", err);
    }
  }, []);

  const refreshAll = useCallback(async () => {
    await Promise.all([fetchPositions(), fetchTrades(), fetchImports()]);
  }, [fetchPositions, fetchTrades, fetchImports]);

  useEffect(() => {
    refreshAll().finally(() => setLoading(false));
  }, [refreshAll]);

  const handleDeleteImport = async (id: number) => {
    if (!confirm("Delete this import and all associated trades?")) return;

    try {
      await fetch("/api/ibkr/imports", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      await refreshAll();
    } catch (err) {
      console.error("Failed to delete import:", err);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <RefreshCw className="w-5 h-5 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Import Modal */}
      {showImportModal && (
        <IBKRImportModal
          onClose={() => setShowImportModal(false)}
          onSuccess={refreshAll}
        />
      )}

      {/* Summary Card */}
      {summary && positions.length > 0 && (
        <IBKRSummaryCard
          summary={summary}
          baseCurrency={baseCurrency}
          onImportClick={() => setShowImportModal(true)}
        />
      )}

      {/* Empty state header with import button */}
      {(!summary || positions.length === 0) && (
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">IBKR Portfolio</h2>
          <button
            onClick={() => setShowImportModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <Upload className="w-4 h-4" />
            Import Statement
          </button>
        </div>
      )}

      {/* Section Tabs */}
      <div className="flex gap-2 border-b">
        {(["positions", "trades", "imports"] as const).map((section) => (
          <button
            key={section}
            onClick={() => setActiveSection(section)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeSection === section
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {section.charAt(0).toUpperCase() + section.slice(1)}
            {section === "positions" && positions.length > 0 && (
              <span className="ml-2 text-xs bg-gray-100 px-2 py-0.5 rounded-full">
                {positions.length}
              </span>
            )}
            {section === "trades" && trades.length > 0 && (
              <span className="ml-2 text-xs bg-gray-100 px-2 py-0.5 rounded-full">
                {trades.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Section Content */}
      {activeSection === "positions" && (
        <IBKRPositionsTable
          positions={positions}
          baseCurrency={baseCurrency}
          onImportClick={() => setShowImportModal(true)}
        />
      )}

      {activeSection === "trades" && <IBKRTradesTable trades={trades} />}

      {activeSection === "imports" && (
        <IBKRImportsTable imports={imports} onDelete={handleDeleteImport} />
      )}
    </div>
  );
}
