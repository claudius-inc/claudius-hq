"use client";

import { useState, useEffect, useCallback } from "react";
import { X, Plus, Save, Trash2 } from "lucide-react";
import { PortfolioHolding } from "@/lib/types";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";

interface JournalEntry {
  id: number;
  asset: string;
  decision: string | null;
  data: string;
  holding_id: number | null;
  created_at: string | null;
  updated_at: string | null;
}

interface HoldingJournalModalProps {
  holding: PortfolioHolding;
  onClose: () => void;
  onEntriesChange?: () => void;
}

const DECISION_COLORS: Record<string, string> = {
  buy: "bg-emerald-100 text-emerald-800",
  sell: "bg-red-100 text-red-800",
  hold: "bg-amber-100 text-amber-800",
  wait: "bg-gray-100 text-gray-600",
};

const DECISION_OPTIONS = [
  { value: "", label: "No decision" },
  { value: "buy", label: "🟢 BUY" },
  { value: "sell", label: "🔴 SELL" },
  { value: "hold", label: "🟡 HOLD" },
  { value: "wait", label: "⚪ WAIT" },
];

export function HoldingJournalModal({ holding, onClose, onEntriesChange }: HoldingJournalModalProps) {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const { confirm, dialogProps } = useConfirmDialog();
  
  // Form state
  const [thesis, setThesis] = useState("");
  const [catalysts, setCatalysts] = useState("");
  const [risks, setRisks] = useState("");
  const [decision, setDecision] = useState("");
  const [notes, setNotes] = useState("");

  const fetchEntries = useCallback(async () => {
    try {
      const res = await fetch(`/api/clarity-journal?holdingId=${holding.id}`);
      const data = await res.json();
      setEntries(data.entries || []);
    } catch (e) {
      console.error("Failed to fetch journal entries:", e);
    } finally {
      setLoading(false);
    }
  }, [holding.id]);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  const handleSave = async () => {
    if (!thesis.trim() && !notes.trim()) return;
    
    setSaving(true);
    try {
      const res = await fetch("/api/clarity-journal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          asset: holding.ticker,
          decision: decision || null,
          holdingId: holding.id,
          data: {
            thesis,
            catalysts,
            risks,
            notes,
            priceAtEntry: "", // Could fetch current price
          },
        }),
      });
      
      const data = await res.json();
      if (data.entry) {
        setEntries([data.entry, ...entries]);
        // Reset form
        setThesis("");
        setCatalysts("");
        setRisks("");
        setDecision("");
        setNotes("");
        setShowForm(false);
        onEntriesChange?.();
      }
    } catch (e) {
      console.error("Failed to save:", e);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    const ok = await confirm("Delete journal entry?", "This action cannot be undone.", { variant: "danger", confirmLabel: "Delete" });
    if (!ok) return;
    
    try {
      await fetch(`/api/clarity-journal?id=${id}`, { method: "DELETE" });
      setEntries(entries.filter((e) => e.id !== id));
      onEntriesChange?.();
    } catch (e) {
      console.error("Failed to delete:", e);
    }
  };

  const parseEntryData = (dataStr: string) => {
    try {
      return JSON.parse(dataStr || "{}");
    } catch {
      return {};
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      
      {/* Modal */}
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden m-4">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              📝 Journal — {holding.ticker}
            </h2>
            <p className="text-sm text-gray-500">Investment thesis & reasoning</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto max-h-[calc(85vh-140px)]">
          {/* Add New Entry Button / Form */}
          {!showForm ? (
            <button
              onClick={() => setShowForm(true)}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 mb-4 border-2 border-dashed border-gray-300 rounded-lg text-gray-500 hover:border-emerald-400 hover:text-emerald-600 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add Journal Entry
            </button>
          ) : (
            <div className="mb-4 p-4 bg-gray-50 rounded-lg border border-gray-200 space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Thesis / Reasoning *
                </label>
                <textarea
                  value={thesis}
                  onChange={(e) => setThesis(e.target.value)}
                  placeholder="Why are you holding/buying this? What's the investment thesis?"
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Catalysts
                  </label>
                  <textarea
                    value={catalysts}
                    onChange={(e) => setCatalysts(e.target.value)}
                    placeholder="What could drive price up?"
                    rows={2}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Risks
                  </label>
                  <textarea
                    value={risks}
                    onChange={(e) => setRisks(e.target.value)}
                    placeholder="What could go wrong?"
                    rows={2}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Decision
                  </label>
                  <select
                    value={decision}
                    onChange={(e) => setDecision(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    {DECISION_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Additional Notes
                  </label>
                  <input
                    type="text"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Any other notes..."
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  onClick={() => setShowForm(false)}
                  className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-200 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving || (!thesis.trim() && !notes.trim())}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />
                  {saving ? "Saving..." : "Save Entry"}
                </button>
              </div>
            </div>
          )}

          {/* Entries List */}
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="h-6 w-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : entries.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <p>No journal entries yet.</p>
              <p className="text-sm mt-1">Add your first entry to track your thesis.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {entries.map((entry) => {
                const data = parseEntryData(entry.data);
                return (
                  <div
                    key={entry.id}
                    className="p-4 bg-white border border-gray-200 rounded-lg hover:shadow-sm transition-shadow"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-xs text-gray-400">
                            {entry.updated_at
                              ? new Date(entry.updated_at).toLocaleDateString("en-US", {
                                  month: "short",
                                  day: "numeric",
                                  year: "numeric",
                                })
                              : "Unknown date"}
                          </span>
                          {entry.decision && (
                            <span
                              className={`px-1.5 py-0.5 text-xs font-medium rounded ${
                                DECISION_COLORS[entry.decision] || "bg-gray-100 text-gray-600"
                              }`}
                            >
                              {entry.decision.toUpperCase()}
                            </span>
                          )}
                        </div>
                        
                        {/* Thesis */}
                        {data.thesis && (
                          <p className="text-sm text-gray-900 mb-2">{data.thesis}</p>
                        )}
                        
                        {/* Catalysts & Risks */}
                        <div className="flex flex-wrap gap-4 text-xs">
                          {data.catalysts && (
                            <div>
                              <span className="font-medium text-emerald-600">Catalysts:</span>{" "}
                              <span className="text-gray-600">{data.catalysts}</span>
                            </div>
                          )}
                          {data.risks && (
                            <div>
                              <span className="font-medium text-red-600">Risks:</span>{" "}
                              <span className="text-gray-600">{data.risks}</span>
                            </div>
                          )}
                        </div>
                        
                        {/* Notes */}
                        {data.notes && (
                          <p className="text-xs text-gray-500 mt-2 italic">{data.notes}</p>
                        )}
                      </div>
                      
                      <button
                        onClick={() => handleDelete(entry.id)}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg flex-shrink-0"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
      <ConfirmDialog {...dialogProps} />
    </div>
  );
}
