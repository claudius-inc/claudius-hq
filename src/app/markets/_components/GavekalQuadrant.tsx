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
  Activity,
  CheckCircle,
  AlertCircle,
  Zap,
  History,
  BarChart3,
} from "lucide-react";
import type {
  GavekalData,
  GavekalRatioData,
  GavekalRegimePoint,
  GavekalExclusionData,
  GavekalXleData,
  GavekalChangeEvent,
  GavekalRegimeReturns,
  PortfolioAllocation,
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

// Score text color: only the negative-score regime gets a warning hue.
// Neutral and positive regimes use neutral grays.
const SCORE_COLORS: Record<number, string> = {
  2: "text-gray-700",
  0: "text-gray-600",
  [-2]: "text-red-600",
};

// Active quadrant cell styling. All regimes neutral by default; only the
// negative (-2) Inflationary Bust regime keeps a red tint to flag downside.
const QUADRANT_ACTIVE: Record<string, string> = {
  "Inflationary Bust": "bg-red-50 text-red-700 border-red-300",
  "Inflationary Boom": "bg-gray-100 text-gray-800 border-gray-400",
  "Deflationary Bust": "bg-gray-100 text-gray-800 border-gray-400",
  "Deflationary Boom": "bg-gray-100 text-gray-800 border-gray-400",
};

// Chart/timeline fill colors — neutral grays for all regimes.
const REGIME_COLORS: Record<string, string> = {
  "Deflationary Boom": "#9ca3af",
  "Inflationary Boom": "#9ca3af",
  "Deflationary Bust": "#9ca3af",
  "Inflationary Bust": "#9ca3af",
};

const REGIME_BG_COLORS: Record<string, string> = {
  "Deflationary Boom": "bg-gray-50",
  "Inflationary Boom": "bg-gray-50",
  "Deflationary Bust": "bg-gray-50",
  "Inflationary Bust": "bg-gray-50",
};

const REGIME_TEXT_COLORS: Record<string, string> = {
  "Deflationary Boom": "text-gray-700",
  "Inflationary Boom": "text-gray-700",
  "Deflationary Bust": "text-gray-700",
  "Inflationary Bust": "text-gray-700",
};

const REGIME_BORDER_COLORS: Record<string, string> = {
  "Deflationary Boom": "border-gray-200",
  "Inflationary Boom": "border-gray-200",
  "Deflationary Bust": "border-gray-200",
  "Inflationary Bust": "border-gray-200",
};

// Historical mean for Gold/WTI ratio (~16 barrels per oz)
const GOLD_WTI_HISTORICAL_MEAN = 16;

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDuration(startDate: string, endDate: string): string {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const totalMonths =
    (end.getFullYear() - start.getFullYear()) * 12 +
    (end.getMonth() - start.getMonth());
  const years = Math.floor(totalMonths / 12);
  const months = totalMonths % 12;
  if (years === 0) return `${months}m`;
  if (months === 0) return `${years}y`;
  return `${years}y ${months}m`;
}

function formatShortDate(d: string): string {
  const date = new Date(d);
  return date.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
}

/** Compute intensity of deviation from MA as 0–1 value */
function deviationIntensity(current: number, ma: number): number {
  const pct = Math.abs((current - ma) / ma) * 100;
  return Math.min(1, pct / 50); // 50% deviation = max intensity
}

// ── Ratio Chart (interactive SVG with MA overlay + hover + date axis) ─────

function RatioChart({
  ratio,
  icon,
  height = 160,
}: {
  ratio: GavekalRatioData;
  icon: React.ReactNode;
  height?: number;
}) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const above = ratio.signal === 1;
  const pct = ((ratio.current - ratio.ma7y) / ratio.ma7y) * 100;
  const intensity = deviationIntensity(ratio.current, ratio.ma7y);

  if (!ratio.history.length) return null;

  const values = ratio.history.map((h) => h.value);
  const mas = ratio.history.map((h) => h.ma);
  const validMas = mas.filter((v): v is number => v !== null);
  const all = [...values, ...validMas];
  const min = Math.min(...all);
  const max = Math.max(...all);
  const range = max - min || 1;
  const pad = range * 0.05;

  const w = 400;
  const chartH = height - 20; // Reserve space for date axis
  const toY = (v: number) =>
    chartH - ((v - (min - pad)) / (range + pad * 2)) * chartH;
  const toX = (i: number) => (i / (values.length - 1)) * w;

  const valuePath = values
    .map((v, i) => `${i === 0 ? "M" : "L"}${toX(i)},${toY(v)}`)
    .join(" ");

  // Build MA path segments, breaking on nulls
  const maSegments: string[] = [];
  let seg = "";
  for (let i = 0; i < mas.length; i++) {
    if (mas[i] !== null) {
      seg += `${seg === "" ? "M" : "L"}${toX(i)},${toY(mas[i]!)} `;
    } else if (seg) {
      maSegments.push(seg.trim());
      seg = "";
    }
  }
  if (seg) maSegments.push(seg.trim());
  const maPath = maSegments.join(" ");

  // Fill area between value and bottom
  const fillPath = `${valuePath} L${toX(values.length - 1)},${chartH} L${toX(0)},${chartH} Z`;

  // Find crossover points (where ratio crosses MA)
  const crossovers: { idx: number; direction: "up" | "down" }[] = [];
  for (let i = 1; i < values.length; i++) {
    if (mas[i] === null || mas[i - 1] === null) continue;
    const prevAbove = values[i - 1] > mas[i - 1]!;
    const currAbove = values[i] > mas[i]!;
    if (prevAbove !== currAbove) {
      crossovers.push({ idx: i, direction: currAbove ? "up" : "down" });
    }
  }

  // Date axis labels — show years
  const dateLabels: { idx: number; label: string }[] = [];
  let lastYear = "";
  for (let i = 0; i < ratio.history.length; i++) {
    const year = ratio.history[i].date.substring(0, 4);
    if (year !== lastYear) {
      dateLabels.push({ idx: i, label: year });
      lastYear = year;
    }
  }

  const hoverPoint = hoverIdx !== null ? ratio.history[hoverIdx] : null;

  // Neutral by default; only highlight negative deviation (below MA) with red.
  // Intensity scales the alpha so larger downside moves read more strongly.
  const pctColor = above
    ? `rgba(75, 85, 99, ${0.5 + intensity * 0.5})` // gray-600
    : `rgba(239, 68, 68, ${0.4 + intensity * 0.6})`; // red-500

  return (
    <div className="bg-gray-50 rounded-lg p-3">
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1.5">
          {icon}
          <span className="text-[11px] font-medium text-gray-500">
            {ratio.label}
          </span>
        </div>
        <div
          className={`flex items-center gap-0.5 text-xs font-bold ${above ? "text-gray-600" : "text-red-600"}`}
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
        <span className="text-lg font-bold text-gray-900">
          {ratio.current.toFixed(2)}
        </span>
        <span className="text-xs text-gray-400">
          vs {ratio.ma7y.toFixed(2)}
        </span>
        <span
          className="text-xs font-bold px-1.5 py-0.5 rounded"
          style={{
            color: pctColor,
            backgroundColor: above
              ? `rgba(75, 85, 99, ${0.05 + intensity * 0.1})`
              : `rgba(239, 68, 68, ${0.05 + intensity * 0.1})`,
          }}
        >
          {pct >= 0 ? "+" : ""}
          {pct.toFixed(1)}%
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
            {hoverPoint.ma !== null && (
              <span>
                7yMA:{" "}
                <span className="font-bold text-gray-400">
                  {hoverPoint.ma.toFixed(4)}
                </span>
              </span>
            )}
          </div>
        )}
      </div>

      {/* Chart */}
      <svg
        viewBox={`0 0 ${w} ${height}`}
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
        {/* Fill area — neutral gray */}
        <path d={fillPath} fill="#6b728015" />

        {/* MA line */}
        <path
          d={maPath}
          fill="none"
          stroke="#9ca3af"
          strokeWidth="1.5"
          strokeDasharray="4 2"
        />

        {/* Value line — neutral gray */}
        <path d={valuePath} fill="none" stroke="#6b7280" strokeWidth="2" />

        {/* Crossover annotations — neutral gray */}
        {crossovers.map((co, i) => (
          <g key={i}>
            <circle
              cx={toX(co.idx)}
              cy={toY(values[co.idx])}
              r="4"
              fill="#6b7280"
              stroke="white"
              strokeWidth="1.5"
            />
            <line
              x1={toX(co.idx)}
              y1={toY(values[co.idx]) - 6}
              x2={toX(co.idx)}
              y2={toY(values[co.idx]) + 6}
              stroke="#6b7280"
              strokeWidth="0.5"
              opacity="0.5"
            />
          </g>
        ))}

        {/* Date axis */}
        {dateLabels.map((dl) => (
          <g key={dl.idx}>
            <line
              x1={toX(dl.idx)}
              y1={chartH}
              x2={toX(dl.idx)}
              y2={chartH + 3}
              stroke="#d1d5db"
              strokeWidth="0.5"
            />
            <text
              x={toX(dl.idx)}
              y={height - 2}
              textAnchor="middle"
              fill="#9ca3af"
              fontSize="9"
              fontFamily="sans-serif"
            >
              {dl.label}
            </text>
          </g>
        ))}

        {/* Hover crosshair */}
        {hoverIdx !== null && (
          <>
            <line
              x1={toX(hoverIdx)}
              y1={0}
              x2={toX(hoverIdx)}
              y2={chartH}
              stroke="#6b7280"
              strokeWidth="0.5"
              strokeDasharray="2 2"
            />
            <circle
              cx={toX(hoverIdx)}
              cy={toY(values[hoverIdx])}
              r="3"
              fill="#6b7280"
              stroke="white"
              strokeWidth="1.5"
            />
            {mas[hoverIdx] !== null && (
              <circle
                cx={toX(hoverIdx)}
                cy={toY(mas[hoverIdx]!)}
                r="2.5"
                fill="#9ca3af"
                stroke="white"
                strokeWidth="1"
              />
            )}
          </>
        )}
      </svg>

      {/* Legend */}
      <div className="flex items-center gap-3 mt-1.5 text-[9px] text-gray-400">
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-[2px] bg-gray-500" />
          Ratio
        </span>
        <span className="flex items-center gap-1">
          <span
            className="inline-block w-3 h-[2px] bg-gray-400"
            style={{ borderTop: "1px dashed #9ca3af" }}
          />
          7yr MA
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-2 h-2 rounded-full bg-gray-500 opacity-60" />
          Crossover
        </span>
      </div>
    </div>
  );
}

