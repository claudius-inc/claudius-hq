"use client";

import { useState, useEffect, useCallback } from "react";
import { RefreshCw, Plus, User } from "lucide-react";
import {
  type Analyst,
  type AnalystCall,
  AnalystCard,
  AnalystFilters,
  AnalystTable,
  AddCallModal,
  AddAnalystModal,
} from "@/components/analysts";

export function AnalystsPageContent() {
  const [analysts, setAnalysts] = useState<Analyst[]>([]);
  const [calls, setCalls] = useState<AnalystCall[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedAnalyst, setExpandedAnalyst] = useState<number | null>(null);
  const [showAddCallModal, setShowAddCallModal] = useState(false);
  const [showAddAnalystModal, setShowAddAnalystModal] = useState(false);
  const [editingCall, setEditingCall] = useState<AnalystCall | null>(null);

  // Filters
  const [filterAnalyst, setFilterAnalyst] = useState<string>("");
  const [filterTicker, setFilterTicker] = useState<string>("");
  const [filterAction, setFilterAction] = useState<string>("");

  const fetchData = useCallback(async () => {
    try {
      const [analystsRes, callsRes] = await Promise.all([
        fetch("/api/analysts"),
        fetch("/api/analysts/calls"),
      ]);
      const analystsData = await analystsRes.json();
      const callsData = await callsRes.json();
      setAnalysts(analystsData.analysts || []);
      setCalls(callsData.calls || []);
    } catch (err) {
      console.error("Failed to fetch data:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleDeleteCall = async (id: number) => {
    if (!confirm("Delete this call?")) return;
    try {
      await fetch(`/api/analysts/calls/${id}`, { method: "DELETE" });
      await fetchData();
    } catch (err) {
      console.error("Failed to delete call:", err);
    }
  };

  const handleDeleteAnalyst = async (id: number) => {
    if (!confirm("Delete this analyst and all their calls?")) return;
    try {
      await fetch(`/api/analysts/${id}`, { method: "DELETE" });
      await fetchData();
    } catch (err) {
      console.error("Failed to delete analyst:", err);
    }
  };

  // Filter calls
  const filteredCalls = calls.filter((call) => {
    if (filterAnalyst && call.analystId !== parseInt(filterAnalyst))
      return false;
    if (
      filterTicker &&
      !call.ticker.toLowerCase().includes(filterTicker.toLowerCase())
    )
      return false;
    if (filterAction && call.action !== filterAction) return false;
    return true;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <RefreshCw className="w-5 h-5 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="space-y-8 min-w-0">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-gray-900">
            Analysts Tracker
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Track top-ranked analysts and their stock calls
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            onClick={() => setShowAddAnalystModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors"
          >
            <User className="w-4 h-4" />
            Add Analyst
          </button>
          <button
            onClick={() => setShowAddCallModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Log Call
          </button>
        </div>
      </div>

      {/* Analyst Cards */}
      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Tracked Analysts
        </h2>
        {analysts.length === 0 ? (
          <div className="bg-white rounded-lg border p-8 text-center">
            <User className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 mb-4">No analysts tracked yet.</p>
            <button
              onClick={() => setShowAddAnalystModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700"
            >
              <Plus className="w-4 h-4" />
              Add Your First Analyst
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {analysts.map((analyst) => (
              <AnalystCard
                key={analyst.id}
                analyst={analyst}
                isExpanded={expandedAnalyst === analyst.id}
                onToggle={() =>
                  setExpandedAnalyst(
                    expandedAnalyst === analyst.id ? null : analyst.id
                  )
                }
                onDelete={handleDeleteAnalyst}
              />
            ))}
          </div>
        )}
      </section>

      {/* Recent Calls Table */}
      <section>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <h2 className="text-lg font-semibold text-gray-900 shrink-0">Recent Calls</h2>
          <AnalystFilters
            analysts={analysts}
            filterAnalyst={filterAnalyst}
            filterTicker={filterTicker}
            filterAction={filterAction}
            onFilterAnalystChange={setFilterAnalyst}
            onFilterTickerChange={setFilterTicker}
            onFilterActionChange={setFilterAction}
          />
        </div>
        <AnalystTable
          calls={filteredCalls}
          onEdit={setEditingCall}
          onDelete={handleDeleteCall}
        />
      </section>

      {/* Modals */}
      {(showAddCallModal || editingCall) && (
        <AddCallModal
          call={editingCall}
          analysts={analysts}
          onClose={() => {
            setShowAddCallModal(false);
            setEditingCall(null);
          }}
          onSave={async () => {
            await fetchData();
            setShowAddCallModal(false);
            setEditingCall(null);
          }}
        />
      )}

      {showAddAnalystModal && (
        <AddAnalystModal
          onClose={() => setShowAddAnalystModal(false)}
          onSave={async () => {
            await fetchData();
            setShowAddAnalystModal(false);
          }}
        />
      )}
    </div>
  );
}
