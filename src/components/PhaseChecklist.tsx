"use client";

import { useState } from "react";

interface ChecklistItem {
  id: number;
  phase: string;
  item_order: number;
  title: string;
  description: string;
  is_template: number;
  completed: number | null;
  completed_at: string | null;
  notes: string | null;
  progress_id: number | null;
}

export function PhaseChecklist({
  items,
  projectId,
  phase,
}: {
  items: ChecklistItem[];
  projectId: number;
  phase: string;
}) {
  const [checklist, setChecklist] = useState(items);
  const [updating, setUpdating] = useState<number | null>(null);

  const completedCount = checklist.filter((i) => i.completed === 1).length;
  const total = checklist.length;
  const pct = total > 0 ? Math.round((completedCount / total) * 100) : 0;

  async function toggleItem(itemId: number, currentState: number | null) {
    setUpdating(itemId);
    try {
      const res = await fetch("/api/checklists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_progress",
          project_id: projectId,
          checklist_item_id: itemId,
          completed: currentState === 1 ? 0 : 1,
        }),
      });
      if (res.ok) {
        setChecklist((prev) =>
          prev.map((i) =>
            i.id === itemId
              ? { ...i, completed: currentState === 1 ? 0 : 1 }
              : i
          )
        );
      }
    } catch {
      // ignore
    }
    setUpdating(null);
  }

  if (checklist.length === 0) {
    return (
      <div className="text-sm text-gray-400 text-center py-4">
        No checklist for the <span className="font-medium">{phase}</span> phase
      </div>
    );
  }

  return (
    <div>
      {/* Progress bar */}
      <div className="flex items-center gap-3 mb-3">
        <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
          <div
            className="bg-emerald-500 h-full rounded-full transition-all duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="text-xs text-gray-500 shrink-0">
          {completedCount}/{total} ({pct}%)
        </span>
      </div>

      {/* Items */}
      <div className="space-y-1">
        {checklist.map((item) => (
          <button
            key={item.id}
            onClick={() => toggleItem(item.id, item.completed)}
            disabled={updating === item.id}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-md hover:bg-gray-50 transition-colors text-left group"
          >
            <span
              className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                item.completed === 1
                  ? "bg-emerald-500 border-emerald-500 text-white"
                  : "border-gray-300 group-hover:border-emerald-400"
              }`}
            >
              {item.completed === 1 && (
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              )}
            </span>
            <span
              className={`text-sm ${
                item.completed === 1 ? "text-gray-400 line-through" : "text-gray-700"
              }`}
            >
              {item.title}
            </span>
            {updating === item.id && (
              <span className="text-xs text-gray-300 ml-auto">...</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
