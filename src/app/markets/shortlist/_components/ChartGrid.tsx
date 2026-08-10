"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { CHART_HEIGHT, type CompactBar, type ShortlistChart } from "../_lib/types";

/**
 * Candles are drawn on Canvas rather than as SVG elements.
 *
 * 16 charts x 180 bars is ~2,900 wick+body pairs. As DOM nodes that is a
 * five-figure element count on a page that is meant to be scrolled quickly on a
 * phone; on Canvas it is one node per chart.
 */
function drawChart(
  canvas: HTMLCanvasElement,
  bars: CompactBar[],
  qvwap: number | null,
): void {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (!w || !h) return;

  canvas.width = w * dpr;
  canvas.height = h * dpr;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  // Colors come from CSS custom properties so the chart follows the theme
  // without JS knowing which theme is active.
  const css = getComputedStyle(canvas);
  const up = css.getPropertyValue("--chart-up").trim() || "#1F7A52";
  const down = css.getPropertyValue("--chart-down").trim() || "#A83A31";
  const grid = css.getPropertyValue("--chart-grid").trim() || "#DCD8D0";
  const vwapCol = css.getPropertyValue("--chart-vwap").trim() || "#7A5EA8";
  const label = css.getPropertyValue("--chart-label").trim() || "#7C8590";

  const padR = 44;
  const padT = 6;
  const padB = 6;
  const plotW = w - padR;
  const plotH = h - padT - padB;

  let lo = Infinity;
  let hi = -Infinity;
  for (const b of bars) {
    if (b[3] < lo) lo = b[3];
    if (b[2] > hi) hi = b[2];
  }
  if (qvwap) {
    lo = Math.min(lo, qvwap);
    hi = Math.max(hi, qvwap);
  }
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi <= lo) return;
  const pad = (hi - lo) * 0.06;
  lo -= pad;
  hi += pad;
  const y = (p: number) => padT + plotH - ((p - lo) / (hi - lo)) * plotH;

  const fmt = (p: number) =>
    p >= 1000 ? Math.round(p).toLocaleString("en-US") : p >= 1 ? p.toFixed(2) : p.toPrecision(3);

  ctx.font = "10px ui-monospace, SFMono-Regular, Consolas, monospace";
  ctx.textBaseline = "middle";
  for (let i = 0; i <= 3; i++) {
    const p = lo + ((hi - lo) * i) / 3;
    const yy = Math.round(y(p)) + 0.5;
    ctx.strokeStyle = grid;
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    ctx.moveTo(0, yy);
    ctx.lineTo(plotW, yy);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.fillStyle = label;
    ctx.fillText(fmt(p), plotW + 5, yy);
  }

  const bw = plotW / bars.length;
  const body = Math.max(1, Math.min(6, bw * 0.62));
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i];
    const cx = bw * (i + 0.5);
    const bull = b[4] >= b[1];
    ctx.strokeStyle = bull ? up : down;
    ctx.fillStyle = bull ? up : down;
    ctx.beginPath();
    ctx.moveTo(Math.round(cx) + 0.5, y(b[2]));
    ctx.lineTo(Math.round(cx) + 0.5, y(b[3]));
    ctx.stroke();
    const top = y(Math.max(b[1], b[4]));
    const bot = y(Math.min(b[1], b[4]));
    ctx.fillRect(cx - body / 2, top, body, Math.max(1, bot - top));
  }

  if (qvwap) {
    ctx.strokeStyle = vwapCol;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 4]);
    const yy = Math.round(y(qvwap)) + 0.5;
    ctx.beginPath();
    ctx.moveTo(0, yy);
    ctx.lineTo(plotW, yy);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.lineWidth = 1;
  }
}

