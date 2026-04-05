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
  Clock,
  ArrowRight,
} from "lucide-react";
import type {
  GavekalData,
  GavekalRatioData,
  GavekalRegimePoint,
} from "./types";

interface GavekalQuadrantProps {
  data: GavekalData | null;
  loading: boolean;
}

const QUADRANT_CELLS = [
  {
    key: "Inflationary Bust",
    label: "Inflationary Bust",
    score: -2,
    brief: "Stagflation — worst for capitalism",
  },
  {
    key: "Inflationary Boom",
    label: "Inflationary Boom",
    score: 0,
    brief: "Nominal growth, real erosion",
  },
  {
    key: "Deflationary Bust",
    label: "Deflationary Bust",
    score: 0,
    brief: "Recession risk, seek safety",
  },
  {
    key: "Deflationary Boom",
    label: "Deflationary Boom",
    score: +2,
    brief: "Best for capitalism",
  },
] as const;

const SCORE_COLORS: Record<number, string> = {
  2: "text-emerald-600",
  0: "text-gray-600",
  [-2]: "text-red-600",
};

const QUADRANT_RING: Record<string, string> = {
  "Inflationary Bust": "ring-red-400",
  "Inflationary Boom": "ring-orange-400",
  "Deflationary Bust": "ring-blue-400",
  "Deflationary Boom": "ring-emerald-400",
};

const QUADRANT_BG: Record<string, string> = {
  "Inflationary Bust": "bg-red-100 border-red-300 text-red-800",
  "Inflationary Boom": "bg-orange-100 border-orange-300 text-orange-800",
  "Deflationary Bust": "bg-blue-100 border-blue-300 text-blue-800",
  "Deflationary Boom": "bg-emerald-100 border-emerald-300 text-emerald-800",
};

const REGIME_COLORS: Record<string, string> = {
  "Deflationary Boom": "#10b981",
  "Inflationary Boom": "#f97316",
  "Deflationary Bust": "#3b82f6",
  "Inflationary Bust": "#ef4444",
};

// ── Ratio Chart (interactive SVG with MA overlay + hover) ───────────────────

function RatioChart({
  ratio,
  icon,
  height = 80,
}: {
  ratio: GavekalRatioData;
  icon: React.ReactNode;
  height?: number;
}) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const above = ratio.signal === 1;
  const pct = ((ratio.current - ratio.ma7y) / ratio.ma7y) * 100;

  if (!ratio.history.length) return null;

  const values = ratio.history.map((h) => h.value);
  const mas = ratio.history.map((h) => h.ma);
  const all = [...values, ...mas];
  const min = Math.min(...all);
  const max = Math.max(...all);
  const range = max - min || 1;
  const pad = range * 0.05;

  const w = 400;
  const h = height;
  const toY = (v: number) => h - ((v - (min - pad)) / (range + pad * 2)) * h;
  const toX = (i: number) => (i / (values.length - 1)) * w;

  const valuePath = values
    .map((v, i) => `${i === 0 ? "M" : "L"}${toX(i)},${toY(v)}`)
    .join(" ");
  const maPath = mas
    .map((v, i) => `${i === 0 ? "M" : "L"}${toX(i)},${toY(v)}`)
    .join(" ");

  // Fill area between value and bottom
  const fillPath = `${valuePath} L${toX(values.length - 1)},${h} L${toX(0)},${h} Z`;

  const hoverPoint = hoverIdx !== null ? ratio.history[hoverIdx] : null;

  return (
    <div className="bg-gray-50 rounded-lg p-3">
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1.5">
          {icon}
          <span className="text-[10px] font-medium text-gray-500">
            {ratio.label}
          </span>
        </div>
        <div
          className={`flex items-center gap-0.5 text-xs font-bold ${above ? "text-emerald-600" : "text-red-600"}`}
        >
          {above ? (
            <TrendingUp className="w-3 h-3" />
          ) : (
            <TrendingDown className="w-3 h-3" />
          )}
          {above ? "Above" : "Below"} 7yMA
        </div>
      </div>

      <div className="flex items-baseline gap-2 mb-2">
        <span className="text-sm font-bold text-gray-900">
          {ratio.current.toFixed(2)}
        </span>
        <span className="text-[10px] text-gray-400">
          vs {ratio.ma7y.toFixed(2)} ({pct >= 0 ? "+" : ""}
          {pct.toFixed(1)}%)
        </span>
      </div>

      {/* Hover info */}
      <div className="h-4 mb-1">
        {hoverPoint && (
          <div className="flex items-center gap-3 text-[10px] text-gray-500">
            <span className="font-medium">{hoverPoint.date}</span>
            <span>
              Value:{" "}
              <span className="font-bold text-gray-700">
                {hoverPoint.value.toFixed(4)}
              </span>
            </span>
            <span>
              7yMA:{" "}
              <span className="font-bold text-gray-400">
                {hoverPoint.ma.toFixed(4)}
              </span>
            </span>
          </div>
        )}
      </div>

      {/* Chart */}
      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="w-full"
        style={{ height: `${height}px` }}
        preserveAspectRatio="none"
        onMouseLeave={() => setHoverIdx(null)}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const x = e.clientX - rect.left;
          const idx = Math.round((x / rect.width) * (values.length - 1));
          if (idx >= 0 && idx < values.length) setHoverIdx(idx);
        }}
      >
        {/* Fill area */}
        <path d={fillPath} fill={above ? "#10b98115" : "#ef444415"} />

        {/* MA line */}
        <path
          d={maPath}
          fill="none"
          stroke="#9ca3af"
          strokeWidth="1.5"
          strokeDasharray="4 2"
        />

        {/* Value line */}
        <path
          d={valuePath}
          fill="none"
          stroke={above ? "#10b981" : "#ef4444"}
          strokeWidth="2"
        />

        {/* Hover crosshair */}
        {hoverIdx !== null && (
          <>
            <line
              x1={toX(hoverIdx)}
              y1={0}
              x2={toX(hoverIdx)}
              y2={h}
              stroke="#6b7280"
              strokeWidth="0.5"
              strokeDasharray="2 2"
            />
            <circle
              cx={toX(hoverIdx)}
              cy={toY(values[hoverIdx])}
              r="3"
              fill={above ? "#10b981" : "#ef4444"}
              stroke="white"
              strokeWidth="1.5"
            />
            <circle
              cx={toX(hoverIdx)}
              cy={toY(mas[hoverIdx])}
              r="2.5"
              fill="#9ca3af"
              stroke="white"
              strokeWidth="1"
            />
          </>
        )}
      </svg>

      {/* Legend */}
      <div className="flex items-center gap-3 mt-1.5 text-[9px] text-gray-400">
        <span className="flex items-center gap-1">
          <span
            className={`inline-block w-3 h-[2px] ${above ? "bg-emerald-500" : "bg-red-500"}`}
          />
          Ratio
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-[2px] bg-gray-400" style={{ borderTop: "1px dashed #9ca3af" }} />
          7yr MA
        </span>
      </div>
    </div>
  );
}

