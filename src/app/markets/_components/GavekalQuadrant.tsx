"use client";

import { useState } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Skeleton } from "@/components/Skeleton";
import { Modal } from "@/components/ui/Modal";
import { RefreshIndicator } from "@/components/ui/RefreshIndicator";
import {
  Shield,
  Maximize2,
  ArrowRight,
  Activity,
  CheckCircle,
  AlertCircle,
  Zap,
  Info,
  ChevronUpCircle,
  ChevronDownCircle,
  MinusCircle,
} from "lucide-react";
import type {
  GavekalData,
  GavekalRatioData,
  GavekalRegimePoint,
  GavekalXleData,
  PortfolioAllocation,
} from "../_lib/types";

interface GavekalQuadrantProps {
  data: GavekalData | null;
  loading: boolean;
  refreshing?: boolean;
}

const QUADRANT_CELLS = [
  {
    key: "Inflationary Bust",
    label: "Inflationary Bust",
    score: -2,
    mood: "Stagflation",
    brief: "Stocks struggle while oil & gold both run — worst macro mix",
  },
  {
    key: "Inflationary Boom",
    label: "Inflationary Boom",
    score: 0,
    mood: "Reflation",
    brief: "Equities advance but inflation eats real returns",
  },
  {
    key: "Deflationary Bust",
    label: "Deflationary Bust",
    score: 0,
    mood: "Recession",
    brief: "Recession risk — bonds and cash beat real assets",
  },
  {
    key: "Deflationary Boom",
    label: "Deflationary Boom",
    score: +2,
    mood: "Goldilocks",
    brief: "Goldilocks — equities & bonds both win, hard assets lag",
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
  if (years === 0 && months === 0) return "<1m";
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

/** Compute the ratio's momentum — % change over the last ~4 months. The
 *  history is sampled monthly (see buildRatio in src/lib/gavekal.ts), so
 *  comparing the last point against the 5th-from-last gives a ~4-month look-
 *  back. The ±2% band is treated as "stable". */
function computeMomentum(ratio: GavekalRatioData): {
  direction: "up" | "down" | "flat";
  change: number;
  label: string;
} {
  const hist = ratio.history;
  if (hist.length < 5) return { direction: "flat", change: 0, label: "Stable" };
  const recent = hist[hist.length - 1].value;
  const prior = hist[Math.max(0, hist.length - 5)].value;
  const change = ((recent - prior) / prior) * 100;
  if (change > 2)
    return {
      direction: "up",
      change,
      label: `Accelerating (+${change.toFixed(1)}%)`,
    };
  if (change < -2)
    return {
      direction: "down",
      change,
      label: `Decelerating (${change.toFixed(1)}%)`,
    };
  return { direction: "flat", change, label: "Stable" };
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
  const momentum = computeMomentum(ratio);

  // The currency-quality ratio (10y UST total return / gold) maps directly
  // to a Browne Dynamic asset choice (Gave, Ch. 8): above MA → hold bonds,
  // below MA → hold gold. Detect it and render the chart with regime
  // background shading + an actionable top-right label.
  const isCurrencyChart = ratio.label.includes("Gold");

  // Regime band fill colors — shared between SVG <rect> shading and the
  // legend swatches so they cannot drift apart.
  const BONDS_BAND_FILL = "rgba(59, 130, 246, 0.08)";
  const GOLD_BAND_FILL = "rgba(245, 158, 11, 0.10)";
  const BOOMS_BAND_FILL = "rgba(16, 185, 129, 0.08)"; // emerald-500 @ 8%
  const BUSTS_BAND_FILL = "rgba(239, 68, 68, 0.08)"; // red-500 @ 8%

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

  // Regime segments — contiguous runs on the same side of the MA. Used by
  // both charts for background shading: currency chart maps to bonds/gold,
  // energy chart maps to booms/busts. Skip the bootstrap window where MA is
  // still null.
  const regimeSegments: { startIdx: number; endIdx: number; above: boolean }[] =
    [];
  {
    let segStart: number | null = null;
    let segAbove: boolean | null = null;
    for (let i = 0; i < values.length; i++) {
      if (mas[i] === null) continue;
      const isAbove = values[i] > mas[i]!;
      if (segStart === null) {
        segStart = i;
        segAbove = isAbove;
      } else if (isAbove !== segAbove) {
        regimeSegments.push({
          startIdx: segStart,
          endIdx: i,
          above: segAbove!,
        });
        segStart = i;
        segAbove = isAbove;
      }
    }
    if (segStart !== null && segAbove !== null) {
      regimeSegments.push({
        startIdx: segStart,
        endIdx: values.length - 1,
        above: segAbove,
      });
    }
  }

  // Date axis labels — pick a year-step that yields ~5 readable labels
  // regardless of how many years the chart spans.
  const dateLabels: { idx: number; label: string }[] = [];
  if (ratio.history.length > 0) {
    const firstYear = parseInt(ratio.history[0].date.substring(0, 4), 10);
    const lastYear = parseInt(
      ratio.history[ratio.history.length - 1].date.substring(0, 4),
      10,
    );
    const yearSpan = lastYear - firstYear;
    const yearStep =
      yearSpan <= 6 ? 1 : yearSpan <= 12 ? 2 : yearSpan <= 30 ? 5 : 10;
    let lastEmittedYear = -Infinity;
    for (let i = 0; i < ratio.history.length; i++) {
      const year = parseInt(ratio.history[i].date.substring(0, 4), 10);
      if (year - lastEmittedYear >= yearStep) {
        dateLabels.push({ idx: i, label: String(year) });
        lastEmittedYear = year;
      }
    }
  }

  const hoverPoint = hoverIdx !== null ? ratio.history[hoverIdx] : null;

  // Neutral by default; only highlight negative deviation (below MA) with
  // red. Intensity scales the alpha so larger downside moves read more
  // strongly. The currency chart is exempt: "below MA" there just means
  // hold gold instead of bonds, not a bearish signal.
  const pctColor = isCurrencyChart
    ? "rgba(75, 85, 99, 0.7)" // gray-600
    : above
      ? `rgba(75, 85, 99, ${0.5 + intensity * 0.5})` // gray-600
      : `rgba(239, 68, 68, ${0.4 + intensity * 0.6})`; // red-500
  const pctBgColor = isCurrencyChart
    ? "rgba(75, 85, 99, 0.08)"
    : above
      ? `rgba(75, 85, 99, ${0.05 + intensity * 0.1})`
      : `rgba(239, 68, 68, ${0.05 + intensity * 0.1})`;

  // Methodology tooltip — structured JSX (stats grid + sectioned body)
  // instead of a flat text blob. The stats row surfaces the raw current
  // value and 7y MA (these used to live in a dedicated row that nobody
  // read); the body explains either the data sources (currency chart) or
  // the framework interpretation (energy chart).
  const methodologyTooltip = (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="text-[9px] uppercase tracking-wide text-gray-400">
            Current
          </div>
          <div className="text-sm font-bold text-white">
            {ratio.current.toFixed(2)}
          </div>
        </div>
        <div>
          <div className="text-[9px] uppercase tracking-wide text-gray-400">
            7y average
          </div>
          <div className="text-sm font-bold text-white">
            {ratio.ma7y.toFixed(2)}
          </div>
        </div>
      </div>
      <div className="border-t border-white/15 pt-2 space-y-1.5 text-gray-200">
        {isCurrencyChart ? (
          <>
            <p>
              <span className="font-semibold text-white">What it is:</span> Bond
              total return / gold price vs 7-year moving average.
            </p>
            <p>
              <span className="font-semibold text-white">Data sources:</span>{" "}
              2002+ uses IEF ETF data; pre-2002 uses a synthetic 10y
              constant-maturity Treasury total return computed from Shiller
              monthly yields.
            </p>
            <p className="text-gray-400">
              Historical regime classification starts 1971 (post-Bretton-Woods).
            </p>
          </>
        ) : (
          <>
            <p>
              <span className="font-semibold text-white">What it is:</span> S&P
              500 / WTI crude oil price vs 7-year moving average.
            </p>
            <p>
              <span className="font-semibold text-white">Why it matters:</span>{" "}
              Charles Gave&apos;s energy-efficiency proxy. When stocks rise
              faster than oil, energy is being transformed productively — the
              economy is on the Boom side of the Four Quadrants. When oil rises
              faster than stocks, the economy is stalling — Bust side.
            </p>
            <p>
              <span className="font-semibold text-white">Crossovers:</span> Mark
              transitions between the right and left sides of the wheel.
            </p>
            <p className="text-gray-400">Source: Gave, Ch. 3.</p>
          </>
        )}
      </div>
    </div>
  );

  // Regime-strength icon — flips the raw ratio direction relative to the
  // current side of the MA so the icon always answers the natural question
  // "is the current regime call getting stronger or weaker?". Examples:
  //   - "Hold gold" (below MA) + ratio falling further → REINFORCED ↑
  //   - "Hold gold" + ratio rising back toward MA      → WEAKENING  ↓
  //   - "Growth ahead" (above MA) + ratio rising       → REINFORCED ↑
  //   - "Growth ahead" + ratio falling toward MA       → WEAKENING  ↓
  const regimeDirection: "strengthening" | "weakening" | "flat" =
    momentum.direction === "flat"
      ? "flat"
      : (momentum.direction === "up") === above
        ? "strengthening"
        : "weakening";

  // Human-readable labels for the current regime and its opposite, used in
  // the tooltip. Mirrors the top-right banner labels below.
  const currentRegimeLabel = isCurrencyChart
    ? above
      ? "Hold 10y Treasuries"
      : "Hold gold"
    : above
      ? "Growth ahead"
      : "Slowdown risk";
  const oppositeRegimeLabel = isCurrencyChart
    ? above
      ? "Hold gold"
      : "Hold 10y Treasuries"
    : above
      ? "Slowdown risk"
      : "Growth ahead";

  // Momentum tooltip — frames the icon in regime-strength terms (not raw
  // ratio direction), since "Hold gold + ratio falling" is intuitively
  // confusing if you don't know which side of the MA you're on.
  const momentumPctText = `${momentum.change >= 0 ? "+" : ""}${momentum.change.toFixed(1)}%`;
  const momentumTooltip =
    regimeDirection === "flat"
      ? `${currentRegimeLabel} is stable. The ratio has moved less than ±2% (${momentumPctText}) over the last ~4 months — no meaningful directional change.`
      : regimeDirection === "strengthening"
        ? `${currentRegimeLabel} is being reinforced. Over the last ~4 months the ratio has moved ${momentumPctText}, pulling further ${above ? "above" : "below"} its 7-year moving average.`
        : `${currentRegimeLabel} is weakening. Over the last ~4 months the ratio has moved ${momentumPctText}, heading back toward its 7-year moving average — watch for a potential flip to "${oppositeRegimeLabel}".`;

  // Momentum icon — colored chevron-circle next to the regime label.
  // Green up = current regime reinforced, red down = current regime
  // weakening, gray flat = stable. Wrapped in a Tooltip for explanation.
  const momentumIcon = (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={`${currentRegimeLabel} ${regimeDirection}`}
          className="inline-flex items-center justify-center focus:outline-none focus-visible:ring-1 focus-visible:ring-gray-400 rounded-full"
        >
          {regimeDirection === "strengthening" ? (
            <ChevronUpCircle className="w-3.5 h-3.5 text-emerald-600" />
          ) : regimeDirection === "weakening" ? (
            <ChevronDownCircle className="w-3.5 h-3.5 text-red-600" />
          ) : (
            <MinusCircle className="w-3.5 h-3.5 text-gray-400" />
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent
        side="top"
        align="end"
        collisionPadding={8}
        className="z-[10000] max-w-xs text-[11px] leading-snug"
      >
        {momentumTooltip}
      </TooltipContent>
    </Tooltip>
  );

  return (
    <TooltipProvider delayDuration={150}>
      <div className="bg-gray-50 rounded-lg p-3">
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-1.5">
            {icon}
            <span className="text-[11px] font-medium text-gray-500">
              {ratio.label}
            </span>
            {methodologyTooltip && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-label="Methodology"
                    className="inline-flex items-center justify-center text-gray-400 hover:text-gray-600 focus:outline-none focus-visible:ring-1 focus-visible:ring-gray-400 rounded-sm"
                  >
                    <Info className="w-3 h-3" />
                  </button>
                </TooltipTrigger>
                <TooltipContent
                  side="top"
                  align="start"
                  collisionPadding={8}
                  className="z-[10000] max-w-sm text-[11px] leading-snug p-3"
                >
                  {methodologyTooltip}
                </TooltipContent>
              </Tooltip>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            {/* Deviation badge — quantifies how far the ratio sits from
                its 7y MA. Sits immediately before the regime label so the
                signal cluster reads as a single unit (e.g. "−14.6%
                Slowdown risk"). The raw current and MA values used to live
                in their own row but were dead weight; they're now in the
                methodology tooltip. */}
            <span
              className="text-[11px] font-bold px-1.5 py-0.5 rounded"
              style={{
                color: pctColor,
                backgroundColor: pctBgColor,
              }}
            >
              {pct >= 0 ? "+" : ""}
              {pct.toFixed(1)}%
            </span>
            {isCurrencyChart ? (
              <div
                className={`flex items-center gap-1 text-xs font-bold ${above ? "text-blue-600" : "text-amber-600"}`}
              >
                {above ? "Hold 10y Treasuries" : "Hold gold"}
                {momentumIcon}
              </div>
            ) : (
              <div
                className={`flex items-center gap-1 text-xs font-bold ${above ? "text-emerald-600" : "text-red-600"}`}
              >
                {above ? "Growth ahead" : "Slowdown risk"}
                {momentumIcon}
              </div>
            )}
          </div>
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
          {/* Regime background bands. Each rect spans a contiguous run on
            one side of the MA. Currency chart: blue = hold bonds, amber =
            hold gold (Gave Ch. 8). Energy chart: green = booms favored, red
            = busts favored (Gave Ch. 3). */}
          {regimeSegments.map((seg, i) => {
            const x1 = toX(seg.startIdx);
            const x2 = toX(seg.endIdx);
            const fill = isCurrencyChart
              ? seg.above
                ? BONDS_BAND_FILL
                : GOLD_BAND_FILL
              : seg.above
                ? BOOMS_BAND_FILL
                : BUSTS_BAND_FILL;
            return (
              <rect
                key={`regime-${i}`}
                x={x1}
                y={0}
                width={x2 - x1}
                height={chartH}
                fill={fill}
              />
            );
          })}

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
              className="inline-block w-3 h-[2px]"
              style={{ borderTop: "1px dashed #9ca3af" }}
            />
            7yr MA
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-full bg-gray-500 opacity-60" />
            Crossover
          </span>
          {isCurrencyChart ? (
            <>
              <span className="flex items-center gap-1">
                <span
                  className="inline-block w-2.5 h-2.5 rounded-sm aspect-square"
                  style={{
                    backgroundColor: BONDS_BAND_FILL,
                    border: "1px solid rgba(59, 130, 246, 0.35)",
                  }}
                />
                Bonds favored
              </span>
              <span className="flex items-center gap-1">
                <span
                  className="inline-block w-2.5 h-2.5 rounded-sm aspect-square"
                  style={{
                    backgroundColor: GOLD_BAND_FILL,
                    border: "1px solid rgba(245, 158, 11, 0.4)",
                  }}
                />
                Gold favored
              </span>
            </>
          ) : (
            <>
              <span className="flex items-center gap-1">
                <span
                  className="inline-block w-2.5 h-2.5 rounded-sm aspect-square"
                  style={{
                    backgroundColor: BOOMS_BAND_FILL,
                    border: "1px solid rgba(16, 185, 129, 0.35)",
                  }}
                />
                Growth ahead
              </span>
              <span className="flex items-center gap-1">
                <span
                  className="inline-block w-2.5 h-2.5 rounded-sm aspect-square"
                  style={{
                    backgroundColor: BUSTS_BAND_FILL,
                    border: "1px solid rgba(239, 68, 68, 0.35)",
                  }}
                />
                Slowdown risk
              </span>
            </>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
}

// ── MiniSparkline ─────────────────────────────────────────────────────────
//
// Compact static sparkline used in the supplementary "Confirmation signals"
// cards (S&P 500 / Gold and Gold / WTI). Deliberately smaller and simpler
// than RatioChart so the visual hierarchy makes clear that these ratios
// supplement the main regime axes — they don't replace them. Renders the
// value path, a faint MA overlay, and a single dot at the current point.
function MiniSparkline({
  history,
  width = 96,
  height = 32,
}: {
  history: { date: string; value: number; ma: number | null }[];
  width?: number;
  height?: number;
}) {
  if (!history.length) return null;
  const values = history.map((h) => h.value);
  const mas = history.map((h) => h.ma);
  const validMas = mas.filter((v): v is number => v !== null);
  const min = Math.min(...values, ...validMas);
  const max = Math.max(...values, ...validMas);
  const range = max - min || 1;
  const pad = range * 0.08;

  const toY = (v: number) =>
    height - ((v - (min - pad)) / (range + pad * 2)) * height;
  const toX = (i: number) => (i / (values.length - 1)) * width;

  const valuePath = values
    .map((v, i) => `${i === 0 ? "M" : "L"}${toX(i)},${toY(v)}`)
    .join(" ");

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

  const lastIdx = values.length - 1;
  const lastValue = values[lastIdx];
  const lastMa = mas[lastIdx];
  const above = lastMa !== null ? lastValue > lastMa : true;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      style={{ width: `${width}px`, height: `${height}px` }}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {maPath && (
        <path
          d={maPath}
          fill="none"
          stroke="#d1d5db"
          strokeWidth="1"
          strokeDasharray="2 2"
        />
      )}
      <path d={valuePath} fill="none" stroke="#6b7280" strokeWidth="1.25" />
      <circle
        cx={toX(lastIdx)}
        cy={toY(lastValue)}
        r="2"
        fill={above ? "#6b7280" : "#dc2626"}
        stroke="white"
        strokeWidth="1"
      />
    </svg>
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

  // Year tick marks across the full span. Cadence adapts so we land on
  // ~5–6 readable labels regardless of total span.
  const startYear = new Date(startMs).getFullYear();
  const endYear = new Date(endMs).getFullYear();
  const yearSpan = endYear - startYear;
  const yearStep =
    yearSpan <= 6 ? 1 : yearSpan <= 12 ? 2 : yearSpan <= 30 ? 5 : 10;
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
      {/* Header — stacks on mobile, single row from sm: up. flex-wrap on the
          "Current" cluster so the regime name + duration can wrap together
          rather than truncating. */}
      <div className="flex flex-col gap-y-1 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[11px] font-semibold text-gray-700">
            Regime History
          </span>
          <span className="text-[10px] text-gray-400">
            {formatShortDate(segments[0].startDate)} – Now ({yearSpan}y)
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-[10px] flex-wrap">
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

// ── XLE Sub-Panel ───────────────────────────────────────────────────────────

// Per Charles Gave's "General Theory of Portfolio Construction" Ch. 10, the
// energy bucket is a STRUCTURAL hedge — held permanently because the S&P 500
// is uniquely vulnerable to oil shocks now that energy is only ~4% of the
// index (vs ~30% in 1980). The card is reframed accordingly: it answers
// "is the structural hedge working?" rather than "should I time XLE?".
function XlePanel({
  xle,
  quadrantName,
}: {
  xle: GavekalXleData;
  quadrantName: string;
}) {
  // Regime-aware verdict — frames XLE's current performance honestly given
  // what the framework expects in this quadrant. Disinflationary regimes
  // are SUPPOSED to underperform the hedge; that's the cost of insurance.
  const verdict: { active: boolean; text: string } = (() => {
    switch (quadrantName) {
      case "Inflationary Bust":
        return {
          active: true,
          text: "Hedge active — energy is the regime's strongest asset, the bucket is doing its job.",
        };
      case "Inflationary Boom":
        return {
          active: true,
          text: "Hedge active — energy benefits as commodities reflate.",
        };
      case "Deflationary Boom":
        return {
          active: false,
          text: "Hedge dormant — disinflation drags on energy. The bucket is insurance you don't currently need.",
        };
      case "Deflationary Bust":
        return {
          active: false,
          text: "Hedge dormant — both stocks and oil weak. The bucket protects against tail risk only.",
        };
      default:
        return { active: false, text: "" };
    }
  })();

  // XLE/SPY position vs its 7y MA — same convention as the supplementary
  // cards: above MA = energy outperforming, below MA = lagging.
  const xleSpyAbove =
    xle.xleSpyHistory.length > 0 &&
    xle.xleSpyHistory[xle.xleSpyHistory.length - 1].ma !== null
      ? xle.xleSpyHistory[xle.xleSpyHistory.length - 1].value >
        xle.xleSpyHistory[xle.xleSpyHistory.length - 1].ma!
      : null;

  return (
    <div className="bg-gray-50 rounded-lg p-3">
      {/* Header — reframed as a structural hedge bucket, not a tactical bet */}
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-start gap-1.5">
          <Zap className="w-3.5 h-3.5 text-gray-500 mt-0.5 shrink-0" />
          <div>
            <div className="flex items-center gap-1">
              <span className="text-[11px] font-semibold text-gray-700">
                Energy hedge bucket (XLE)
              </span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-label="Energy hedge methodology"
                    className="inline-flex items-center justify-center text-gray-400 hover:text-gray-600 focus:outline-none focus-visible:ring-1 focus-visible:ring-gray-400 rounded-sm"
                  >
                    <Info className="w-3 h-3" />
                  </button>
                </TooltipTrigger>
                <TooltipContent
                  side="top"
                  align="start"
                  collisionPadding={8}
                  className="z-[10000] max-w-sm text-[11px] leading-snug p-3"
                >
                  <div className="space-y-2 text-gray-200">
                    <p>
                      <span className="font-semibold text-white">
                        What it is:
                      </span>{" "}
                      A permanent ~20% slice of the Browne Dynamic portfolio,
                      held in the SPDR Energy Sector ETF (XLE).
                    </p>
                    <p>
                      <span className="font-semibold text-white">
                        Why it&apos;s permanent:
                      </span>{" "}
                      Per Gave Ch. 10, energy was ~30% of the S&P 500 in 1980
                      but only ~4% today — leaving the index uniquely vulnerable
                      to an oil shock. The bucket is structural insurance, not a
                      tactical bet. You don&apos;t time it; you always hold it.
                    </p>
                    <p className="text-gray-400">Source: Gave, Ch. 10.</p>
                  </div>
                </TooltipContent>
              </Tooltip>
            </div>
            <div className="text-[10px] text-gray-400 leading-snug mt-0.5">
              Permanent ~20% allocation per the Browne Dynamic
            </div>
          </div>
        </div>
      </div>

      {/* Stats grid — replaces Trailing P/E with Energy % of S&P 500 (the
          actual rationale for the bucket) and adds XLE/WTI correlation
          (validates the hedge is tracking its underlying commodity). */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
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
          <div className="text-[9px] text-gray-400 uppercase">Div Yield</div>
          <div className="text-sm font-bold text-gray-900">
            {xle.dividendYield ? `${xle.dividendYield.toFixed(1)}%` : "\u2014"}
          </div>
          <div className="text-[9px] text-gray-400">income leg</div>
        </div>
        <div>
          <div className="text-[9px] text-gray-400 uppercase">Energy % S&P</div>
          <div className="text-sm font-bold text-gray-900">
            {xle.energyPctOfSp500 != null
              ? `${(xle.energyPctOfSp500 * 100).toFixed(1)}%`
              : "~4%"}
          </div>
          <div className="text-[9px] text-gray-400">vs ~30% in 1980</div>
        </div>
        <div>
          <div className="text-[9px] text-gray-400 uppercase">
            XLE / WTI corr
          </div>
          <div
            className={`text-sm font-bold ${
              xle.xleWtiCorrelation == null
                ? "text-gray-400"
                : xle.xleWtiCorrelation >= 0.5
                  ? "text-gray-900"
                  : xle.xleWtiCorrelation >= 0.3
                    ? "text-amber-700"
                    : "text-red-700"
            }`}
          >
            {xle.xleWtiCorrelation != null
              ? xle.xleWtiCorrelation.toFixed(2)
              : "\u2014"}
          </div>
          <div className="text-[9px] text-gray-400">1y rolling</div>
        </div>
      </div>

      {/* XLE / SPY relative strength — small sparkline (same tier as the
          confirmation signal cards) showing whether the hedge is currently
          outperforming or lagging the broader market. */}
      {xle.xleSpyHistory.length > 0 && (
        <div className="border-t border-gray-200 pt-2 mb-2">
          <div className="flex items-center justify-between mb-1">
            <div className="text-[9px] text-gray-400 uppercase tracking-wide">
              XLE / SPY relative strength
            </div>
            <MiniSparkline history={xle.xleSpyHistory} />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-sm font-bold text-gray-900">
              {xle.xleSpyRatio != null ? xle.xleSpyRatio.toFixed(3) : "\u2014"}
            </span>
            {xleSpyAbove != null && (
              <span
                className={`text-[10px] font-medium ${
                  xleSpyAbove ? "text-emerald-700" : "text-gray-500"
                }`}
              >
                {xleSpyAbove
                  ? "↑ above 7y average — outperforming"
                  : "↓ below 7y average — lagging"}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Regime-aware verdict — frames performance honestly given what the
          framework expects in the current quadrant. */}
      {verdict.text && (
        <div
          className={`text-[10px] font-medium px-2 py-1.5 rounded leading-snug flex items-start gap-1.5 ${
            verdict.active
              ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
              : "bg-gray-100 text-gray-600 border border-gray-200"
          }`}
        >
          {verdict.active ? (
            <CheckCircle className="w-3 h-3 mt-0.5 shrink-0" />
          ) : (
            <Shield className="w-3 h-3 mt-0.5 shrink-0" />
          )}
          <span>{verdict.text}</span>
        </div>
      )}
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

export function GavekalQuadrant({ data, loading, refreshing = false }: GavekalQuadrantProps) {
  const [expanded, setExpanded] = useState(false);
  const [hoveredCell, setHoveredCell] = useState<string | null>(null);
  const [selectedCell, setSelectedCell] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="rounded-lg bg-white border border-gray-200 shadow-sm p-3 sm:p-4 space-y-3 h-full">
        {/* Header skeleton: (Current Regime label + name+badge+info + description) + side badges + maximize */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div>
              {/* "Current Regime:" line — font-mono text-xs */}
              <Skeleton className="h-3 w-24" />
              {/* Regime name (text-base) + mood badge + info icon */}
              <div className="flex items-center gap-2 mt-1">
                <Skeleton className="h-4 w-44" />
                <Skeleton className="h-4 w-20 rounded-md" />
                <Skeleton className="h-3.5 w-3.5 rounded-sm" />
              </div>
              {/* Description text-[11px] mt-0.5 */}
              <Skeleton className="h-3 w-64 mt-1" />
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <div className="hidden sm:flex items-center gap-3">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-3 w-20" />
            </div>
            <Skeleton className="h-3.5 w-3.5" />
          </div>
        </div>

        {/* Main row: 2x2 quadrant grid + allocation table */}
        <div className="flex flex-col lg:flex-row gap-3">
          {/* Quadrant grid skeleton */}
          <div className="flex-1 min-w-0">
            <div className="grid grid-cols-2 gap-1.5">
              {[...Array(4)].map((_, i) => (
                <Skeleton key={i} className="h-14 w-full rounded-lg" />
              ))}
            </div>
            {/* Axis labels — text-[9px] mt-1.5 */}
            <div className="flex justify-between mt-1.5 px-1">
              <Skeleton className="h-2 w-24" />
              <Skeleton className="h-2 w-24" />
            </div>
          </div>

          {/* Allocation table skeleton — mirrors AllocationTable structure */}
          <div className="lg:w-[280px] shrink-0">
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-2.5">
              {/* Header: text-[11px] font-semibold mb-2 */}
              <Skeleton className="h-3 w-32 mb-2" />
              {/* Rows: py-1, text-[10px] */}
              <div>
                {[...Array(4)].map((_, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between gap-2 py-1 border-b border-black/5 last:border-0"
                  >
                    <div className="flex-1 flex flex-row gap-2 items-center">
                      <Skeleton className="h-2.5 w-20" />
                      <Skeleton className="h-2 w-14" />
                    </div>
                    <Skeleton className="h-2.5 w-7" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const {
    quadrant,
    energyEfficiency,
    currencyQuality,
    keyRatios,
    regimeHistory,
  } = data;

  // Compute Gold/WTI deviation from historical mean
  const goldWtiDeviation = keyRatios.goldWti.current / GOLD_WTI_HISTORICAL_MEAN;

  return (
    <TooltipProvider delayDuration={150}>
      <div className="rounded-lg bg-white border border-gray-200 shadow-sm p-3 sm:p-4 space-y-3 h-full">
        {/* Header — regime label as hero element with prominent banner */}
        <button
          type="button"
          className="flex items-center justify-between w-full text-left cursor-pointer"
          onClick={() => setExpanded((e) => !e)}
        >
          <div className="flex items-center gap-3">
            <div>
              <div className="font-mono text-xs text-gray-500 flex items-center gap-1.5">
                Current Regime:
                <RefreshIndicator active={refreshing} />
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`text-base font-bold tracking-tight ${SCORE_COLORS[quadrant.score] ?? "text-gray-600"}`}
                >
                  {quadrant.name}
                </span>
                <span
                  className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-md ${
                    quadrant.score === -2
                      ? "bg-red-50 text-red-700"
                      : "bg-gray-100 text-gray-600"
                  }`}
                >
                  {QUADRANT_CELLS.find((c) => c.key === quadrant.name)?.mood ??
                    ""}
                </span>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span
                      role="button"
                      tabIndex={0}
                      aria-label="About this model"
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => {
                        if (e.key === " " || e.key === "Enter")
                          e.stopPropagation();
                      }}
                      className="inline-flex items-center justify-center text-gray-400 hover:text-gray-600 focus:outline-none focus-visible:ring-1 focus-visible:ring-gray-400 rounded-sm cursor-help"
                    >
                      <Info className="w-3.5 h-3.5" />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent
                    side="bottom"
                    align="start"
                    collisionPadding={8}
                    className="max-w-xs text-[11px] leading-snug"
                  >
                    Charles Gave&apos;s 4-quadrant macro model. Two axes:
                    equity/oil ratio (energy efficiency) and bond/gold ratio
                    (currency quality), each above or below their 7y moving
                    average.
                  </TooltipContent>
                </Tooltip>
              </div>
              <p className="text-[11px] text-gray-400 leading-tight mt-0.5">
                {quadrant.description}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <div className="hidden sm:flex items-center gap-3 text-[10px] text-gray-400">
              <span
                title="S&P 500 ÷ WTI vs its 7y moving average. Below MA = each $ of equities buys less oil than usual, energy is expensive relative to stocks."
                className="cursor-help"
              >
                <span className="opacity-60">Energy </span>
                <span
                  className={`font-bold ${energyEfficiency.signal === 1 ? "text-gray-600" : "text-red-600"}`}
                >
                  {energyEfficiency.signal === 1 ? "Cheap ↓" : "Expensive ↑"}
                </span>
              </span>
              <span
                title="10y UST total return ÷ Gold vs its 7y moving average. Below MA = bonds losing to gold, fiat currency is being debased."
                className="cursor-help"
              >
                <span className="opacity-60">Currency </span>
                <span
                  className={`font-bold ${currencyQuality.signal === 1 ? "text-gray-600" : "text-red-600"}`}
                >
                  {currencyQuality.signal === 1 ? "Strong ↑" : "Weak ↓"}
                </span>
              </span>
            </div>
            <Maximize2 className="w-3.5 h-3.5 text-gray-300" />
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
                    className={`flex flex-col justify-center relative rounded-lg px-2.5 py-2 text-center transition-all duration-300 ease-out border-2 cursor-pointer h-14 ${
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
                      className={`text-[8px] uppercase tracking-wide bg-white/50 rounded-md ${active ? "font-bold" : "opacity-40"}`}
                    >
                      {cell.mood}
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
                          UST/Gold: {currencyQuality.current.toFixed(2)} vs{" "}
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
            // Mirrors the ebook-narrative buy/sell signals defined in
            // QUADRANTS in src/lib/gavekal.ts (Charles Gave, Ch. 2).
            const qDef = {
              "Deflationary Boom": {
                buy: [
                  "Innovative companies with pricing power",
                  "Long-duration assets",
                ],
                sell: ["Companies with little pricing power"],
              },
              "Inflationary Boom": {
                buy: [
                  "Stores of value (real estate, gold, commodities)",
                  "Cyclical producers",
                ],
                sell: ["Long-term bonds"],
              },
              "Deflationary Bust": {
                buy: ["Safe government bonds"],
                sell: ["Everything else"],
              },
              "Inflationary Bust": {
                buy: ["Cash in safest currency", "Energy producers"],
                sell: ["Financial assets"],
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

        {/* Detail modal */}
        <Modal
          open={expanded}
          onClose={() => setExpanded(false)}
          title={`Current Regime: ${quadrant.name}`}
          size="xl"
        >
          <div className="space-y-4">
            {/* Regime timeline */}
            {regimeHistory && regimeHistory.length > 0 && (
              <RegimeTimeline history={regimeHistory} />
            )}

            {/* Signal ratios with interactive charts — larger. Momentum
                indicator now lives inside each chart's top-right regime
                label as a chevron-circle icon (see RatioChart). */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <RatioChart ratio={energyEfficiency} icon={null} />
              <RatioChart ratio={currencyQuality} icon={null} />
            </div>

            {/* Confirmation signals — supplementary ratios that supplement
                (don't replace) the two main regime axes above. S&P/Gold is a
                leading indicator for the energy axis per Gave Ch. 4;
                Gold/WTI is a macro stress gauge against the historical
                ~16 bbl/oz mean. */}
            {(() => {
              const spGoldAbove =
                keyRatios.spGold.current > keyRatios.spGold.ma7y;
              const spGoldDevPct =
                ((keyRatios.spGold.current - keyRatios.spGold.ma7y) /
                  keyRatios.spGold.ma7y) *
                100;
              const energyAbove = energyEfficiency.signal === 1;
              // Agreement: S&P/Gold confirms the energy axis when both are
              // on the same side of their respective 7y MAs.
              const spGoldConfirms = spGoldAbove === energyAbove;

              // Gold/WTI is a stress gauge. >2x historical mean signals
              // recession-like stress. It "confirms" the regime when stress
              // is present and we're already on the Bust side; it "warns"
              // when stress is present despite a Boom-side regime.
              const goldWtiHighStress = goldWtiDeviation > 2;
              const goldWtiModerateStress =
                goldWtiDeviation > 1.5 && goldWtiDeviation <= 2;
              const goldWtiConfirms = goldWtiHighStress && !energyAbove;
              const goldWtiWarns = goldWtiHighStress && energyAbove;

              return (
                <div>
                  {/* Section header — flex-wrap so the dash subtitle can drop
                      onto its own line on narrow widths instead of wrapping
                      mid-phrase. */}
                  <div className="text-xs font-semibold text-gray-700 mb-2 flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                    <span className="flex items-center gap-1.5">
                      <Activity className="w-3.5 h-3.5 text-gray-400" />
                      Confirmation signals
                    </span>
                    <span className="text-[10px] font-normal text-gray-400">
                      — supplementary checks against the regime axes above
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* S&P 500 / Gold — leading indicator card */}
                    <div className="bg-gray-50 rounded-lg p-2.5">
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] text-gray-500">
                            S&P 500 / Gold
                          </span>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                type="button"
                                aria-label="S&P 500 / Gold methodology"
                                className="inline-flex items-center justify-center text-gray-400 hover:text-gray-600 focus:outline-none focus-visible:ring-1 focus-visible:ring-gray-400 rounded-sm"
                              >
                                <Info className="w-2.5 h-2.5" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent
                              side="top"
                              align="start"
                              collisionPadding={8}
                              className="z-[10000] max-w-sm text-[11px] leading-snug p-3"
                            >
                              <div className="space-y-2">
                                <div className="grid grid-cols-2 gap-3">
                                  <div>
                                    <div className="text-[9px] uppercase tracking-wide text-gray-400">
                                      Current
                                    </div>
                                    <div className="text-sm font-bold text-white">
                                      {keyRatios.spGold.current.toFixed(2)}
                                    </div>
                                  </div>
                                  <div>
                                    <div className="text-[9px] uppercase tracking-wide text-gray-400">
                                      7y average
                                    </div>
                                    <div className="text-sm font-bold text-white">
                                      {keyRatios.spGold.ma7y.toFixed(2)}
                                    </div>
                                  </div>
                                </div>
                                <div className="border-t border-white/15 pt-2 space-y-1.5 text-gray-200">
                                  <p>
                                    <span className="font-semibold text-white">
                                      What it is:
                                    </span>{" "}
                                    The S&P 500 valued in gold terms. Strips out
                                    currency-debasement effects.
                                  </p>
                                  <p>
                                    <span className="font-semibold text-white">
                                      Why it matters:
                                    </span>{" "}
                                    When this ratio falls, equities are losing
                                    real purchasing power even if nominal prices
                                    rise (the &ldquo;monetary illusion&rdquo;).
                                  </p>
                                  <p>
                                    <span className="font-semibold text-white">
                                      Leading indicator:
                                    </span>{" "}
                                    A breakdown below the 7y MA often precedes a
                                    breakdown in S&P 500 / WTI by 1–6 months.
                                  </p>
                                  <p className="text-gray-400">
                                    Source: Gave, Ch. 4.
                                  </p>
                                </div>
                              </div>
                            </TooltipContent>
                          </Tooltip>
                        </div>
                        <MiniSparkline history={keyRatios.spGold.history} />
                      </div>
                      <div className="flex items-baseline gap-2">
                        <span className="text-sm font-bold text-gray-900">
                          {keyRatios.spGold.current.toFixed(2)}
                        </span>
                        <span className="text-[10px] text-gray-400">
                          vs 7yMA {keyRatios.spGold.ma7y.toFixed(2)}
                        </span>
                        <span
                          className={`text-[10px] font-medium ${
                            spGoldAbove ? "text-gray-600" : "text-red-600"
                          }`}
                        >
                          {spGoldDevPct >= 0 ? "+" : ""}
                          {spGoldDevPct.toFixed(1)}%
                        </span>
                      </div>
                      <div className="text-[10px] text-gray-500 mt-1 leading-snug">
                        Leading indicator for the S&P 500 / WTI axis above —
                        often moves 1–6 months ahead.
                      </div>
                      <div
                        className={`text-[10px] font-medium mt-1 flex items-center gap-1 ${
                          spGoldConfirms ? "text-emerald-700" : "text-amber-700"
                        }`}
                      >
                        {spGoldConfirms ? (
                          <>
                            <CheckCircle className="w-3 h-3" />
                            Confirms{" "}
                            {energyAbove ? "Growth ahead" : "Slowdown risk"}
                          </>
                        ) : (
                          <>
                            <AlertCircle className="w-3 h-3" />
                            Diverging — early warning of a possible flip to{" "}
                            {energyAbove ? "Slowdown risk" : "Growth ahead"}
                          </>
                        )}
                      </div>
                    </div>

                    {/* Gold / WTI — macro stress gauge card */}
                    <div className="bg-gray-50 rounded-lg p-2.5">
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] text-gray-500">
                            Gold / WTI
                          </span>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                type="button"
                                aria-label="Gold / WTI methodology"
                                className="inline-flex items-center justify-center text-gray-400 hover:text-gray-600 focus:outline-none focus-visible:ring-1 focus-visible:ring-gray-400 rounded-sm"
                              >
                                <Info className="w-2.5 h-2.5" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent
                              side="top"
                              align="start"
                              collisionPadding={8}
                              className="z-[10000] max-w-sm text-[11px] leading-snug p-3"
                            >
                              <div className="space-y-2">
                                <div className="grid grid-cols-3 gap-3">
                                  <div>
                                    <div className="text-[9px] uppercase tracking-wide text-gray-400">
                                      Current
                                    </div>
                                    <div className="text-sm font-bold text-white">
                                      {keyRatios.goldWti.current.toFixed(1)}
                                    </div>
                                  </div>
                                  <div>
                                    <div className="text-[9px] uppercase tracking-wide text-gray-400">
                                      7y average
                                    </div>
                                    <div className="text-sm font-bold text-white">
                                      {keyRatios.goldWti.ma7y.toFixed(1)}
                                    </div>
                                  </div>
                                  <div>
                                    <div className="text-[9px] uppercase tracking-wide text-gray-400">
                                      Hist. mean
                                    </div>
                                    <div className="text-sm font-bold text-white">
                                      ~{GOLD_WTI_HISTORICAL_MEAN}
                                    </div>
                                  </div>
                                </div>
                                <div className="border-t border-white/15 pt-2 space-y-1.5 text-gray-200">
                                  <p>
                                    <span className="font-semibold text-white">
                                      What it is:
                                    </span>{" "}
                                    Barrels of oil per ounce of gold. Historical
                                    mean since 1900 is ~
                                    {GOLD_WTI_HISTORICAL_MEAN} bbl/oz.
                                  </p>
                                  <p>
                                    <span className="font-semibold text-white">
                                      Above 2× mean:
                                    </span>{" "}
                                    Gold is &ldquo;expensive&rdquo; relative to
                                    oil — historically coincides with recessions
                                    because oil collapses faster than gold under
                                    economic stress.
                                  </p>
                                  <p>
                                    <span className="font-semibold text-white">
                                      Below 1× mean:
                                    </span>{" "}
                                    Oil is &ldquo;expensive&rdquo; relative to
                                    gold — signals energy / inflation stress.
                                  </p>
                                </div>
                              </div>
                            </TooltipContent>
                          </Tooltip>
                        </div>
                        <MiniSparkline history={keyRatios.goldWti.history} />
                      </div>
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-sm font-bold text-gray-900">
                          {keyRatios.goldWti.current.toFixed(2)}
                        </span>
                        <span className="text-[9px] text-gray-400">bbl/oz</span>
                        <span
                          className={`text-[10px] font-bold px-1 py-0.5 rounded ${
                            goldWtiHighStress
                              ? "bg-red-100 text-red-700"
                              : goldWtiModerateStress
                                ? "bg-amber-100 text-amber-700"
                                : "bg-gray-100 text-gray-700"
                          }`}
                        >
                          {goldWtiDeviation.toFixed(1)}× mean
                        </span>
                      </div>
                      <div className="text-[10px] text-gray-500 mt-1 leading-snug">
                        Macro stress gauge — recession risk above 2× the
                        historical ~{GOLD_WTI_HISTORICAL_MEAN} bbl/oz mean.
                      </div>
                      <div
                        className={`text-[10px] font-medium mt-1 flex items-center gap-1 ${
                          goldWtiWarns
                            ? "text-amber-700"
                            : goldWtiConfirms
                              ? "text-emerald-700"
                              : "text-gray-500"
                        }`}
                      >
                        {goldWtiWarns ? (
                          <>
                            <AlertCircle className="w-3 h-3" />
                            High stress despite Growth-ahead regime — watch for
                            reversal
                          </>
                        ) : goldWtiConfirms ? (
                          <>
                            <CheckCircle className="w-3 h-3" />
                            Confirms Slowdown risk — recession-like stress
                          </>
                        ) : goldWtiModerateStress ? (
                          <>
                            <AlertCircle className="w-3 h-3" />
                            Moderate stress — watch for escalation
                          </>
                        ) : (
                          <>
                            <CheckCircle className="w-3 h-3" />
                            No recession stress signal
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* What to do now — merged action+returns view. The 5 tiles
                show historical real returns from Gave's published backtests
                with an action badge per asset class (own/avoid/hold) drawn
                from quadrant.tileActions. Below the grid, narrative items
                from buySignals/sellSignals add within-asset-class
                specificity (e.g. "Energy producers" within commodities).
                Replaces the prior Own/Avoid card grid AND the standalone
                "Historical Returns" section, which inferred each other. */}
            {data.regimeReturns?.[quadrant.name] && (
              <div>
                <div className="text-xs font-semibold text-gray-700 mb-2 flex items-center gap-1.5">
                  <Shield className="w-3.5 h-3.5 text-gray-400" />
                  What to do now
                  <span className="text-[10px] font-normal text-gray-400">
                    — {quadrant.name}
                  </span>
                </div>

                {(() => {
                  const returns = data.regimeReturns![quadrant.name];
                  const tiles = [
                    {
                      key: "equities" as const,
                      label: "Equities",
                      value: returns.equities,
                    },
                    {
                      key: "bonds" as const,
                      label: "Bonds",
                      value: returns.bonds,
                    },
                    {
                      key: "gold" as const,
                      label: "Gold",
                      value: returns.gold,
                    },
                    {
                      key: "commodities" as const,
                      label: "Commodities",
                      value: returns.commodities,
                    },
                    {
                      key: "cash" as const,
                      label: "Cash",
                      value: returns.cash,
                    },
                  ];

                  return (
                    <>
                      <div className="grid grid-cols-5 gap-1.5">
                        {tiles.map((t) => {
                          const action = quadrant.tileActions[t.key];
                          const badgeClasses =
                            action === "own"
                              ? "bg-emerald-100 text-emerald-700"
                              : action === "avoid"
                                ? "bg-red-100 text-red-700"
                                : "bg-gray-200 text-gray-600";
                          const badgeIcon =
                            action === "own"
                              ? "✓"
                              : action === "avoid"
                                ? "✗"
                                : "•";
                          const badgeText =
                            action === "own"
                              ? "own"
                              : action === "avoid"
                                ? "avoid"
                                : "hold";
                          return (
                            <div
                              key={t.key}
                              className="bg-gray-50 rounded-lg p-2 text-center"
                            >
                              <div className="text-[9px] text-gray-400 mb-0.5">
                                {t.label}
                              </div>
                              <div
                                className={`text-sm font-bold ${t.value < 0 ? "text-red-600" : "text-gray-700"}`}
                              >
                                {t.value > 0 ? "+" : ""}
                                {t.value}%
                              </div>
                              <div
                                className={`mt-1 inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full ${badgeClasses}`}
                              >
                                <span>{badgeIcon}</span>
                                <span>{badgeText}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Narrative footer — within-class specificity that
                          can't be expressed by the 5 generic tiles. */}
                      <div className="mt-2 space-y-0.5 text-[10px] leading-snug">
                        <div className="text-gray-600">
                          <span className="font-semibold text-gray-700">
                            Own:
                          </span>{" "}
                          {quadrant.buySignals.join(" · ")}
                        </div>
                        <div className="text-gray-600">
                          <span className="font-semibold text-red-700">
                            Avoid:
                          </span>{" "}
                          {quadrant.sellSignals.join(" · ")}
                        </div>
                      </div>

                      <p className="text-[8px] text-gray-400 mt-1.5">
                        Annualized real returns from Gave&apos;s published
                        backtests. Past performance does not predict future
                        results.
                      </p>
                    </>
                  );
                })()}
              </div>
            )}

            {/* XLE Energy Sub-Panel */}
            {data.xle && (
              <XlePanel xle={data.xle} quadrantName={quadrant.name} />
            )}
          </div>
        </Modal>
      </div>
    </TooltipProvider>
  );
}