// ── Regime Timeline (expanded with duration labels) ───────────────────────

// Distinct shades for the regime timeline so the four regimes stay
// distinguishable on a single bar while honoring the neutral palette.
// Inflationary Bust uses a soft red since it's the −2 (negative) regime.
const REGIME_TIMELINE_COLORS: Record<string, string> = {
  "Deflationary Boom": "#e5e7eb", // gray-200
  "Inflationary Boom": "#9ca3af", // gray-400
  "Deflationary Bust": "#6b7280", // gray-500
  "Inflationary Bust": "#fca5a5", // red-300
};

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

  const startMs = segments[0].startMs;
  const endMs = segments[segments.length - 1].endMs;
  const totalMs = endMs - startMs;
  if (totalMs <= 0) return null;

  const currentSegment = segments[segments.length - 1];
  const currentDuration = formatDuration(currentSegment.startDate, now);
  const currentColor =
    REGIME_TIMELINE_COLORS[currentSegment.quadrant] ?? "#9ca3af";

  // Year tick marks across the full span. Cadence adapts to span length so
  // we never crowd the axis: ≤8y → yearly, ≤20y → every 2y, otherwise every 5y.
  const startYear = new Date(startMs).getFullYear();
  const endYear = new Date(endMs).getFullYear();
  const yearSpan = endYear - startYear;
  const yearStep = yearSpan <= 8 ? 1 : yearSpan <= 20 ? 2 : 5;
  const yearTicks: { year: number; pct: number }[] = [];
  const firstTick = Math.ceil(startYear / yearStep) * yearStep;
  for (let y = firstTick; y <= endYear; y += yearStep) {
    const ms = new Date(`${y}-01-01`).getTime();
    if (ms < startMs || ms > endMs) continue;
    yearTicks.push({ year: y, pct: ((ms - startMs) / totalMs) * 100 });
  }

  const hovered = hoverSeg !== null ? segments[hoverSeg] : null;

  return (
    <div className="space-y-2">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5 text-gray-400" />
          <span className="text-[11px] font-semibold text-gray-700">
            Regime History
          </span>
          <span className="text-[10px] text-gray-400">
            {formatShortDate(segments[0].startDate)} – Now ({yearSpan}y)
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-[10px]">
          <span className="text-gray-400">Current:</span>
          <span
            className="w-2 h-2 rounded-full shrink-0"
            style={{ backgroundColor: currentColor }}
          />
          <span className="font-bold text-gray-700">
            {currentSegment.quadrant}
          </span>
          <span className="text-gray-400 tabular-nums">{currentDuration}</span>
        </div>
      </div>

      {/* Timeline bar — segments are absolutely positioned by start% + width%
          so sub-month flicker segments stay rendered (as 1px slivers) and
          no whitespace accumulates at the right edge from flex collapse. */}
      <div className="relative">
        <div className="relative h-7 rounded-md overflow-hidden border border-gray-200 bg-gray-100">
          {segments.map((seg, i) => {
            const startPct = ((seg.startMs - startMs) / totalMs) * 100;
            const widthPct = ((seg.endMs - seg.startMs) / totalMs) * 100;
            const showLabel = widthPct > 6;
            const duration = formatDuration(seg.startDate, seg.endDate);
            const isHovered = hoverSeg === i;
            const dim = hoverSeg !== null && !isHovered;

            return (
              <div
                key={i}
                className="absolute top-0 bottom-0 flex items-center justify-center transition-opacity duration-150 overflow-hidden cursor-pointer"
                style={{
                  left: `${startPct}%`,
                  width: `${widthPct}%`,
                  minWidth: "1px",
                  backgroundColor:
                    REGIME_TIMELINE_COLORS[seg.quadrant] ?? "#9ca3af",
                  opacity: dim ? 0.4 : 1,
                }}
                onMouseEnter={() => setHoverSeg(i)}
                onMouseLeave={() => setHoverSeg(null)}
              >
                {showLabel && (
                  <span
                    className={`text-[8px] font-bold truncate px-1 ${
                      seg.quadrant === "Deflationary Boom"
                        ? "text-gray-600"
                        : "text-white/90"
                    }`}
                  >
                    {duration}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* Year tick axis — labels at the edges anchor to that edge
            instead of overflowing the bar */}
        <div className="relative h-3 mt-0.5">
          {yearTicks.map((t) => {
            const labelTransform =
              t.pct < 4
                ? "translateX(0)"
                : t.pct > 96
                  ? "translateX(-100%)"
                  : "translateX(-50%)";
            return (
              <div
                key={t.year}
                className="absolute top-0"
                style={{ left: `${t.pct}%` }}
              >
                <div className="w-px h-1 bg-gray-300 -translate-x-1/2 absolute" />
                <span
                  className="text-[8px] text-gray-400 leading-none tabular-nums absolute top-1.5 whitespace-nowrap"
                  style={{ transform: labelTransform }}
                >
                  {t.year}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Hover detail */}
      <div className="h-5">
        {hovered ? (
          <div className="flex items-center gap-2 text-[10px]">
            <span
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{
                backgroundColor:
                  REGIME_TIMELINE_COLORS[hovered.quadrant] ?? "#9ca3af",
              }}
            />
            <span className="font-bold text-gray-700">{hovered.quadrant}</span>
            <span className="text-gray-400 tabular-nums">
              {formatShortDate(hovered.startDate)}
              <ArrowRight className="w-2.5 h-2.5 inline mx-0.5" />
              {hoverSeg === segments.length - 1
                ? "Present"
                : formatShortDate(hovered.endDate)}
            </span>
            <span className="font-medium text-gray-600 tabular-nums">
              ({formatDuration(hovered.startDate, hovered.endDate)})
            </span>
          </div>
        ) : (
          <span className="text-[9px] text-gray-300">
            Hover a segment for details
          </span>
        )}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {Object.entries(REGIME_TIMELINE_COLORS).map(([name, color]) => (
          <span
            key={name}
            className="flex items-center gap-1 text-[9px] text-gray-500"
          >
            <span
              className="w-2.5 h-2.5 rounded-sm border border-black/5"
              style={{ backgroundColor: color }}
            />
            {name}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Browne Portfolio Rule Card ────────────────────────────────────────────

function ExclusionCard({ ex }: { ex: GavekalExclusionData }) {
  const isWarning = ex.signal === "Warning";
  const isCaution = ex.signal === "Caution";
  const isPositive = ex.signal === "Own equities" || ex.signal === "Own bonds";

  let badgeColor: string;
  let badgeBg: string;
  let borderColor: string;
  let IconComponent: typeof CheckCircle;

  if (isWarning) {
    badgeColor = "text-red-700";
    badgeBg = "bg-red-100";
    borderColor = "border-red-200";
    IconComponent = AlertTriangle;
  } else if (isCaution) {
    badgeColor = "text-amber-700";
    badgeBg = "bg-amber-100";
    borderColor = "border-amber-200";
    IconComponent = AlertCircle;
  } else if (isPositive) {
    badgeColor = "text-gray-700";
    badgeBg = "bg-gray-100";
    borderColor = "border-gray-200";
    IconComponent = CheckCircle;
  } else {
    badgeColor = "text-gray-700";
    badgeBg = "bg-gray-100";
    borderColor = "border-gray-200";
    IconComponent = Activity;
  }

  return (
    <div
      className={`flex items-start gap-2.5 rounded-lg border px-3 py-2.5 ${borderColor} bg-white`}
    >
      <div className={`p-1 rounded-md ${badgeBg} shrink-0 mt-0.5`}>
        <IconComponent className={`w-3.5 h-3.5 ${badgeColor}`} />
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-[11px] font-semibold text-gray-700">
            {ex.name}
          </span>
          <span
            className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${badgeBg} ${badgeColor}`}
          >
            {ex.signal}
          </span>
        </div>
        <p className="text-[10px] text-gray-500 leading-snug">
          {ex.description}
        </p>
      </div>
    </div>
  );
}

// ── XLE Sub-Panel ───────────────────────────────────────────────────────────

function XlePanel({ xle }: { xle: GavekalXleData }) {
  return (
    <div className="bg-gray-50 rounded-lg p-3">
      <div className="flex items-center gap-1.5 mb-2">
        <Zap className="w-3.5 h-3.5 text-gray-500" />
        <span className="text-[11px] font-semibold text-gray-700">
          Energy Sector (XLE)
        </span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div>
          <div className="text-[9px] text-gray-400 uppercase">Price</div>
          <div className="text-sm font-bold text-gray-900">
            {xle.price ? `$${xle.price.toFixed(2)}` : "\u2014"}
          </div>
          {xle.changePercent != null && (
            <div
              className={`text-[10px] tabular-nums ${xle.changePercent >= 0 ? "text-gray-600" : "text-red-600"}`}
            >
              {xle.changePercent >= 0 ? "+" : ""}
              {xle.changePercent.toFixed(2)}%
            </div>
          )}
        </div>
        <div>
          <div className="text-[9px] text-gray-400 uppercase">Trailing P/E</div>
          <div className="text-sm font-bold text-gray-900">
            {xle.trailingPE ? `${xle.trailingPE.toFixed(1)}x` : "\u2014"}
          </div>
        </div>
        <div>
          <div className="text-[9px] text-gray-400 uppercase">Div Yield</div>
          <div className="text-sm font-bold text-gray-900">
            {xle.dividendYield ? `${xle.dividendYield.toFixed(1)}%` : "\u2014"}
          </div>
        </div>
        <div>
          <div className="text-[9px] text-gray-400 uppercase">XLE / SPY</div>
          <div className="text-sm font-bold text-gray-900">
            {xle.xleSpyRatio ? xle.xleSpyRatio.toFixed(3) : "\u2014"}
          </div>
          <div className="text-[9px] text-gray-400">Relative strength</div>
        </div>
      </div>
    </div>
  );
}

// ── What Changed Changelog ──────────────────────────────────────────────────

function ChangelogPanel({ events }: { events: GavekalChangeEvent[] }) {
  if (!events.length) return null;

  const typeIcon = (type: string) => {
    if (type === "regime_change")
      return <Activity className="w-3 h-3 text-gray-500" />;
    if (type === "threshold")
      return <AlertTriangle className="w-3 h-3 text-amber-500" />;
    return <ArrowRight className="w-3 h-3 text-gray-400" />;
  };

  return (
    <div>
      <div className="text-xs font-semibold text-gray-700 mb-2 flex items-center gap-1.5">
        <History className="w-3.5 h-3.5 text-gray-400" />
        What Changed
      </div>
      <div className="space-y-1.5">
        {events.map((ev, i) => (
          <div
            key={i}
            className="flex items-start gap-2 text-[10px] bg-gray-50 rounded-lg px-2.5 py-1.5"
          >
            <div className="mt-0.5 shrink-0">{typeIcon(ev.type)}</div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-bold text-gray-700">{ev.signal}</span>
                <span className="text-gray-400">
                  {formatShortDate(ev.date)}
                </span>
              </div>
              <p className="text-gray-500 leading-snug">{ev.description}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Historical Regime Returns ───────────────────────────────────────────────

function RegimeReturnsPanel({
  currentQuadrant,
  regimeReturns,
}: {
  currentQuadrant: string;
  regimeReturns: Record<string, GavekalRegimeReturns>;
}) {
  const returns = regimeReturns[currentQuadrant];
  if (!returns) return null;

  const assets = [
    { label: "Equities", value: returns.equities },
    { label: "Bonds", value: returns.bonds },
    { label: "Gold", value: returns.gold },
    { label: "Commodities", value: returns.commodities },
    { label: "Cash", value: returns.cash },
  ];

  return (
    <div>
      <div className="text-xs font-semibold text-gray-700 mb-2 flex items-center gap-1.5">
        <BarChart3 className="w-3.5 h-3.5 text-gray-400" />
        Historical Returns in {currentQuadrant}
      </div>
      <div className="grid grid-cols-5 gap-1.5">
        {assets.map((a) => (
          <div key={a.label} className="bg-gray-50 rounded-lg p-2 text-center">
            <div className="text-[9px] text-gray-400 mb-0.5">{a.label}</div>
            <div
              className={`text-sm font-bold ${a.value < 0 ? "text-red-600" : "text-gray-700"}`}
            >
              {a.value > 0 ? "+" : ""}
              {a.value}%
            </div>
            <div className="text-[8px] text-gray-300">ann.</div>
          </div>
        ))}
      </div>
      <p className="text-[8px] text-gray-400 mt-1.5">
        Approximate annualized real returns based on historical regime periods.
        Past performance does not predict future results.
      </p>
    </div>
  );
}

// ── Portfolio Allocation Table ──────────────────────────────────────────────

function AllocationTable({
  allocations,
  regimeName,
}: {
  allocations: PortfolioAllocation[];
  regimeName: string;
}) {
  const bgColor = REGIME_BG_COLORS[regimeName] ?? "bg-gray-50";
  const textColor = REGIME_TEXT_COLORS[regimeName] ?? "text-gray-700";
  const borderColor = REGIME_BORDER_COLORS[regimeName] ?? "border-gray-200";

  return (
    <div className={`rounded-lg border ${borderColor} ${bgColor} p-2.5`}>
      <div className="flex items-center gap-1.5 mb-2">
        <span className={`text-[11px] font-semibold ${textColor}`}>
          Recommended Allocation
        </span>
      </div>
      <table className="w-full text-[10px]">
        <tbody>
          {allocations.map((row, i) => (
            <tr key={i} className="border-b border-black/5 last:border-0">
              <td className="py-1 pr-2">
                <div className="text-gray-700 font-medium">
                  {row.asset}{" "}
                  <span className="text-gray-500 font-mono text-[9px] ml-1">
                    {row.vehicle}
                  </span>
                </div>
              </td>
              <td className="py-1 text-right font-bold text-gray-800 align-top">
                {row.weight}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────

export function GavekalQuadrant({ data, loading }: GavekalQuadrantProps) {
  const [expanded, setExpanded] = useState(false);
  const [hoveredCell, setHoveredCell] = useState<string | null>(null);
  const [selectedCell, setSelectedCell] = useState<string | null>(null);

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

  // Compute Gold/WTI deviation from historical mean
  const goldWtiDeviation = keyRatios.goldWti.current / GOLD_WTI_HISTORICAL_MEAN;

  // Compute momentum (rate of change) for key ratios from history
  const computeMomentum = (
    ratio: GavekalRatioData,
  ): { direction: string; label: string } => {
    const hist = ratio.history;
    if (hist.length < 5) return { direction: "flat", label: "Stable" };
    const recent = hist[hist.length - 1].value;
    const prior = hist[Math.max(0, hist.length - 5)].value;
    const change = ((recent - prior) / prior) * 100;
    if (change > 2)
      return {
        direction: "up",
        label: `Accelerating (+${change.toFixed(1)}%)`,
      };
    if (change < -2)
      return {
        direction: "down",
        label: `Decelerating (${change.toFixed(1)}%)`,
      };
    return { direction: "flat", label: "Stable" };
  };

  const energyMomentum = computeMomentum(energyEfficiency);
  const currencyMomentum = computeMomentum(currencyQuality);

  return (
    <div className="rounded-lg bg-white border border-gray-200 shadow-sm p-3 sm:p-4 space-y-3">
      {/* Header — regime label as hero element with prominent banner */}
      <button
        type="button"
        className="flex items-center justify-between w-full text-left cursor-pointer"
        onClick={() => setExpanded((e) => !e)}
      >
        <div className="flex items-center gap-3">
          <div
            className={`p-1.5 rounded-lg ${REGIME_BG_COLORS[quadrant.name] ?? "bg-gray-50"}`}
          >
            <Grid3X3
              className={`w-4 h-4 ${REGIME_TEXT_COLORS[quadrant.name] ?? "text-gray-500"}`}
            />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span
                className={`text-base sm:text-lg font-extrabold tracking-tight ${SCORE_COLORS[quadrant.score] ?? "text-gray-600"}`}
              >
                {quadrant.name}
              </span>
              <span
                className={`text-xs font-bold px-2 py-0.5 rounded-md ${
                  quadrant.score === -2
                    ? "bg-red-100 text-red-700"
                    : "bg-gray-100 text-gray-600"
                }`}
              >
                {quadrant.score > 0 ? "+" : ""}
                {quadrant.score}
              </span>
            </div>
            <p className="text-[11px] text-gray-400 leading-tight mt-0.5">
              {quadrant.description}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="hidden sm:flex items-center gap-3 text-[10px] text-gray-400">
            <span>
              <span className="opacity-60">Energy </span>
              <span
                className={`font-bold ${energyEfficiency.signal === 1 ? "text-gray-600" : "text-red-600"}`}
              >
                {energyEfficiency.signal === 1 ? "Boom" : "Bust"}
              </span>
            </span>
            <span>
              <span className="opacity-60">Currency </span>
              <span
                className={`font-bold ${currencyQuality.signal === 1 ? "text-gray-600" : "text-red-600"}`}
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

      {/* Quadrant Grid + Allocation Table — side by side on lg+ */}
      <div className="flex flex-col lg:flex-row gap-3">
        {/* Quadrant Grid */}
        <div className="flex-1 min-w-0">
          <div className="grid grid-cols-2 gap-1.5">
            {QUADRANT_CELLS.map((cell) => {
              const active = cell.key === quadrant.name;
              const hovered = hoveredCell === cell.key;
              const selected = selectedCell === cell.key;

              return (
                <div
                  key={cell.key}
                  className={`relative rounded-lg px-2.5 py-2 text-center transition-all duration-300 ease-out border-2 cursor-pointer ${
                    active
                      ? QUADRANT_ACTIVE[cell.key]
                      : selected
                        ? `${REGIME_BG_COLORS[cell.key] ?? "bg-gray-50"} ${REGIME_TEXT_COLORS[cell.key] ?? "text-gray-600"} ${REGIME_BORDER_COLORS[cell.key] ?? "border-gray-200"} opacity-80`
                        : "bg-gray-50 text-gray-400 border-transparent hover:bg-gray-100"
                  }`}
                  onClick={() => setSelectedCell(selected ? null : cell.key)}
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
          <div className="flex justify-between text-[9px] text-gray-300 px-1 mt-1.5">
            <span>Bad currency (inflation)</span>
            <span>Good currency (deflation)</span>
          </div>
        </div>

        {/* Portfolio Allocation Table — sourced from API (src/lib/gavekal.ts)
            so client and server stay in sync */}
        <div className="lg:w-[280px] shrink-0">
          <AllocationTable
            allocations={data.portfolioAllocation ?? []}
            regimeName={quadrant.name}
          />
        </div>
      </div>

      {/* Selected quadrant detail panel */}
      {selectedCell &&
        selectedCell !== quadrant.name &&
        data.regimeReturns &&
        data.regimeReturns[selectedCell] &&
        (() => {
          const cellData = QUADRANT_CELLS.find((c) => c.key === selectedCell);
          const qDef = {
            "Deflationary Boom": {
              buy: [
                "Growth equities",
                "Long-duration assets",
                "Corporate bonds",
              ],
              sell: ["Gold", "Commodities"],
            },
            "Inflationary Boom": {
              buy: ["Gold & commodities", "Real estate", "Value stocks"],
              sell: ["Long-term bonds", "Growth equities"],
            },
            "Deflationary Bust": {
              buy: ["Government bonds", "Cash", "Defensive equities"],
              sell: ["Cyclicals", "Commodities"],
            },
            "Inflationary Bust": {
              buy: ["Cash", "Energy stocks", "Short-duration TIPS"],
              sell: ["Financial assets", "Long bonds"],
            },
          }[selectedCell];
          const returns = data.regimeReturns![selectedCell];
          return (
            <div
              className={`rounded-lg border p-3 space-y-2 animate-fade-in ${REGIME_BORDER_COLORS[selectedCell] ?? "border-gray-200"} ${REGIME_BG_COLORS[selectedCell] ?? "bg-gray-50"}`}
            >
              <div className="flex items-center justify-between">
                <span
                  className={`text-xs font-bold ${REGIME_TEXT_COLORS[selectedCell] ?? "text-gray-700"}`}
                >
                  {selectedCell}
                </span>
                <button
                  onClick={() => setSelectedCell(null)}
                  className="text-[9px] text-gray-400 hover:text-gray-600"
                >
                  Close
                </button>
              </div>
              <p className="text-[10px] text-gray-500">{cellData?.brief}</p>
              <div className="grid grid-cols-5 gap-1">
                {[
                  { label: "Eq", value: returns.equities },
                  { label: "Bond", value: returns.bonds },
                  { label: "Gold", value: returns.gold },
                  { label: "Cmdty", value: returns.commodities },
                  { label: "Cash", value: returns.cash },
                ].map((a) => (
                  <div key={a.label} className="text-center">
                    <div className="text-[8px] text-gray-400">{a.label}</div>
                    <div
                      className={`text-[10px] font-bold ${a.value < 0 ? "text-red-600" : "text-gray-700"}`}
                    >
                      {a.value > 0 ? "+" : ""}
                      {a.value}%
                    </div>
                  </div>
                ))}
              </div>
              {qDef && (
                <div className="flex gap-3 text-[9px]">
                  <div>
                    <span className="font-bold text-gray-700">Own:</span>{" "}
                    {qDef.buy.join(", ")}
                  </div>
                  <div>
                    <span className="font-bold text-red-600">Avoid:</span>{" "}
                    {qDef.sell.join(", ")}
                  </div>
                </div>
              )}
            </div>
          );
        })()}

      {/* Expanded detail */}
      {expanded && (
        <div className="space-y-4 pt-2 border-t border-gray-100 animate-fade-in">
          {/* Regime timeline */}
          {regimeHistory && regimeHistory.length > 0 && (
            <RegimeTimeline history={regimeHistory} />
          )}

          {/* Signal ratios with interactive charts — larger */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <RatioChart
                ratio={energyEfficiency}
                icon={<Fuel className="w-3.5 h-3.5 text-gray-400" />}
              />
              <div className="flex items-center gap-1.5 px-1">
                <Activity className="w-3 h-3 text-gray-300" />
                <span className="text-[9px] text-gray-400">
                  Momentum:{" "}
                  <span
                    className={`font-medium ${
                      energyMomentum.direction === "down"
                        ? "text-red-600"
                        : "text-gray-600"
                    }`}
                  >
                    {energyMomentum.label}
                  </span>
                </span>
              </div>
            </div>
            <div className="space-y-1.5">
              <RatioChart
                ratio={currencyQuality}
                icon={<Coins className="w-3.5 h-3.5 text-gray-400" />}
              />
              <div className="flex items-center gap-1.5 px-1">
                <Activity className="w-3 h-3 text-gray-300" />
                <span className="text-[9px] text-gray-400">
                  Momentum:{" "}
                  <span
                    className={`font-medium ${
                      currencyMomentum.direction === "down"
                        ? "text-red-600"
                        : "text-gray-600"
                    }`}
                  >
                    {currencyMomentum.label}
                  </span>
                </span>
              </div>
            </div>
          </div>

          {/* Key supplementary ratios with deviation analysis */}
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
                    ? "text-gray-600"
                    : "text-red-600"
                }`}
              >
                {keyRatios.spGold.current > keyRatios.spGold.ma7y
                  ? "Equities outperforming gold"
                  : "Gold outperforming equities (monetary illusion?)"}
              </div>
            </div>
            <div className="bg-gray-50 rounded-lg p-2.5">
              <div className="text-[10px] text-gray-500 mb-0.5">Gold / WTI</div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-sm font-bold text-gray-900">
                  {keyRatios.goldWti.current.toFixed(2)}
                </span>
                <span className="text-[9px] text-gray-400">bbl/oz</span>
              </div>
              <div className="text-[10px] text-gray-400">
                7yMA: {keyRatios.goldWti.ma7y.toFixed(2)}
              </div>
              <div className="text-[10px] text-gray-400 mt-0.5">
                Hist. mean: ~{GOLD_WTI_HISTORICAL_MEAN} bbl/oz
              </div>
              <div
                className={`text-[10px] font-bold mt-1 px-1.5 py-0.5 rounded inline-block ${
                  goldWtiDeviation > 2
                    ? "bg-red-100 text-red-700"
                    : goldWtiDeviation > 1.5
                      ? "bg-amber-100 text-amber-700"
                      : "bg-gray-100 text-gray-700"
                }`}
              >
                {goldWtiDeviation.toFixed(1)}x above mean
                {goldWtiDeviation > 2 && " — recession risk"}
              </div>
            </div>
          </div>

          {/* Investment implications — styled cards with regime colors */}
          <div>
            <div className="text-xs font-semibold text-gray-700 mb-2 flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-gray-400" />
              Investment Implications
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-2.5">
                <div className="text-[10px] font-bold text-gray-700 mb-1.5 flex items-center gap-1">
                  <TrendingUp className="w-3 h-3" />
                  What to own
                </div>
                {quadrant.buySignals.map((s) => (
                  <div
                    key={s}
                    className="text-[10px] text-gray-700 flex items-center gap-1.5 py-0.5"
                  >
                    <span className="w-1 h-1 rounded-full bg-gray-500 shrink-0" />
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

          {/* XLE Energy Sub-Panel */}
          {data.xle && <XlePanel xle={data.xle} />}

          {/* Historical Regime Returns */}
          {data.regimeReturns && (
            <RegimeReturnsPanel
              currentQuadrant={quadrant.name}
              regimeReturns={data.regimeReturns}
            />
          )}

          {/* What Changed Changelog */}
          {data.changelog && data.changelog.length > 0 && (
            <ChangelogPanel events={data.changelog} />
          )}

          {/* Browne Portfolio Rules — redesigned as status indicator cards */}
          {exclusions.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-gray-700 mb-2 flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5 text-gray-400" />
                Browne Portfolio Rules
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {exclusions.map((ex) => (
                  <ExclusionCard key={ex.name} ex={ex} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
