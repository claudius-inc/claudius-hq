"use client";

import { useState, useEffect, useCallback } from "react";
import { Sparkles, Network, Layers, Trash2, RefreshCw, ChevronDown, ChevronUp } from "lucide-react";

interface Insight {
  id: number;
  insightType: string | null;
  title: string | null;
  content: string;
  entryIds: string | null;
  generatedAt: string | null;
}

const INSIGHT_TYPES = [
  {
    type: "patterns",
    label: "Patterns",
    description: "Recurring themes across your entries",
    icon: Sparkles,
  },
  {
    type: "connections",
    label: "Connections",
    description: "Hidden links between unrelated entries",
    icon: Network,
  },
  {
    type: "distillation",
    label: "Distillation",
    description: "Personal frameworks from your collection",
    icon: Layers,
  },
] as const;

export function InsightsPanel() {
  const [insights, setInsights] = useState<Insight[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [expandedInsights, setExpandedInsights] = useState<Set<number>>(new Set());

  const fetchInsights = useCallback(async () => {
    try {
      const res = await fetch("/api/memoria/insights");
      const data = await res.json();
      setInsights(data.insights || []);
    } catch {
      setInsights([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInsights();
  }, [fetchInsights]);

  const handleGenerate = async (type: string) => {
    setGenerating(type);
    try {
      const res = await fetch("/api/memoria/insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type }),
      });
      if (!res.ok) {
        const err = await res.json();
        alert(err.error || "Failed to generate");
        return;
      }
      fetchInsights();
    } finally {
      setGenerating(null);
    }
  };

  const handleDelete = async (id: number) => {
    await fetch(`/api/memoria/insights/${id}`, { method: "DELETE" });
    setInsights((prev) => prev.filter((i) => i.id !== id));
  };

  const toggleInsight = (id: number) => {
    setExpandedInsights((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const groupedInsights = INSIGHT_TYPES.map((t) => ({
    ...t,
    items: insights.filter((i) => i.insightType === t.type),
  }));

  const totalInsights = insights.length;

  return (
    <div className="bg-white rounded-xl border border-gray-200">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 rounded-xl transition-colors"
      >
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-purple-500" />
          <span className="text-sm font-semibold text-gray-900">Insights</span>
          {totalInsights > 0 && (
            <span className="text-[10px] bg-purple-100 text-purple-600 px-1.5 py-0.5 rounded-full">
              {totalInsights}
            </span>
          )}
        </div>
        {expanded ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-4">
          {/* Generate buttons */}
          <div className="flex gap-2 flex-wrap">
            {INSIGHT_TYPES.map((t) => {
              const Icon = t.icon;
              const isGenerating = generating === t.type;
              return (
                <button
                  key={t.type}
                  onClick={() => handleGenerate(t.type)}
                  disabled={generating !== null}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
                  title={t.description}
                >
                  {isGenerating ? (
                    <RefreshCw size={12} className="animate-spin text-purple-500" />
                  ) : (
                    <Icon size={12} className="text-purple-500" />
                  )}
                  {isGenerating ? "Analyzing..." : t.label}
                </button>
              );
            })}
          </div>

          {/* Results */}
          {loading ? (
            <div className="text-xs text-gray-400 py-4 text-center">Loading...</div>
          ) : totalInsights === 0 ? (
            <div className="text-xs text-gray-400 py-4 text-center">
              No insights yet. Click a button above to analyze your entries.
            </div>
          ) : (
            <div className="space-y-3">
              {groupedInsights
                .filter((g) => g.items.length > 0)
                .map((group) => {
                  const Icon = group.icon;
                  return (
                    <div key={group.type} className="space-y-2">
                      <div className="flex items-center gap-1.5 text-xs text-gray-500">
                        <Icon size={12} />
                        <span className="font-medium uppercase tracking-wide">{group.label}</span>
                      </div>
                      {group.items.map((insight) => {
                        const isOpen = expandedInsights.has(insight.id);
                        return (
                          <div
                            key={insight.id}
                            className="border border-gray-100 rounded-lg overflow-hidden"
                          >
                            <button
                              onClick={() => toggleInsight(insight.id)}
                              className="w-full flex items-center justify-between px-3 py-2 hover:bg-gray-50 text-left"
                            >
                              <span className="text-sm font-medium text-gray-800 truncate pr-2">
                                {insight.title || "Untitled"}
                              </span>
                              <div className="flex items-center gap-1 shrink-0">
                                <span className="text-[10px] text-gray-300">
                                  {insight.generatedAt?.split(" ")[0]}
                                </span>
                                {isOpen ? (
                                  <ChevronUp size={12} className="text-gray-400" />
                                ) : (
                                  <ChevronDown size={12} className="text-gray-400" />
                                )}
                              </div>
                            </button>
                            {isOpen && (
                              <div className="px-3 pb-3 space-y-2">
                                <div className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                                  {insight.content}
                                </div>
                                {insight.entryIds && (
                                  <div className="text-[10px] text-gray-400">
                                    Based on entries:{" "}
                                    {JSON.parse(insight.entryIds)
                                      .map((id: number) => `#${id}`)
                                      .join(", ")}
                                  </div>
                                )}
                                <button
                                  onClick={() => handleDelete(insight.id)}
                                  className="flex items-center gap-1 text-[10px] text-red-400 hover:text-red-600"
                                >
                                  <Trash2 size={10} />
                                  Remove
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
