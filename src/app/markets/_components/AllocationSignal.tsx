"use client";

import { useEffect, useState } from "react";
import { Compass, TrendingUp, Gauge, Layers } from "lucide-react";
import { Skeleton } from "@/components/Skeleton";

interface AllocationSignalData {
  regime: { name: string; implication: string; color: string };
  valuation: { zone: string; score: number; color: string };
  sentiment: { composite: number; label: string; color: string };
  themes: {
    top3: Array<{ name: string; perf1m: number; crowding: number | null }>;
  };
  bias: string;
  updatedAt: string;
}

const COLOR_MAP: Record<string, string> = {
  red: "bg-red-50 text-red-700 border-red-200",
  orange: "bg-amber-50 text-amber-700 border-amber-200",
  gray: "bg-gray-50 text-gray-700 border-gray-200",
  emerald: "bg-emerald-50 text-emerald-700 border-emerald-200",
  green: "bg-emerald-50 text-emerald-700 border-emerald-200",
  blue: "bg-blue-50 text-blue-700 border-blue-200",
};

const BADGE_MAP: Record<string, string> = {
  red: "bg-red-100 text-red-700",
  orange: "bg-amber-100 text-amber-700",
  gray: "bg-gray-100 text-gray-600",
  emerald: "bg-emerald-100 text-emerald-700",
  green: "bg-emerald-100 text-emerald-700",
  blue: "bg-blue-100 text-blue-700",
};

function getCrowdingDot(crowding: number | null): string {
  if (crowding == null) return "bg-gray-300";
  if (crowding < 40) return "bg-emerald-400";
  if (crowding < 65) return "bg-amber-400";
  return "bg-red-400";
}

function getSentimentBarColor(composite: number): string {
  if (composite >= 75) return "bg-red-500";
  if (composite >= 60) return "bg-amber-500";
  if (composite >= 40) return "bg-gray-400";
  if (composite >= 25) return "bg-emerald-400";
  return "bg-emerald-600";
}

export function AllocationSignal() {
  const [data, setData] = useState<AllocationSignalData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/markets/allocation-signal")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setData(d))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex items-center gap-2 mb-3">
          <Skeleton className="h-5 w-5 rounded" />
          <Skeleton className="h-5 w-40" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-lg" />
          ))}
        </div>
        <Skeleton className="h-4 w-full mt-3" />
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="flex items-center gap-2 mb-3">
        <Compass className="w-4 h-4 text-gray-500" />
        <h2 className="text-sm font-semibold text-gray-900">Allocation Signal</h2>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Regime */}
        <div className={`rounded-lg border px-3 py-2.5 ${COLOR_MAP[data.regime.color] || COLOR_MAP.gray}`}>
          <div className="flex items-center gap-1.5 mb-1">
            <Layers className="w-3.5 h-3.5 opacity-60" />
            <span className="text-[10px] font-medium uppercase tracking-wide opacity-70">Regime</span>
          </div>
          <div className="text-sm font-semibold leading-tight">{data.regime.name}</div>
          <div className="text-[11px] mt-0.5 opacity-80 leading-snug line-clamp-2">{data.regime.implication}</div>
        </div>

        {/* Valuation */}
        <div className={`rounded-lg border px-3 py-2.5 ${COLOR_MAP[data.valuation.color] || COLOR_MAP.gray}`}>
          <div className="flex items-center gap-1.5 mb-1">
            <Gauge className="w-3.5 h-3.5 opacity-60" />
            <span className="text-[10px] font-medium uppercase tracking-wide opacity-70">Valuations</span>
          </div>
          <div className="text-sm font-semibold">{data.valuation.zone}</div>
          <div className="text-[11px] mt-0.5 opacity-80">{data.valuation.score}% of historical mean</div>
        </div>

        {/* Sentiment */}
        <div className={`rounded-lg border px-3 py-2.5 ${COLOR_MAP[data.sentiment.color] || COLOR_MAP.gray}`}>
          <div className="flex items-center gap-1.5 mb-1">
            <TrendingUp className="w-3.5 h-3.5 opacity-60" />
            <span className="text-[10px] font-medium uppercase tracking-wide opacity-70">Sentiment</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold">{data.sentiment.label}</span>
            <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold ${BADGE_MAP[data.sentiment.color] || BADGE_MAP.gray}`}>
              {data.sentiment.composite}
            </span>
          </div>
          <div className="mt-1.5 h-1.5 bg-gray-200 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${getSentimentBarColor(data.sentiment.composite)}`}
              style={{ width: `${data.sentiment.composite}%` }}
            />
          </div>
        </div>

        {/* Top Themes */}
        <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5">
          <div className="flex items-center gap-1.5 mb-1.5">
            <Layers className="w-3.5 h-3.5 text-gray-500 opacity-60" />
            <span className="text-[10px] font-medium uppercase tracking-wide text-gray-500">Top Themes</span>
          </div>
          {data.themes.top3.length > 0 ? (
            <div className="space-y-1">
              {data.themes.top3.map((theme) => (
                <div key={theme.name} className="flex items-center justify-between gap-1">
                  <span className="text-[11px] text-gray-700 font-medium truncate">{theme.name}</span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className={`text-[11px] font-semibold ${theme.perf1m >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                      {theme.perf1m >= 0 ? "+" : ""}{theme.perf1m.toFixed(1)}%
                    </span>
                    <span className={`w-1.5 h-1.5 rounded-full ${getCrowdingDot(theme.crowding)}`} title={theme.crowding != null ? `Crowding: ${theme.crowding}` : "No data"} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-[11px] text-gray-400">No theme data</div>
          )}
        </div>
      </div>

      {/* Bias line */}
      <p className="mt-3 text-xs text-gray-600 leading-relaxed">{data.bias}</p>
    </div>
  );
}
