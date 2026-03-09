"use client";

import type { PlaybookEventResult, PlaybookCategory } from "./types";
import { Modal } from "@/components/ui/Modal";
import {
  TrendingDown,
  Landmark,
  Globe,
  Building2,
  BarChart3,
  Layers,
  Check,
  X,
  BookOpen,
  AlertTriangle,
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
  "economic-cycle": "Economic Cycle",
  monetary: "Monetary Policy",
  geopolitical: "Geopolitical / Supply",
  "financial-system": "Financial System",
  "market-structure": "Market Structure",
  structural: "Structural",
};

const statusStyles = {
  active: "bg-red-50 text-red-600 border-red-200",
  warming: "bg-amber-50 text-amber-600 border-amber-200",
  dormant: "bg-gray-50 text-gray-500 border-gray-200",
};

interface PlaybookDetailProps {
  result: PlaybookEventResult | null;
  onClose: () => void;
}

export function PlaybookDetail({ result, onClose }: PlaybookDetailProps) {
  if (!result) return null;

  const { event, status, firingCount, totalCount, triggerResults } = result;
  const Icon = categoryIcons[event.category];

  return (
    <Modal
      open={!!result}
      onClose={onClose}
      title={event.name}
    >
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className={`text-xs font-medium px-2 py-0.5 rounded-full border ${statusStyles[status]}`}
          >
            {status === "active"
              ? "Active"
              : status === "warming"
                ? "Warming"
                : "Dormant"}
          </span>
          <span className="text-xs text-gray-400 flex items-center gap-1">
            <Icon size={12} />
            {categoryLabels[event.category]}
          </span>
          <span className="text-xs text-gray-400 tabular-nums ml-auto">
            {firingCount}/{totalCount} signals firing
          </span>
        </div>

        {/* Description */}
        <p className="text-xs text-gray-600 leading-relaxed">
          {event.description}
        </p>

        {/* Signal breakdown */}
        <div>
          <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
            Signal Breakdown
          </h4>
          <div className="space-y-1">
            {triggerResults.map((t) => (
              <div
                key={t.id}
                className={`flex items-start gap-2 px-2.5 py-1.5 rounded-lg text-xs ${
                  t.firing
                    ? "bg-gray-50 border border-gray-200"
                    : "opacity-60"
                }`}
              >
                {t.firing ? (
                  <Check
                    size={14}
                    className="text-green-500 flex-shrink-0 mt-0.5"
                  />
                ) : (
                  <X
                    size={14}
                    className="text-gray-300 flex-shrink-0 mt-0.5"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-gray-900 font-medium truncate">
                      {t.label}
                    </span>
                    <span
                      className={`flex-shrink-0 tabular-nums ${
                        t.firing ? "text-gray-700" : "text-gray-400"
                      }`}
                    >
                      {t.value}
                    </span>
                  </div>
                  {t.detail && (
                    <span className="text-gray-400 text-[11px]">
                      {t.detail}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Historical context */}
        <div>
          <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
            <BookOpen size={12} />
            Historical Context
          </h4>
          <p className="text-xs text-gray-500 leading-relaxed">
            {event.historicalContext}
          </p>
        </div>

        {/* Implications */}
        <div>
          <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
            <AlertTriangle size={12} />
            Implications
          </h4>
          <ul className="space-y-1">
            {event.implications.map((imp, i) => (
              <li
                key={i}
                className="text-xs text-gray-500 flex items-start gap-1.5"
              >
                <span className="text-gray-300 mt-0.5">-</span>
                {imp}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Modal>
  );
}
