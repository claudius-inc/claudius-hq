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
} from "lucide-react";
import type { GavekalData, GavekalRatioData } from "./types";

interface GavekalQuadrantProps {
  data: GavekalData | null;
  loading: boolean;
}

const QUADRANT_CELLS = [
  { key: "Inflationary Bust", row: "top", col: "left", label: "Inflationary Bust", score: -2 },
  { key: "Inflationary Boom", row: "top", col: "right", label: "Inflationary Boom", score: 0 },
  { key: "Deflationary Bust", row: "bottom", col: "left", label: "Deflationary Bust", score: 0 },
  { key: "Deflationary Boom", row: "bottom", col: "right", label: "Deflationary Boom", score: +2 },
] as const;

const SCORE_COLORS: Record<number, string> = {
  2: "text-emerald-600",
  0: "text-gray-600",
  [-2]: "text-red-600",
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
  const h = 40;
  const toY = (v: number) => h - ((v - min) / range) * h;
  const toX = (i: number) => (i / (values.length - 1)) * w;

  const valuePath = values.map((v, i) => `${i === 0 ? "M" : "L"}${toX(i)},${toY(v)}`).join(" ");
  const maPath = mas.map((v, i) => `${i === 0 ? "M" : "L"}${toX(i)},${toY(v)}`).join(" ");

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-10" preserveAspectRatio="none">
      <path d={maPath} fill="none" stroke="#9ca3af" strokeWidth="1.5" strokeDasharray="4 2" />
      <path d={valuePath} fill="none" stroke={ratio.signal === 1 ? "#10b981" : "#ef4444"} strokeWidth="2" />
    </svg>
  );
}

