"use client";

import { Idea, IdeaStatus } from "@/lib/types";
import { useState } from "react";
import { PromoteButton } from "@/components/PromoteButton";

const statusColumns: { key: IdeaStatus; label: string; color: string }[] = [
  { key: "new", label: "New", color: "bg-blue-100 text-blue-700" },
  { key: "researching", label: "Researching", color: "bg-amber-100 text-amber-700" },
  { key: "validated", label: "Validated", color: "bg-emerald-100 text-emerald-700" },
  { key: "promoted", label: "Promoted", color: "bg-purple-100 text-purple-700" },
  { key: "rejected", label: "Rejected", color: "bg-gray-200 text-gray-500" },
];

const potentialColors: Record<string, string> = {
  low: "bg-gray-100 text-gray-600",
  medium: "bg-blue-50 text-blue-600",
  high: "bg-emerald-50 text-emerald-600",
  moonshot: "bg-purple-50 text-purple-600",
  unknown: "bg-gray-50 text-gray-400",
};

const effortColors: Record<string, string> = {
  tiny: "bg-green-50 text-green-600",
  small: "bg-green-50 text-green-600",
  medium: "bg-yellow-50 text-yellow-600",
  large: "bg-orange-50 text-orange-600",
  huge: "bg-red-50 text-red-600",
  unknown: "bg-gray-50 text-gray-400",
};

type ViewMode = "kanban" | "list";

export function IdeasPipeline({ ideas }: { ideas: Idea[] }) {
  const [view, setView] = useState<ViewMode>("kanban");
  const [filter, setFilter] = useState<IdeaStatus | "all">("all");

  const filtered = filter === "all" ? ideas : ideas.filter((i) => i.status === filter);

  if (ideas.length === 0) {
    return (
      <div className="card text-center py-12 text-gray-400">
        No ideas yet. Add them via the API to start building your pipeline.
      </div>
    );
  }

  return (
    <div>
      {/* Controls */}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex bg-gray-100 rounded-md p-0.5">
          <button
            onClick={() => setView("kanban")}
            className={`px-3 py-1 text-sm rounded ${view === "kanban" ? "bg-white shadow-sm text-gray-900" : "text-gray-500"}`}
          >
            Board
          </button>
          <button
            onClick={() => setView("list")}
            className={`px-3 py-1 text-sm rounded ${view === "list" ? "bg-white shadow-sm text-gray-900" : "text-gray-500"}`}
          >
            List
          </button>
        </div>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as IdeaStatus | "all")}
          className="text-sm border border-gray-200 rounded-md px-2 py-1 text-gray-600 bg-white"
        >
          <option value="all">All statuses</option>
          {statusColumns.map((s) => (
            <option key={s.key} value={s.key}>{s.label}</option>
          ))}
        </select>
      </div>

      {view === "kanban" ? (
        <KanbanView ideas={filtered} />
      ) : (
        <ListView ideas={filtered} />
      )}
    </div>
  );
}

function KanbanView({ ideas }: { ideas: Idea[] }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
      {statusColumns.map((col) => {
        const colIdeas = ideas.filter((i) => i.status === col.key);
        return (
          <div key={col.key} className="space-y-2">
            <div className="flex items-center gap-2 mb-2">
              <span className={`status-badge ${col.color}`}>{col.label}</span>
              <span className="text-xs text-gray-400">{colIdeas.length}</span>
            </div>
            {colIdeas.map((idea) => (
              <IdeaCard key={idea.id} idea={idea} />
            ))}
            {colIdeas.length === 0 && (
              <div className="text-xs text-gray-300 text-center py-4 border border-dashed border-gray-200 rounded-lg">
                Empty
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ListView({ ideas }: { ideas: Idea[] }) {
  return (
    <div className="space-y-2">
      {ideas.map((idea) => (
        <div key={idea.id} className="card-hover flex items-center gap-4">
          <div className="flex-1 min-w-0">
            <h3 className="font-medium text-gray-900 truncate">{idea.title}</h3>
            {idea.description && (
              <p className="text-sm text-gray-500 truncate">{idea.description}</p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className={`status-badge ${potentialColors[idea.potential]}`}>
              {idea.potential}
            </span>
            <span className={`status-badge ${effortColors[idea.effort_estimate]}`}>
              {idea.effort_estimate}
            </span>
            <span className={`status-badge ${statusColumns.find((s) => s.key === idea.status)?.color || ""}`}>
              {idea.status}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

function IdeaCard({ idea }: { idea: Idea }) {
  let tags: string[] = [];
  try {
    tags = JSON.parse(idea.tags || "[]");
  } catch { /* ignore */ }

  return (
    <div className="card-hover">
      <h4 className="font-medium text-sm text-gray-900 mb-1">{idea.title}</h4>
      {idea.description && (
        <p className="text-xs text-gray-500 line-clamp-2 mb-2">{idea.description}</p>
      )}
      <div className="flex flex-wrap gap-1">
        {idea.potential !== "unknown" && (
          <span className={`text-xs px-1.5 py-0.5 rounded ${potentialColors[idea.potential]}`}>
            {idea.potential}
          </span>
        )}
        {idea.effort_estimate !== "unknown" && (
          <span className={`text-xs px-1.5 py-0.5 rounded ${effortColors[idea.effort_estimate]}`}>
            {idea.effort_estimate}
          </span>
        )}
      </div>
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {tags.map((tag, i) => (
            <span key={i} className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">
              {tag}
            </span>
          ))}
        </div>
      )}
      {idea.source && (
        <p className="text-xs text-gray-400 mt-2">📍 {idea.source}</p>
      )}
      {idea.status === "validated" && (
        <PromoteButton ideaId={idea.id} ideaTitle={idea.title} />
      )}
    </div>
  );
}