// ── Regime Timeline ────────────────────────────────────────────────────────

function RegimeTimeline({ history }: { history: GavekalRegimePoint[] }) {
  const [hoverSeg, setHoverSeg] = useState<number | null>(null);

  if (!history.length) return null;

  const now = new Date().toISOString().split("T")[0];
  const segments = history.map((h, i) => {
    const startDate = h.date;
    const endDate = i < history.length - 1 ? history[i + 1].date : now;
    return {
      ...h,
      startDate,
      endDate,
      startMs: new Date(startDate).getTime(),
      endMs: new Date(endDate).getTime(),
    };
  });

  const totalMs = segments[segments.length - 1].endMs - segments[0].startMs;
  if (totalMs <= 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        <Clock className="w-3 h-3 text-gray-400" />
        <span className="text-[10px] font-medium text-gray-500">
          Regime History
        </span>
      </div>

      {/* Timeline bar */}
      <div className="flex h-5 rounded-md overflow-hidden border border-gray-200">
        {segments.map((seg, i) => {
          const pct = ((seg.endMs - seg.startMs) / totalMs) * 100;
          if (pct < 0.5) return null;
          return (
            <div
              key={i}
              className="relative transition-opacity duration-150"
              style={{
                width: `${pct}%`,
                backgroundColor: REGIME_COLORS[seg.quadrant] ?? "#9ca3af",
                opacity: hoverSeg !== null && hoverSeg !== i ? 0.4 : 1,
              }}
              onMouseEnter={() => setHoverSeg(i)}
              onMouseLeave={() => setHoverSeg(null)}
            />
          );
        })}
      </div>

      {/* Hover detail */}
      <div className="h-4">
        {hoverSeg !== null && segments[hoverSeg] && (
          <div className="flex items-center gap-2 text-[10px] text-gray-500">
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{
                backgroundColor:
                  REGIME_COLORS[segments[hoverSeg].quadrant] ?? "#9ca3af",
              }}
            />
            <span className="font-bold text-gray-700">
              {segments[hoverSeg].quadrant}
            </span>
            <span>
              {segments[hoverSeg].startDate}
              <ArrowRight className="w-2.5 h-2.5 inline mx-0.5" />
              {segments[hoverSeg].endDate}
            </span>
          </div>
        )}
        {hoverSeg === null && (
          <span className="text-[9px] text-gray-300">
            Hover to see regime periods
          </span>
        )}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {Object.entries(REGIME_COLORS).map(([name, color]) => (
          <span
            key={name}
            className="flex items-center gap-1 text-[9px] text-gray-400"
          >
            <span
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: color }}
            />
            {name}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────

export function GavekalQuadrant({ data, loading }: GavekalQuadrantProps) {
  const [expanded, setExpanded] = useState(false);
  const [hoveredCell, setHoveredCell] = useState<string | null>(null);

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

  const {
    quadrant,
    energyEfficiency,
    currencyQuality,
    keyRatios,
    exclusions,
    regimeHistory,
  } = data;

  return (
    <div className="rounded-lg bg-white border border-gray-200 shadow-sm p-3 sm:p-4 space-y-3">
      {/* Header strip */}
      <button
        type="button"
        className="flex items-center justify-between w-full text-left cursor-pointer"
        onClick={() => setExpanded((e) => !e)}
      >
        <div className="flex items-center gap-2">
          <div
            className={`p-1 rounded-md ${
              quadrant.score === 2
                ? "bg-emerald-50"
                : quadrant.score === -2
                  ? "bg-red-50"
                  : "bg-amber-50"
            }`}
          >
            <Grid3X3
              className={`w-3.5 h-3.5 ${
                quadrant.score === 2
                  ? "text-emerald-500"
                  : quadrant.score === -2
                    ? "text-red-500"
                    : "text-amber-500"
              }`}
            />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span
                className={`text-sm font-bold ${SCORE_COLORS[quadrant.score] ?? "text-gray-600"}`}
              >
                {quadrant.name}
              </span>
              <span
                className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                  quadrant.score === 2
                    ? "bg-emerald-100 text-emerald-700"
                    : quadrant.score === -2
                      ? "bg-red-100 text-red-700"
                      : "bg-gray-100 text-gray-600"
                }`}
              >
                {quadrant.score > 0 ? "+" : ""}
                {quadrant.score}
              </span>
            </div>
            <p className="text-[10px] text-gray-400 leading-tight">
              {quadrant.description}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="hidden sm:flex items-center gap-3 text-[10px] text-gray-400">
            <span>
              <span className="opacity-60">Energy </span>
              <span
                className={`font-bold ${energyEfficiency.signal === 1 ? "text-emerald-600" : "text-red-600"}`}
              >
                {energyEfficiency.signal === 1 ? "Boom" : "Bust"}
              </span>
            </span>
            <span>
              <span className="opacity-60">Currency </span>
              <span
                className={`font-bold ${currencyQuality.signal === 1 ? "text-emerald-600" : "text-red-600"}`}
              >
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

      {/* Quadrant Grid — with hover tooltips and animated active state */}
      <div className="grid grid-cols-2 gap-1.5">
        {QUADRANT_CELLS.map((cell) => {
          const active = cell.key === quadrant.name;
          const hovered = hoveredCell === cell.key;

          return (
            <div
              key={cell.key}
              className={`relative rounded-lg px-2.5 py-2 text-center transition-all duration-300 ease-out ${
                active
                  ? `${QUADRANT_BG[cell.key]} ring-2 ring-offset-1 ${QUADRANT_RING[cell.key]} scale-[1.02]`
                  : "bg-gray-50 text-gray-400 hover:bg-gray-100"
              }`}
              onMouseEnter={() => setHoveredCell(cell.key)}
              onMouseLeave={() => setHoveredCell(null)}
            >
              <div
                className={`text-[10px] font-semibold ${active ? "" : "opacity-60"}`}
              >
                {cell.label}
              </div>
              <div
                className={`text-[10px] ${active ? "font-bold" : "opacity-40"}`}
              >
                ({cell.score > 0 ? "+" : ""}
                {cell.score})
              </div>

              {/* Tooltip on hover (non-active cells) */}
              {hovered && !active && (
                <div className="absolute z-10 left-1/2 -translate-x-1/2 top-full mt-1 w-40 bg-gray-800 text-white text-[9px] rounded-md px-2.5 py-1.5 shadow-lg pointer-events-none animate-fade-in">
                  <div className="font-semibold mb-0.5">{cell.label}</div>
                  <div className="opacity-80">{cell.brief}</div>
                </div>
              )}

              {/* Tooltip on hover (active cell — show current data) */}
              {hovered && active && (
                <div className="absolute z-10 left-1/2 -translate-x-1/2 top-full mt-1 w-48 bg-gray-800 text-white text-[9px] rounded-md px-2.5 py-1.5 shadow-lg pointer-events-none animate-fade-in">
                  <div className="font-semibold mb-0.5">
                    Current: {cell.label}
                  </div>
                  <div className="opacity-80">{quadrant.description}</div>
                  <div className="mt-1 pt-1 border-t border-gray-600 opacity-70">
                    S&P/WTI: {energyEfficiency.current.toFixed(2)} vs{" "}
                    {energyEfficiency.ma7y.toFixed(2)} MA
                  </div>
                  <div className="opacity-70">
                    IEF/Gold: {currencyQuality.current.toFixed(2)} vs{" "}
                    {currencyQuality.ma7y.toFixed(2)} MA
                  </div>
                </div>
              )}
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
        <div className="space-y-4 pt-2 border-t border-gray-100 animate-fade-in">
          {/* Regime timeline */}
          {regimeHistory && regimeHistory.length > 0 && (
            <RegimeTimeline history={regimeHistory} />
          )}

          {/* Signal ratios with interactive charts */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <RatioChart
              ratio={energyEfficiency}
              icon={<Fuel className="w-3 h-3 text-gray-400" />}
            />
            <RatioChart
              ratio={currencyQuality}
              icon={<Coins className="w-3 h-3 text-gray-400" />}
            />
          </div>

          {/* Key supplementary ratios */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-gray-50 rounded-lg p-2.5">
              <div className="text-[10px] text-gray-500 mb-0.5">
                S&P 500 / Gold
              </div>
              <div className="text-sm font-bold text-gray-900">
                {keyRatios.spGold.current.toFixed(2)}
              </div>
              <div className="text-[10px] text-gray-400">
                7yMA: {keyRatios.spGold.ma7y.toFixed(2)}
              </div>
              <div
                className={`text-[10px] font-medium mt-0.5 ${
                  keyRatios.spGold.current > keyRatios.spGold.ma7y
                    ? "text-emerald-600"
                    : "text-red-600"
                }`}
              >
                {keyRatios.spGold.current > keyRatios.spGold.ma7y
                  ? "Equities outperforming gold"
                  : "Gold outperforming equities (monetary illusion?)"}
              </div>
            </div>
            <div className="bg-gray-50 rounded-lg p-2.5">
              <div className="text-[10px] text-gray-500 mb-0.5">
                Gold / WTI
              </div>
              <div className="text-sm font-bold text-gray-900">
                {keyRatios.goldWti.current.toFixed(2)}
              </div>
              <div className="text-[10px] text-gray-400">
                7yMA: {keyRatios.goldWti.ma7y.toFixed(2)}
              </div>
              <div
                className={`text-[10px] font-medium mt-0.5 ${
                  keyRatios.goldWti.current > keyRatios.goldWti.ma7y * 1.2
                    ? "text-red-600"
                    : keyRatios.goldWti.current > keyRatios.goldWti.ma7y
                      ? "text-amber-600"
                      : "text-emerald-600"
                }`}
              >
                {keyRatios.goldWti.current > keyRatios.goldWti.ma7y * 1.2
                  ? "Elevated — recession risk"
                  : keyRatios.goldWti.current > keyRatios.goldWti.ma7y
                    ? "Above average — energy cheap vs gold"
                    : "Normal range"}
              </div>
            </div>
          </div>

          {/* Investment implications — styled cards */}
          <div>
            <div className="text-xs font-semibold text-gray-700 mb-2 flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-gray-400" />
              Investment Implications
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-2.5">
                <div className="text-[10px] font-bold text-emerald-700 mb-1.5 flex items-center gap-1">
                  <TrendingUp className="w-3 h-3" />
                  What to own
                </div>
                {quadrant.buySignals.map((s) => (
                  <div
                    key={s}
                    className="text-[10px] text-emerald-800 flex items-center gap-1.5 py-0.5"
                  >
                    <span className="w-1 h-1 rounded-full bg-emerald-500 shrink-0" />
                    {s}
                  </div>
                ))}
              </div>
              <div className="bg-red-50 border border-red-200 rounded-lg p-2.5">
                <div className="text-[10px] font-bold text-red-700 mb-1.5 flex items-center gap-1">
                  <TrendingDown className="w-3 h-3" />
                  What to avoid
                </div>
                {quadrant.sellSignals.map((s) => (
                  <div
                    key={s}
                    className="text-[10px] text-red-800 flex items-center gap-1.5 py-0.5"
                  >
                    <span className="w-1 h-1 rounded-full bg-red-500 shrink-0" />
                    {s}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Browne exclusion rules */}
          {exclusions.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-gray-700 mb-2">
                Browne Portfolio Rules
              </div>
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
                    {ex.signal === "Warning" && (
                      <AlertTriangle className="w-3 h-3 text-red-500 shrink-0 mt-0.5" />
                    )}
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