function RatioCard({ ratio, icon }: { ratio: GavekalRatioData; icon: React.ReactNode }) {
  const above = ratio.signal === 1;
  const pct = ((ratio.current - ratio.ma7y) / ratio.ma7y) * 100;

  return (
    <div className="bg-gray-50 rounded-lg p-3">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-1.5">
          {icon}
          <span className="text-[10px] font-medium text-gray-500">{ratio.label}</span>
        </div>
        <div className={`flex items-center gap-0.5 text-xs font-bold ${above ? "text-emerald-600" : "text-red-600"}`}>
          {above ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
          {above ? "Above" : "Below"} 7yma
        </div>
      </div>
      <div className="flex items-baseline gap-2 mb-1">
        <span className="text-sm font-bold text-gray-900">{ratio.current.toFixed(2)}</span>
        <span className="text-[10px] text-gray-400">
          vs {ratio.ma7y.toFixed(2)} ({pct >= 0 ? "+" : ""}{pct.toFixed(1)}%)
        </span>
      </div>
      <Sparkline ratio={ratio} />
    </div>
  );
}

export function GavekalQuadrant({ data, loading }: GavekalQuadrantProps) {
  const [expanded, setExpanded] = useState(false);

  if (loading) {
    return (
      <div className="rounded-lg bg-white border border-gray-200 shadow-sm p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Skeleton className="h-4 w-4" />
          <Skeleton className="h-4 w-40" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-lg" />
          ))}
        </div>
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  if (!data) return null;

  const { quadrant, energyEfficiency, currencyQuality, keyRatios, exclusions } = data;

  return (
    <div className="rounded-lg bg-white border border-gray-200 shadow-sm p-3 sm:p-4 space-y-3">
      {/* Header strip */}
      <button
        type="button"
        className="flex items-center justify-between w-full text-left cursor-pointer"
        onClick={() => setExpanded((e) => !e)}
      >
        <div className="flex items-center gap-2">
          <div className={`p-1 rounded-md ${
            quadrant.score === 2 ? "bg-emerald-50" : quadrant.score === -2 ? "bg-red-50" : "bg-amber-50"
          }`}>
            <Grid3X3 className={`w-3.5 h-3.5 ${
              quadrant.score === 2 ? "text-emerald-500" : quadrant.score === -2 ? "text-red-500" : "text-amber-500"
            }`} />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className={`text-sm font-bold ${SCORE_COLORS[quadrant.score] ?? "text-gray-600"}`}>
                {quadrant.name}
              </span>
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                quadrant.score === 2
                  ? "bg-emerald-100 text-emerald-700"
                  : quadrant.score === -2
                    ? "bg-red-100 text-red-700"
                    : "bg-gray-100 text-gray-600"
              }`}>
                {quadrant.score > 0 ? "+" : ""}{quadrant.score}
              </span>
            </div>
            <p className="text-[10px] text-gray-400 leading-tight">{quadrant.description}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="hidden sm:flex items-center gap-3 text-[10px] text-gray-400">
            <span>
              <span className="opacity-60">Energy </span>
              <span className={`font-bold ${energyEfficiency.signal === 1 ? "text-emerald-600" : "text-red-600"}`}>
                {energyEfficiency.signal === 1 ? "Boom" : "Bust"}
              </span>
            </span>
            <span>
              <span className="opacity-60">Currency </span>
              <span className={`font-bold ${currencyQuality.signal === 1 ? "text-emerald-600" : "text-red-600"}`}>
                {currencyQuality.signal === 1 ? "Good" : "Bad"}
              </span>
            </span>
          </div>
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-gray-300" />
          ) : (
            <ChevronDown className="w-4 h-4 text-gray-300" />
          )}
        </div>
      </button>

      {/* Quadrant Grid — always visible */}
      <div className="grid grid-cols-2 gap-1.5">
        {QUADRANT_CELLS.map((cell) => {
          const active = cell.key === quadrant.name;
          return (
            <div
              key={cell.key}
              className={`rounded-lg px-2.5 py-2 text-center transition-all ${
                active
                  ? `${quadrant.color} ring-2 ring-offset-1 ${
                      quadrant.score === 2
                        ? "ring-emerald-400"
                        : quadrant.score === -2
                          ? "ring-red-400"
                          : cell.key === "Inflationary Boom"
                            ? "ring-orange-400"
                            : "ring-blue-400"
                    }`
                  : "bg-gray-50 text-gray-400"
              }`}
            >
              <div className={`text-[10px] font-semibold ${active ? "" : "opacity-60"}`}>
                {cell.label}
              </div>
              <div className={`text-[10px] ${active ? "font-bold" : "opacity-40"}`}>
                ({cell.score > 0 ? "+" : ""}{cell.score})
              </div>
            </div>
          );
        })}
      </div>

      {/* Axis labels */}
      <div className="flex justify-between text-[9px] text-gray-300 px-1">
        <span>Bad currency (inflation)</span>
        <span>Good currency (deflation)</span>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="space-y-4 pt-2 border-t border-gray-100">
          {/* Signal ratios with sparklines */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <RatioCard
              ratio={energyEfficiency}
              icon={<Fuel className="w-3 h-3 text-gray-400" />}
            />
            <RatioCard
              ratio={currencyQuality}
              icon={<Coins className="w-3 h-3 text-gray-400" />}
            />
          </div>

          {/* Key supplementary ratios */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-gray-50 rounded-lg p-2.5">
              <div className="text-[10px] text-gray-500 mb-0.5">S&P 500 / Gold</div>
              <div className="text-sm font-bold text-gray-900">{keyRatios.spGold.current.toFixed(2)}</div>
              <div className="text-[10px] text-gray-400">7yma: {keyRatios.spGold.ma7y.toFixed(2)}</div>
              <div className={`text-[10px] font-medium mt-0.5 ${
                keyRatios.spGold.current > keyRatios.spGold.ma7y ? "text-emerald-600" : "text-red-600"
              }`}>
                {keyRatios.spGold.current > keyRatios.spGold.ma7y
                  ? "Equities outperforming gold"
                  : "Gold outperforming equities (monetary illusion?)"}
              </div>
            </div>
            <div className="bg-gray-50 rounded-lg p-2.5">
              <div className="text-[10px] text-gray-500 mb-0.5">Gold / WTI</div>
              <div className="text-sm font-bold text-gray-900">{keyRatios.goldWti.current.toFixed(2)}</div>
              <div className="text-[10px] text-gray-400">7yma: {keyRatios.goldWti.ma7y.toFixed(2)}</div>
              <div className={`text-[10px] font-medium mt-0.5 ${
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
          <div>
            <div className="text-xs font-semibold text-gray-700 mb-2 flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-gray-400" />
              Investment Implications
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <div className="text-[10px] font-medium text-emerald-600 mb-1">What to own</div>
                {quadrant.buySignals.map((s) => (
                  <div key={s} className="text-[10px] text-gray-600 flex items-center gap-1">
                    <span className="w-1 h-1 rounded-full bg-emerald-400 shrink-0" />
                    {s}
                  </div>
                ))}
              </div>
              <div>
                <div className="text-[10px] font-medium text-red-600 mb-1">What to avoid</div>
                {quadrant.sellSignals.map((s) => (
                  <div key={s} className="text-[10px] text-gray-600 flex items-center gap-1">
                    <span className="w-1 h-1 rounded-full bg-red-400 shrink-0" />
                    {s}
                  </div>
                ))}
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
                    className={`flex items-start gap-2 text-[10px] rounded px-2 py-1.5 ${
                      ex.signal === "Warning"
                        ? "bg-red-50 text-red-700"
                        : "bg-gray-50 text-gray-600"
                    }`}
                  >
                    {ex.signal === "Warning" && <AlertTriangle className="w-3 h-3 text-red-500 shrink-0 mt-0.5" />}
                    <div>
                      <span className="font-medium">{ex.name}:</span>{" "}
                      <span className="font-bold">{ex.signal}</span>{" "}
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
