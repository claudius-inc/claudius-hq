"use client";

import { useState } from "react";
import { Skeleton } from "@/components/Skeleton";
import {
  Grid3X3,
  TrendingUp,
  TrendingDown,
  Shield,
  Fuel,
  Coins,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import type { GavekalData, GavekalRatioData } from "./types";

interface GavekalQuadrantProps {
  data: GavekalData | null;
  loading: boolean;
}

const QUADRANT_CELLS = [
  { key: "Inflationary Bust", row: "top", col: "left", label: "Inflationary Bust", shortLabel: "Stagflation", score: -2 },
  { key: "Inflationary Boom", row: "top", col: "right", label: "Inflationary Boom", shortLabel: "Nominal Growth", score: 0 },
  { key: "Deflationary Bust", row: "bottom", col: "left", label: "Deflationary Bust", shortLabel: "Recession Risk", score: 0 },
  { key: "Deflationary Boom", row: "bottom", col: "right", label: "Deflationary Boom", shortLabel: "Golden Era", score: +2 },
] as const;

const SCORE_COLORS: Record<number, { text: string; bg: string; ring: string }> = {
  2: { text: "text-emerald-700", bg: "bg-emerald-100", ring: "ring-emerald-400" },
  0: { text: "text-gray-600", bg: "bg-gray-100", ring: "ring-gray-300" },
  [-2]: { text: "text-red-700", bg: "bg-red-100", ring: "ring-red-400" },
};

const CELL_STYLES: Record<string, { active: string; ring: string; icon: string }> = {
  "Deflationary Boom": { active: "bg-emerald-100 border-emerald-300 text-emerald-800", ring: "ring-emerald-400", icon: "text-emerald-600" },
  "Inflationary Boom": { active: "bg-orange-100 border-orange-300 text-orange-800", ring: "ring-orange-400", icon: "text-orange-600" },
  "Deflationary Bust": { active: "bg-blue-100 border-blue-300 text-blue-800", ring: "ring-blue-400", icon: "text-blue-600" },
  "Inflationary Bust": { active: "bg-red-100 border-red-300 text-red-800", ring: "ring-red-400", icon: "text-red-600" },
};

function Sparkline({ ratio }: { ratio: GavekalRatioData }) {
  if (!ratio.history.length) return null;

  const values = ratio.history.map((h) => h.value);
  const mas = ratio.history.map((h) => h.ma);
  const all = [...values, ...mas];
  const min = Math.min(...all);
  const max = Math.max(...all);
  const range = max - min || 1;

  const w = 200;
  const h = 48;
  const pad = 2;
  const toY = (v: number) => pad + (h - 2 * pad) - ((v - min) / range) * (h - 2 * pad);
  const toX = (i: number) => (i / (values.length - 1)) * w;

  const valuePath = values.map((v, i) => `${i === 0 ? "M" : "L"}${toX(i)},${toY(v)}`).join(" ");
  const maPath = mas.map((v, i) => `${i === 0 ? "M" : "L"}${toX(i)},${toY(v)}`).join(" ");

  // Area fill under the value line
  const areaPath = `${valuePath} L${toX(values.length - 1)},${h} L${toX(0)},${h} Z`;

  const lastX = toX(values.length - 1);
  const lastY = toY(values[values.length - 1]);
  const lineColor = ratio.signal === 1 ? "#10b981" : "#ef4444";
  const fillColor = ratio.signal === 1 ? "#10b98118" : "#ef444418";

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-12" preserveAspectRatio="none">
      <path d={areaPath} fill={fillColor} />
      <path d={maPath} fill="none" stroke="#d1d5db" strokeWidth="1.5" strokeDasharray="4 2" />
      <path d={valuePath} fill="none" stroke={lineColor} strokeWidth="2" />
      <circle cx={lastX} cy={lastY} r="3" fill={lineColor} />
    </svg>
  );
}

