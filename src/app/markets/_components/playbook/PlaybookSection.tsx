"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { Radar } from "lucide-react";
import { Skeleton } from "@/components/Skeleton";
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
  { key: "active", label: "Active", color: "bg-gray-700" },
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
  loading?: boolean;
}

function PlaybookCardSkeleton() {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-sm">
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-1.5 min-w-0">
          <Skeleton className="w-3.5 h-3.5 rounded !bg-gray-100" />
          <Skeleton className="h-3.5 w-24 !bg-gray-100" />
        </div>
        <Skeleton className="h-4 w-14 rounded-full !bg-gray-100" />
      </div>
      <Skeleton className="h-3 w-full mb-2 !bg-gray-50" />
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-0.5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="w-2 h-2 rounded-full !bg-gray-100" />
          ))}
        </div>
        <Skeleton className="h-2.5 w-6 !bg-gray-100" />
      </div>
      <div className="flex items-center justify-between mt-1.5">
        <Skeleton className="h-2.5 w-14 !bg-gray-50" />
      </div>
    </div>
  );
}

export function PlaybookSection(props: PlaybookSectionProps) {
  const [activeTab, setActiveTab] = useState<PlaybookStatus>("active");
  const [selectedResult, setSelectedResult] =
    useState<PlaybookEventResult | null>(null);
  const hasAutoSelected = useRef(false);

  const { snapshot, loading: swrLoading } = usePlaybookData({
    macroIndicators: props.macroIndicators,
    yieldSpreads: props.yieldSpreads,
    marketEtfs: props.marketEtfs,
    sentimentData: props.sentimentData,
    breadthData: props.breadthData,
    congressData: props.congressData,
    insiderData: props.insiderData,
    regimeData: props.regimeData,
  });

  const pageLoading = props.loading ?? false;
  const isLoading = pageLoading || swrLoading;

  const results = useMemo(
    () => (isLoading ? [] : evaluateAllEvents(PLAYBOOK_EVENTS, snapshot)),
    [snapshot, isLoading],
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

  // Auto-select best tab once data finishes loading
  useEffect(() => {
    if (isLoading || hasAutoSelected.current) return;
    hasAutoSelected.current = true;
    if (counts.active > 0) setActiveTab("active");
    else if (counts.warming > 0) setActiveTab("warming");
    else setActiveTab("dormant");
  }, [isLoading, counts]);

  return (
    <div className="col-span-full bg-white rounded-lg border border-gray-200 shadow-sm p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Radar size={16} className="text-gray-400" />
          <h2 className="text-sm font-semibold text-gray-900">
            Macro Playbook
          </h2>
          {isLoading && (
            <div className="w-3 h-3 border border-gray-300 border-t-blue-500 rounded-full animate-spin" />
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1.5 mb-3">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => !isLoading && setActiveTab(tab.key)}
            disabled={isLoading}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              activeTab === tab.key
                ? "bg-gray-100 text-gray-900 border border-gray-200"
                : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
            } ${isLoading ? "opacity-60 cursor-default" : ""}`}
          >
            {tab.label}
            {isLoading ? (
              <Skeleton className="w-5 h-4 rounded-full !bg-gray-100" />
            ) : (
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                  activeTab === tab.key
                    ? `${tab.color} text-white`
                    : "bg-gray-100 text-gray-500"
                }`}
              >
                {counts[tab.key]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <PlaybookCardSkeleton key={i} />
          ))}
        </div>
      ) : filtered.length > 0 ? (
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
