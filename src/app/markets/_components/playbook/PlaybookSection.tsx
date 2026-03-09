"use client";

import { useState, useMemo } from "react";
import { Radar } from "lucide-react";
import type {
  MacroIndicator,
  MarketEtf,
  SentimentData,
  BreadthData,
  CongressData,
  InsiderData,
  YieldSpread,
  RegimeData,
} from "../types";
import type { PlaybookEventResult, PlaybookStatus } from "./types";
import { usePlaybookData } from "./hooks";
import { evaluateAllEvents } from "./engine";
import { PLAYBOOK_EVENTS } from "./events";
import { PlaybookCard } from "./PlaybookCard";
import { PlaybookDetail } from "./PlaybookDetail";

const tabs: { key: PlaybookStatus; label: string; color: string }[] = [
  { key: "active", label: "Active", color: "bg-red-500" },
  { key: "warming", label: "Warming", color: "bg-amber-500" },
  { key: "dormant", label: "Dormant", color: "bg-gray-600" },
];

interface PlaybookSectionProps {
  macroIndicators: MacroIndicator[];
  yieldSpreads: YieldSpread[];
  marketEtfs: MarketEtf[];
  sentimentData: SentimentData | null;
  breadthData: BreadthData | null;
  congressData: CongressData | null;
  insiderData: InsiderData | null;
  regimeData: RegimeData | null;
}

export function PlaybookSection(props: PlaybookSectionProps) {
  const [activeTab, setActiveTab] = useState<PlaybookStatus>("active");
  const [selectedResult, setSelectedResult] =
    useState<PlaybookEventResult | null>(null);

  const { snapshot, loading } = usePlaybookData({
    macroIndicators: props.macroIndicators,
    yieldSpreads: props.yieldSpreads,
    marketEtfs: props.marketEtfs,
    sentimentData: props.sentimentData,
    breadthData: props.breadthData,
    congressData: props.congressData,
    insiderData: props.insiderData,
    regimeData: props.regimeData,
  });

  const results = useMemo(
    () => evaluateAllEvents(PLAYBOOK_EVENTS, snapshot),
    [snapshot],
  );

  const counts = useMemo(() => {
    const c = { active: 0, warming: 0, dormant: 0 };
    for (const r of results) c[r.status]++;
    return c;
  }, [results]);

  const filtered = useMemo(
    () => results.filter((r) => r.status === activeTab),
    [results, activeTab],
  );

  // Auto-select best tab on first render
  const defaultTab = useMemo(() => {
    if (counts.active > 0) return "active" as const;
    if (counts.warming > 0) return "warming" as const;
    return "dormant" as const;
  }, [counts]);

  // Set default tab once data loads
  useState(() => {
    if (!loading && activeTab === "active" && counts.active === 0) {
      setActiveTab(defaultTab);
    }
  });

  return (
    <div className="col-span-full bg-white rounded-lg border border-gray-200 shadow-sm p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Radar size={16} className="text-gray-400" />
          <h2 className="text-sm font-semibold text-gray-900">
            Macro Playbook
          </h2>
          {loading && (
            <div className="w-3 h-3 border border-gray-300 border-t-blue-500 rounded-full animate-spin" />
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1.5 mb-3">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              activeTab === tab.key
                ? "bg-gray-100 text-gray-900 border border-gray-200"
                : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
            }`}
          >
            {tab.label}
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                activeTab === tab.key
                  ? `${tab.color} text-white`
                  : "bg-gray-100 text-gray-500"
              }`}
            >
              {counts[tab.key]}
            </span>
          </button>
        ))}
      </div>

      {/* Grid */}
      {filtered.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {filtered.map((r) => (
            <PlaybookCard
              key={r.event.id}
              result={r}
              onClick={() => setSelectedResult(r)}
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-6 text-xs text-gray-400">
          No {activeTab} events detected
        </div>
      )}

      {/* Detail modal */}
      <PlaybookDetail
        result={selectedResult}
        onClose={() => setSelectedResult(null)}
      />
    </div>
  );
}
