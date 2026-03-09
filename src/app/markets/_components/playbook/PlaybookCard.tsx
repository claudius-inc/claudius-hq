"use client";

import type { PlaybookEventResult, PlaybookCategory } from "./types";
import {
  TrendingDown,
  Landmark,
  Globe,
  Building2,
  BarChart3,
  Layers,
} from "lucide-react";

const categoryIcons: Record<PlaybookCategory, typeof TrendingDown> = {
  "economic-cycle": TrendingDown,
  monetary: Landmark,
  geopolitical: Globe,
  "financial-system": Building2,
  "market-structure": BarChart3,
  structural: Layers,
};

const categoryLabels: Record<PlaybookCategory, string> = {
  "economic-cycle": "Economic",
  monetary: "Monetary",
  geopolitical: "Geopolitical",
  "financial-system": "Financial",
  "market-structure": "Market",
  structural: "Structural",
};

const statusStyles = {
  active: "bg-red-50 text-red-600 border-red-200",
  warming: "bg-amber-50 text-amber-600 border-amber-200",
  dormant: "bg-gray-50 text-gray-500 border-gray-200",
};

const statusLabels = {
  active: "Active",
  warming: "Warming",
  dormant: "Dormant",
};

interface PlaybookCardProps {
  result: PlaybookEventResult;
  onClick: () => void;
}

export function PlaybookCard({ result, onClick }: PlaybookCardProps) {
  const { event, status, firingCount, totalCount, triggerResults } = result;
  const Icon = categoryIcons[event.category];

  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-white hover:bg-gray-50 border border-gray-200 hover:border-gray-300 rounded-lg p-3 transition-colors group shadow-sm"
    >
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-1.5 min-w-0">
          <Icon
            size={14}
            className="text-gray-400 flex-shrink-0 mt-0.5"
          />
          <span className="text-xs font-medium text-gray-900 truncate">
            {event.name}
          </span>
        </div>
        <span
          className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full border flex-shrink-0 ${statusStyles[status]}`}
        >
          {statusLabels[status]}
        </span>
      </div>

      <p className="text-[11px] text-gray-400 line-clamp-1 mb-2">
        {event.description}
      </p>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-0.5">
          {triggerResults.map((t) => (
            <div
              key={t.id}
              className={`w-2 h-2 rounded-full ${
                t.firing
                  ? status === "active"
                    ? "bg-red-400"
                    : "bg-amber-400"
                  : "bg-gray-200"
              }`}
              title={t.label}
            />
          ))}
        </div>
        <span className="text-[10px] text-gray-400 tabular-nums">
          {firingCount}/{totalCount}
        </span>
      </div>

      <div className="flex items-center justify-between mt-1.5">
        <span className="text-[10px] text-gray-400">
          {categoryLabels[event.category]}
        </span>
        <span className="text-[10px] text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity">
          Click for details
        </span>
      </div>
    </button>
  );
}