function RatioCard({ ratio, icon, label }: { ratio: GavekalRatioData; icon: React.ReactNode; label?: string }) {
  const above = ratio.signal === 1;
  const pct = ((ratio.current - ratio.ma7y) / ratio.ma7y) * 100;

  return (
    <div className="bg-gray-50 rounded-lg p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          {icon}
          <span className="text-xs font-medium text-gray-600">{label ?? ratio.label}</span>
        </div>
        <div className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${
          above ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
        }`}>
          {above ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
          {above ? "Above" : "Below"} 7yma
        </div>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-base font-bold text-gray-900 tabular-nums">{ratio.current.toFixed(2)}</span>
        <span className="text-xs text-gray-400 tabular-nums">
          MA {ratio.ma7y.toFixed(2)}
        </span>
        <span className={`text-xs font-medium tabular-nums ${above ? "text-emerald-600" : "text-red-600"}`}>
          {pct >= 0 ? "+" : ""}{pct.toFixed(1)}%
        </span>
      </div>
      <Sparkline ratio={ratio} />
    </div>
  );
}

function QuadrantGrid({ activeQuadrant, quadrantColor }: { activeQuadrant: string; quadrantColor: string }) {
  return (
    <div className="relative">
      {/* Y-axis label */}
      <div className="absolute -left-0.5 top-1/2 -translate-y-1/2 -translate-x-full hidden sm:flex flex-col items-center gap-1 pr-2">
        <span className="text-[9px] text-gray-400 whitespace-nowrap -rotate-90 origin-center">Currency Quality</span>
      </div>

      <div className="space-y-1">
        {/* Top axis label */}
        <div className="flex justify-between px-1 text-[9px] text-gray-400">
          <span>Bad currency</span>
          <span>Good currency</span>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-2 gap-1.5">
          {QUADRANT_CELLS.map((cell) => {
            const active = cell.key === activeQuadrant;
            const styles = CELL_STYLES[cell.key];
            return (
              <div
                key={cell.key}
                className={`relative rounded-lg px-3 py-2.5 text-center transition-all border ${
                  active
                    ? `${styles.active} ring-2 ring-offset-1 ${styles.ring} border-transparent shadow-sm`
                    : "bg-gray-50/80 text-gray-400 border-gray-100"
                }`}
              >
                <div className={`text-[11px] font-semibold leading-tight ${active ? "" : "opacity-60"}`}>
                  {cell.label}
                </div>
                <div className={`text-[9px] mt-0.5 ${active ? "opacity-80" : "opacity-40"}`}>
                  {cell.shortLabel}
                </div>
                <div className={`text-[10px] mt-0.5 font-bold ${active ? "" : "opacity-30"}`}>
                  {cell.score > 0 ? "+" : ""}{cell.score}
                </div>
              </div>
            );
          })}
        </div>

        {/* Bottom axis label */}
        <div className="flex justify-between px-1 text-[9px] text-gray-400">
          <span>Energy inefficient</span>
          <span>Energy efficient</span>
        </div>
      </div>
    </div>
  );
}

export function GavekalQuadrant({ data, loading }: GavekalQuadrantProps) {
  const [expanded, setExpanded] = useState(false);

  if (loading) {
    return (
      <div className="rounded-lg bg-white border border-gray-200 shadow-sm p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Skeleton className="h-5 w-5 rounded" />
          <Skeleton className="h-4 w-48" />
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { quadrant, energyEfficiency, currencyQuality, keyRatios, exclusions } = data;
  const scoreStyle = SCORE_COLORS[quadrant.score] ?? SCORE_COLORS[0];
  const cellStyle = CELL_STYLES[quadrant.name] ?? CELL_STYLES["Inflationary Bust"];

  return (
    <div className="rounded-lg bg-white border border-gray-200 shadow-sm p-3 sm:p-4 space-y-3">
      {/* Header */}
      <button
        type="button"
        className="flex items-center justify-between w-full text-left cursor-pointer"
        onClick={() => setExpanded((e) => !e)}
      >
        <div className="flex items-center gap-2.5">
          <div className={`p-1.5 rounded-md ${scoreStyle.bg}`}>
            <Grid3X3 className={`w-4 h-4 ${cellStyle.icon}`} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-bold text-gray-900">
                Gavekal Four Quadrants
              </span>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${scoreStyle.bg} ${scoreStyle.text}`}>
                {quadrant.name} ({quadrant.score > 0 ? "+" : ""}{quadrant.score})
              </span>
            </div>
            <p className="text-xs text-gray-500 leading-snug mt-0.5">{quadrant.description}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0 ml-3">
          {/* Signal pills — visible on sm+ */}
          <div className="hidden sm:flex items-center gap-2">
            <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${
              energyEfficiency.signal === 1 ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
            }`}>
              <Fuel className="w-3 h-3" />
              {energyEfficiency.signal === 1 ? "Boom" : "Bust"}
            </span>
            <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${
              currencyQuality.signal === 1 ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
            }`}>
              <Coins className="w-3 h-3" />
              {currencyQuality.signal === 1 ? "Good" : "Bad"}
            </span>
          </div>
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-gray-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-gray-400" />
          )}
        </div>
      </button>

      {/* Quadrant Grid — always visible */}
      <QuadrantGrid activeQuadrant={quadrant.name} quadrantColor={quadrant.color} />

      {/* Expanded detail */}
      {expanded && (
        <div className="space-y-4 pt-3 border-t border-gray-100">
          {/* Signal ratios with sparklines */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <RatioCard
              ratio={energyEfficiency}
              icon={<Fuel className="w-3.5 h-3.5 text-gray-400" />}
              label="Energy Efficiency"
            />
            <RatioCard
              ratio={currencyQuality}
              icon={<Coins className="w-3.5 h-3.5 text-gray-400" />}
              label="Currency Quality"
            />
          </div>

          {/* Key supplementary ratios */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-medium text-gray-600">S&P 500 / Gold</span>
                <span className={`text-xs font-semibold tabular-nums ${
                  keyRatios.spGold.current > keyRatios.spGold.ma7y ? "text-emerald-600" : "text-red-600"
                }`}>
                  {keyRatios.spGold.current.toFixed(2)}
                </span>
              </div>
              <div className="text-xs text-gray-400 mb-1 tabular-nums">7y MA: {keyRatios.spGold.ma7y.toFixed(2)}</div>
              <div className={`text-[11px] font-medium ${
                keyRatios.spGold.current > keyRatios.spGold.ma7y ? "text-emerald-600" : "text-red-600"
              }`}>
                {keyRatios.spGold.current > keyRatios.spGold.ma7y
                  ? "Equities outperforming gold"
                  : "Gold outperforming equities"}
              </div>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-medium text-gray-600">Gold / WTI</span>
                <span className={`text-xs font-semibold tabular-nums ${
                  keyRatios.goldWti.current > keyRatios.goldWti.ma7y * 1.2
                    ? "text-red-600"
                    : keyRatios.goldWti.current > keyRatios.goldWti.ma7y
                      ? "text-amber-600"
                      : "text-emerald-600"
                }`}>
                  {keyRatios.goldWti.current.toFixed(2)}
                </span>
              </div>
              <div className="text-xs text-gray-400 mb-1 tabular-nums">7y MA: {keyRatios.goldWti.ma7y.toFixed(2)}</div>
              <div className={`text-[11px] font-medium ${
                keyRatios.goldWti.current > keyRatios.goldWti.ma7y * 1.2
                  ? "text-red-600"
                  : keyRatios.goldWti.current > keyRatios.goldWti.ma7y
                    ? "text-amber-600"
                    : "text-emerald-600"
              }`}>
                {keyRatios.goldWti.current > keyRatios.goldWti.ma7y * 1.2
                  ? "Elevated — recession risk"
                  : keyRatios.goldWti.current > keyRatios.goldWti.ma7y
                    ? "Above average — energy cheap vs gold"
                    : "Normal range"}
              </div>
            </div>
          </div>

          {/* Investment implications */}
          <div className="rounded-lg border border-gray-100 overflow-hidden">
            <div className="text-xs font-semibold text-gray-700 px-3 py-2 bg-gray-50/50 flex items-center gap-1.5 border-b border-gray-100">
              <Shield className="w-3.5 h-3.5 text-gray-400" />
              Investment Implications
            </div>
            <div className="grid grid-cols-2 divide-x divide-gray-100">
              <div className="p-3">
                <div className="text-[11px] font-semibold text-emerald-600 mb-2 flex items-center gap-1">
                  <TrendingUp className="w-3 h-3" />
                  What to own
                </div>
                <div className="space-y-1.5">
                  {quadrant.buySignals.map((s) => (
                    <div key={s} className="text-[11px] text-gray-600 flex items-start gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0 mt-1" />
                      {s}
                    </div>
                  ))}
                </div>
              </div>
              <div className="p-3">
                <div className="text-[11px] font-semibold text-red-600 mb-2 flex items-center gap-1">
                  <TrendingDown className="w-3 h-3" />
                  What to avoid
                </div>
                <div className="space-y-1.5">
                  {quadrant.sellSignals.map((s) => (
                    <div key={s} className="text-[11px] text-gray-600 flex items-start gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0 mt-1" />
                      {s}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Browne exclusion rules */}
          {exclusions.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-gray-700 mb-2">Browne Portfolio Rules</div>
              <div className="space-y-1.5">
                {exclusions.map((ex) => (
                  <div
                    key={ex.name}
                    className={`flex items-start gap-2 text-[11px] rounded-lg px-3 py-2 ${
                      ex.signal === "Warning"
                        ? "bg-red-50 text-red-800 border border-red-100"
                        : "bg-gray-50 text-gray-600 border border-gray-100"
                    }`}
                  >
                    {ex.signal === "Warning" && <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5" />}
                    <div>
                      <span className="font-semibold">{ex.name}:</span>{" "}
                      <span className={`font-bold ${ex.signal === "Warning" ? "text-red-600" : ""}`}>{ex.signal}</span>{" "}
                      <span className="opacity-70">— {ex.description}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