function Candles({ chart }: { chart: ShortlistChart }) {
  const ref = useRef<HTMLCanvasElement>(null);

  const redraw = useCallback(() => {
    if (ref.current) drawChart(ref.current, chart.bars, chart.qvwap);
  }, [chart]);

  useEffect(() => {
    redraw();
    // ResizeObserver rather than a window listener: each card resizes when the
    // grid reflows between one, two and three columns, which does not always
    // coincide with a window resize event.
    const ro = new ResizeObserver(redraw);
    if (ref.current) ro.observe(ref.current);

    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", redraw);
    return () => {
      ro.disconnect();
      mq.removeEventListener("change", redraw);
    };
  }, [redraw]);

  return (
    <canvas
      ref={ref}
      style={{ height: CHART_HEIGHT }}
      className="block w-full"
      role="img"
      aria-label={`${chart.base} 4-hour candlestick chart`}
    />
  );
}

type Filter = "all" | "long" | "short" | "crypto" | "tradfi";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "long", label: "Long" },
  { key: "short", label: "Short" },
  { key: "crypto", label: "Crypto" },
  { key: "tradfi", label: "TradFi" },
];

const pct = (v: number | null) =>
  v === null || v === undefined ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;

const isTradfi = (c: string) => c !== "crypto" && c !== "index";

export default function ChartGrid({ charts }: { charts: ShortlistChart[] }) {
  const [filter, setFilter] = useState<Filter>("all");

  const visible = charts.filter((c) => {
    if (filter === "all") return true;
    if (filter === "long" || filter === "short") return c.side === filter;
    if (filter === "tradfi") return isTradfi(c.category);
    return !isTradfi(c.category);
  });

  return (
    <>
      <div className="mb-5 flex flex-wrap gap-2" role="group" aria-label="Filter shortlist">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            aria-pressed={filter === f.key}
            className={`rounded-sm border px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600 ${
              filter === f.key
                ? "border-neutral-900 bg-neutral-900 text-neutral-50 dark:border-neutral-100 dark:bg-neutral-100 dark:text-neutral-900"
                : "border-neutral-300 bg-white text-neutral-600 hover:border-neutral-400 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-400"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <p className="text-sm text-neutral-500">No names match this filter.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((c) => (
            <article
              key={`${c.symbol}-${c.side}`}
              className="overflow-hidden rounded-sm border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900"
            >
              <header className="flex items-baseline justify-between gap-2 border-b border-neutral-200 bg-neutral-50 px-3.5 py-2.5 dark:border-neutral-800 dark:bg-neutral-950">
                <span className="flex items-baseline gap-2 font-mono text-[15px] font-semibold">
                  {c.base}
                  <span
                    className={`rounded-sm px-1.5 py-px font-mono text-[10px] uppercase tracking-wide ${
                      c.side === "long"
                        ? "bg-emerald-700 text-white dark:bg-emerald-500 dark:text-neutral-900"
                        : "bg-red-700 text-white dark:bg-red-400 dark:text-neutral-900"
                    }`}
                  >
                    {c.side}
                  </span>
                  {isTradfi(c.category) && (
                    <span className="rounded-sm border border-neutral-300 px-1.5 py-px font-mono text-[10px] text-neutral-500 dark:border-neutral-700">
                      {c.category}
                    </span>
                  )}
                </span>
                <span className="font-mono text-sm font-semibold tabular-nums text-amber-700 dark:text-amber-400">
                  {c.score}/{c.maxScore}
                </span>
              </header>

              <Candles chart={c} />

              <footer className="flex flex-wrap gap-x-3.5 gap-y-1 border-t border-neutral-200 px-3.5 py-2 font-mono text-[10.5px] tabular-nums text-neutral-500 dark:border-neutral-800 dark:text-neutral-400">
                <span className="font-semibold text-neutral-700 dark:text-neutral-300">
                  {c.factors}
                </span>
                <span>OI {pct(c.oiChangePct)}</span>
                <span>qVWAP {pct(c.vwapDistPct)}</span>
                <span>RSI {c.rsi === null ? "—" : Math.round(c.rsi)}</span>
                <span>5d {pct(c.changePct)}</span>
                <span
                  title="Own-history volatility rank: low means coiled, high means already moving"
                >
                  vol {c.volPctl === null ? "—" : Math.round(c.volPctl)}
                </span>
              </footer>
            </article>
          ))}
        </div>
      )}
    </>
  );
}
