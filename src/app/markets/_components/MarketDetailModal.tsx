"use client";

import useSWR from "swr";
import { Modal } from "@/components/ui/Modal";
import {
  ChevronUpCircle,
  ChevronDownCircle,
  MinusCircle,
  Activity,
  Building2,
  ArrowRightLeft,
  DollarSign,
} from "lucide-react";
import {
  Bar,
  BarChart,
  Cell,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";

// ── Shared types (mirror the API route) ─────────────────────────────

interface VixSentiment {
  value: number | null;
  change: number | null;
  changePercent: number | null;
  level: "low" | "moderate" | "elevated" | "fear" | null;
}

interface VolatilityContext {
  termStructure: number;
  contango: string;
  interpretation: string;
}

interface SentimentData {
  vix: VixSentiment;
  volatilityContext: VolatilityContext | null;
  updatedAt: string;
}

interface BreadthData {
  advanceDecline: {
    advances: number | null;
    declines: number | null;
    unchanged: number | null;
    ratio: number | null;
    netAdvances: number | null;
  };
  newHighsLows: {
    newHighs: number | null;
    newLows: number | null;
    ratio: number | null;
    netHighs: number | null;
  };
  level: "bullish" | "neutral" | "bearish";
  interpretation: string;
  mcclellan?: { oscillator: number | null; signal: string | null };
  source?: string;
  note?: string;
  updatedAt?: string;
}

interface USMarketContextAggregate {
  type: "US_MARKET_CONTEXT";
  sentiment: SentimentData | null;
  breadth: BreadthData | null;
  asOf: string;
}

interface SGXFlagsAggregate {
  type: "SGX_FLAGS";
  glcCount: number;
  schipCount: number;
  glcByParent: Record<string, number>;
  glcs: Array<{ ticker: string; name: string | null; parent: string | null }>;
  schips: Array<{ ticker: string; name: string | null }>;
}

interface CNNorthboundFlowPayload {
  metric: "turnover_proxy" | "net_flow";
  value: number;
  value20dAvg: number;
  activity: "elevated" | "normal" | "subdued";
  recent: Array<{ date: string; value: number }>;
  dataDate: string;
  source: string;
  fetchedAt: string;
  note: string;
}

interface CNFlowAggregate {
  type: "CN_NORTHBOUND_FLOW";
  flow: CNNorthboundFlowPayload | null;
}

interface JPFXPayload {
  metric: "usdjpy";
  rate: number;
  changePercent: number;
  ma50: number;
  ma200: number;
  position: "above_both" | "below_both" | "between";
  recent: Array<{ date: string; rate: number }>;
  interpretation: string;
  source: string;
  fetchedAt: string;
  note?: string;
}

interface JPFXAggregate {
  type: "JP_FX";
  flow: JPFXPayload | null;
}

interface PlaceholderAggregate {
  type: "PLACEHOLDER";
  message: string;
}

type SignalAggregate =
  | USMarketContextAggregate
  | SGXFlagsAggregate
  | CNFlowAggregate
  | JPFXAggregate
  | PlaceholderAggregate;

interface MarketDetailResponse {
  market: string;
  tickerCount: number;
  signals: SignalAggregate;
  generatedAt: string;
}

// ── Public props ────────────────────────────────────────────────────

export interface MarketDetailModalProps {
  open: boolean;
  onClose: () => void;
  /** Watchlist market code (e.g. "US", "SGX", "HK", "JP", "CN", "KS", "LSE"). */
  market: string;
  country: string;
  flag: string;
  valuation: {
    metric: "CAPE" | "TTM_PE";
    value: number | null;
    historicalMean: number;
    historicalRange: { min: number; max: number };
    thresholds: { undervalued: number; overvalued: number };
    zone: "UNDERVALUED" | "FAIR" | "OVERVALUED";
    tacticalBias?: "bullish" | "neutral" | "bearish";
  };
}

// ── Strip-style market codes → watchlist codes ──────────────────────

/**
 * The valuation strip uses display codes (`US | JAPAN | SINGAPORE | CHINA |
 * HONG_KONG`) that diverge from the watchlist enum (`US | JP | SGX | CN |
 * HK | KS | LSE`). Map between them here so the modal accepts whichever
 * form the strip passes in.
 */
const STRIP_TO_WATCHLIST: Record<string, string> = {
  US: "US",
  JAPAN: "JP",
  JP: "JP",
  SINGAPORE: "SGX",
  SGX: "SGX",
  CHINA: "CN",
  CN: "CN",
  HONG_KONG: "HK",
  HK: "HK",
  KS: "KS",
  LSE: "LSE",
};

const fetcher = (url: string) => fetch(url).then((r) => r.json());

// ── Helpers ─────────────────────────────────────────────────────────

const ZONE_STYLES = {
  UNDERVALUED: {
    bg: "bg-emerald-50",
    border: "border-emerald-200",
    text: "text-emerald-700",
    badge: "bg-emerald-100 text-emerald-700",
    label: "Cheap",
  },
  FAIR: {
    bg: "bg-gray-50",
    border: "border-gray-200",
    text: "text-gray-700",
    badge: "bg-gray-100 text-gray-700",
    label: "Fair",
  },
  OVERVALUED: {
    bg: "bg-orange-50",
    border: "border-orange-200",
    text: "text-orange-700",
    badge: "bg-orange-100 text-orange-700",
    label: "Expensive",
  },
} as const;

function clampPct(pct: number) {
  return Math.min(100, Math.max(0, pct));
}

function flagEmojiToIso(flag: string): string | null {
  const codePoints = Array.from(flag).map((c) => c.codePointAt(0) ?? 0);
  if (codePoints.length !== 2) return null;
  const base = 0x1f1e6;
  const chars = codePoints.map((cp) => String.fromCharCode(cp - base + 97));
  return chars.join("");
}

function formatNumberCompact(n: number): string {
  if (Math.abs(n) >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

// ── Valuation snapshot (Section 1) ──────────────────────────────────

function ValuationSnapshot({ valuation }: { valuation: MarketDetailModalProps["valuation"] }) {
  const zoneStyle = ZONE_STYLES[valuation.zone];
  const metricLabel = valuation.metric === "CAPE" ? "CAPE" : "P/E";
  const { min, max } = valuation.historicalRange;
  const span = max - min;

  const undervaluedPct = clampPct(
    ((valuation.thresholds.undervalued - min) / span) * 100,
  );
  const overvaluedPct = clampPct(
    ((valuation.thresholds.overvalued - min) / span) * 100,
  );
  const meanPct = clampPct(((valuation.historicalMean - min) / span) * 100);
  const dotPct = valuation.value
    ? clampPct(((valuation.value - min) / span) * 100)
    : 0;

  const pctOfMean = valuation.value
    ? Math.round((valuation.value / valuation.historicalMean) * 100)
    : null;
  const interpretation = pctOfMean
    ? pctOfMean >= 95 && pctOfMean <= 105
      ? `In line with historical mean (${valuation.historicalMean.toFixed(1)}x)`
      : pctOfMean > 100
        ? `${pctOfMean - 100}% above historical mean (${valuation.historicalMean.toFixed(1)}x)`
        : `${100 - pctOfMean}% below historical mean (${valuation.historicalMean.toFixed(1)}x)`
    : "No live valuation available";

  const tacticalIcon =
    valuation.tacticalBias === "bullish" ? (
      <ChevronUpCircle className="w-4 h-4 text-emerald-600" />
    ) : valuation.tacticalBias === "bearish" ? (
      <ChevronDownCircle className="w-4 h-4 text-red-600" />
    ) : (
      <MinusCircle className="w-4 h-4 text-gray-400" />
    );
  const tacticalLabel =
    valuation.tacticalBias === "bullish"
      ? "Short-term momentum bullish (price above 50/200-day MAs)"
      : valuation.tacticalBias === "bearish"
        ? "Short-term momentum bearish (price below 50/200-day MAs)"
        : "Short-term momentum mixed";

  return (
    <div className={`rounded-lg border ${zoneStyle.border} ${zoneStyle.bg} p-4`}>
      <div className="flex items-start justify-between mb-2">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">
            Valuation
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold text-gray-900 tabular-nums">
              {valuation.value?.toFixed(1) ?? "—"}x
            </span>
            <span className="text-xs text-gray-500">{metricLabel}</span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span
            className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${zoneStyle.badge}`}
          >
            {zoneStyle.label}
          </span>
          {valuation.tacticalBias && (
            <div
              className="flex items-center gap-1 text-[10px] text-gray-500"
              title={tacticalLabel}
            >
              {tacticalIcon}
              <span>
                {valuation.tacticalBias === "bullish"
                  ? "Bullish"
                  : valuation.tacticalBias === "bearish"
                    ? "Bearish"
                    : "Neutral"}
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="text-xs text-gray-600 mb-3">{interpretation}</div>

      {/* Range visualization with mean marker */}
      {valuation.value && (
        <div className="relative h-6">
          <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-2 rounded-full overflow-hidden bg-gray-100">
            <div
              className="absolute inset-y-0 left-0 bg-emerald-200"
              style={{ width: `${undervaluedPct}%` }}
            />
            <div
              className="absolute inset-y-0 bg-gray-200"
              style={{
                left: `${undervaluedPct}%`,
                width: `${overvaluedPct - undervaluedPct}%`,
              }}
            />
            <div
              className="absolute inset-y-0 right-0 bg-orange-200"
              style={{ width: `${100 - overvaluedPct}%` }}
            />
          </div>
          {/* Historical mean tick */}
          <div
            className="absolute top-1/2 -translate-y-1/2 w-px h-3 bg-gray-500 z-10"
            style={{ left: `${meanPct}%` }}
            title={`Historical mean: ${valuation.historicalMean}x`}
          />
          {/* Current value dot */}
          <div
            className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full border-2 border-white shadow z-20 bg-gray-900"
            style={{ left: `calc(${dotPct}% - 6px)` }}
          />
          <div className="absolute -bottom-0 left-0 text-[9px] text-gray-400 tabular-nums">
            {min}x
          </div>
          <div className="absolute -bottom-0 right-0 text-[9px] text-gray-400 tabular-nums">
            {max}x
          </div>
        </div>
      )}
    </div>
  );
}

// ── Stat card primitive ─────────────────────────────────────────────

function StatCard({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "positive" | "negative";
}) {
  const toneClass =
    tone === "positive"
      ? "text-emerald-700"
      : tone === "negative"
        ? "text-red-700"
        : "text-gray-900";
  return (
    <div className="bg-gray-50 rounded-lg p-2.5">
      <div className="text-[10px] text-gray-500 mb-0.5">{label}</div>
      <div className={`text-base font-bold tabular-nums ${toneClass}`}>{value}</div>
      {hint && <div className="text-[9px] text-gray-400 mt-0.5">{hint}</div>}
    </div>
  );
}

// ── Per-type signal renderers ───────────────────────────────────────

function vixTone(level: VixSentiment["level"]): "default" | "positive" | "negative" {
  if (level === "low") return "positive";
  if (level === "fear" || level === "elevated") return "negative";
  return "default";
}

function breadthTone(level: BreadthData["level"]): "default" | "positive" | "negative" {
  if (level === "bullish") return "positive";
  if (level === "bearish") return "negative";
  return "default";
}

function USContextView({ data }: { data: USMarketContextAggregate }) {
  const { sentiment, breadth } = data;
  const hasSentiment = sentiment !== null && sentiment.vix.value !== null;
  const hasBreadth =
    breadth !== null &&
    breadth.advanceDecline.advances !== null &&
    breadth.advanceDecline.declines !== null;

  if (!hasSentiment && !hasBreadth) {
    return (
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-center">
        <div className="text-xs text-gray-500">
          Market context unavailable.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {hasSentiment && sentiment && (
        <div>
          <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1.5">
            Sentiment
          </div>
          <div className="grid grid-cols-2 gap-2">
            <StatCard
              label="VIX"
              value={sentiment.vix.value!.toFixed(2)}
              hint={
                sentiment.vix.changePercent !== null
                  ? `${sentiment.vix.changePercent >= 0 ? "+" : ""}${sentiment.vix.changePercent.toFixed(2)}% today`
                  : sentiment.vix.level
                    ? `Level: ${sentiment.vix.level}`
                    : undefined
              }
              tone={vixTone(sentiment.vix.level)}
            />
            {sentiment.volatilityContext && (
              <StatCard
                label="VIX Term"
                value={sentiment.volatilityContext.termStructure.toFixed(2)}
                hint={sentiment.volatilityContext.contango}
                tone={
                  sentiment.volatilityContext.contango === "backwardation"
                    ? "negative"
                    : "default"
                }
              />
            )}
          </div>
          {sentiment.volatilityContext && (
            <div className="text-[10px] text-gray-500 mt-1.5">
              {sentiment.volatilityContext.interpretation}
            </div>
          )}
        </div>
      )}

      {hasBreadth && breadth && (
        <div>
          <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1.5">
            Breadth (NYSE)
          </div>
          <div className="grid grid-cols-3 gap-2">
            <StatCard
              label="A/D Ratio"
              value={
                breadth.advanceDecline.ratio !== null
                  ? breadth.advanceDecline.ratio.toFixed(2)
                  : "—"
              }
              hint={`${breadth.advanceDecline.advances ?? 0} adv / ${breadth.advanceDecline.declines ?? 0} dec`}
              tone={breadthTone(breadth.level)}
            />
            <StatCard
              label="Net Adv"
              value={
                breadth.advanceDecline.netAdvances !== null
                  ? `${breadth.advanceDecline.netAdvances >= 0 ? "+" : ""}${formatNumberCompact(breadth.advanceDecline.netAdvances)}`
                  : "—"
              }
              tone={
                breadth.advanceDecline.netAdvances !== null
                  ? breadth.advanceDecline.netAdvances >= 0
                    ? "positive"
                    : "negative"
                  : "default"
              }
            />
            <StatCard
              label="New H − L"
              value={
                breadth.newHighsLows.netHighs !== null
                  ? `${breadth.newHighsLows.netHighs >= 0 ? "+" : ""}${formatNumberCompact(breadth.newHighsLows.netHighs)}`
                  : "—"
              }
              hint={`${breadth.newHighsLows.newHighs ?? 0} hi / ${breadth.newHighsLows.newLows ?? 0} lo`}
              tone={
                breadth.newHighsLows.netHighs !== null
                  ? breadth.newHighsLows.netHighs >= 0
                    ? "positive"
                    : "negative"
                  : "default"
              }
            />
          </div>
          <div className="text-[10px] text-gray-500 mt-1.5">
            {breadth.interpretation}
            {breadth.source ? ` · ${breadth.source}` : ""}
          </div>
        </div>
      )}
    </div>
  );
}

function SGXFlagsView({ data }: { data: SGXFlagsAggregate }) {
  const parents = Object.entries(data.glcByParent).sort((a, b) => b[1] - a[1]);
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <StatCard
          label="GLCs"
          value={`${data.glcCount}`}
          hint="Temasek-linked"
          tone="positive"
        />
        <StatCard
          label="S-Chips"
          value={`${data.schipCount}`}
          hint="China-domiciled"
          tone={data.schipCount > 0 ? "negative" : "default"}
        />
      </div>
      {parents.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1.5">
            GLC by Parent
          </div>
          <div className="flex flex-wrap gap-1.5">
            {parents.map(([parent, count]) => (
              <span
                key={parent}
                className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700"
              >
                {parent}: {count}
              </span>
            ))}
          </div>
        </div>
      )}
      {data.glcs.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1.5">
            GLC Names
          </div>
          <div className="grid grid-cols-2 gap-1">
            {data.glcs.map((g) => (
              <div
                key={g.ticker}
                className="text-[11px] bg-white border border-gray-100 rounded px-2 py-1"
              >
                <span className="font-medium text-gray-900">{g.ticker}</span>
                {g.name && (
                  <span className="text-gray-500 ml-1 truncate">— {g.name}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      {data.schips.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1.5">
            S-Chips
          </div>
          <div className="grid grid-cols-2 gap-1">
            {data.schips.map((s) => (
              <div
                key={s.ticker}
                className="text-[11px] bg-white border border-orange-100 rounded px-2 py-1"
              >
                <span className="font-medium text-gray-900">{s.ticker}</span>
                {s.name && (
                  <span className="text-gray-500 ml-1 truncate">— {s.name}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── CN Northbound flow view ─────────────────────────────────────────

function formatRmb(n: number, signed = false): string {
  const sign = signed ? (n >= 0 ? "+" : "−") : "";
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return `${sign}¥${(abs / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `${sign}¥${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}¥${(abs / 1_000).toFixed(1)}K`;
  return `${sign}¥${abs.toFixed(0)}`;
}

function CNFlowView({ data }: { data: CNFlowAggregate }) {
  const flow = data.flow;
  if (!flow) {
    return (
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-center">
        <div className="text-xs text-gray-500">
          Northbound flow data unavailable.
        </div>
      </div>
    );
  }

  const isNetFlow = flow.metric === "net_flow";
  const headlineLabel = isNetFlow ? "Net flow today" : "Turnover today";
  const avgLabel = isNetFlow ? "20d avg net flow" : "20d avg turnover";

  // Activity / direction tone.
  // For net_flow: green if positive, red if negative.
  // For turnover_proxy: tone reflects elevated/subdued (informational, not directional).
  let tone: "default" | "positive" | "negative" = "default";
  let interpretation = "";
  if (isNetFlow) {
    if (flow.value > 0) {
      tone = "positive";
      interpretation = "Foreign capital buying";
    } else if (flow.value < 0) {
      tone = "negative";
      interpretation = "Foreign capital selling";
    } else {
      interpretation = "Mixed";
    }
  } else {
    if (flow.activity === "elevated") {
      tone = "positive";
      interpretation = "Activity elevated vs 20d";
    } else if (flow.activity === "subdued") {
      tone = "negative";
      interpretation = "Activity subdued vs 20d";
    } else {
      interpretation = "Activity in line with 20d";
    }
  }

  const headlineColor =
    tone === "positive"
      ? "text-emerald-700"
      : tone === "negative"
        ? "text-red-700"
        : "text-gray-900";

  // Sparkline data — bars colored consistently. For turnover all bars
  // share a tone; for net_flow each bar is colored by sign.
  const sparkData = flow.recent.map((p) => ({ date: p.date, value: p.value }));

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-gray-200 bg-white p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">
              {headlineLabel}
            </div>
            <div className={`text-2xl font-bold tabular-nums ${headlineColor}`}>
              {formatRmb(flow.value, isNetFlow)}
            </div>
            <div className="text-[11px] text-gray-500 mt-0.5">
              {interpretation}
            </div>
          </div>
          {sparkData.length > 1 && (
            <div className="w-32 h-12 shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={sparkData} margin={{ top: 2, right: 0, bottom: 2, left: 0 }}>
                  <Bar dataKey="value" radius={[1, 1, 0, 0]}>
                    {sparkData.map((d, i) => (
                      <Cell
                        key={i}
                        fill={
                          isNetFlow
                            ? d.value >= 0
                              ? "#10b981"
                              : "#ef4444"
                            : "#6b7280"
                        }
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <StatCard
            label={avgLabel}
            value={formatRmb(flow.value20dAvg, isNetFlow)}
          />
          <StatCard
            label="Today vs 20d"
            value={
              flow.value20dAvg
                ? `${((flow.value / flow.value20dAvg) * 100).toFixed(0)}%`
                : "—"
            }
            hint={flow.activity}
          />
        </div>
      </div>

      <div className="text-[10px] text-gray-500 leading-snug">
        {flow.note}
      </div>
      <div className="text-[10px] text-gray-400 flex items-center gap-1">
        <ArrowRightLeft className="w-3 h-3" />
        Source: {flow.source} · {flow.dataDate}
      </div>
    </div>
  );
}

// ── JP USD/JPY view ─────────────────────────────────────────────────

const JP_POSITION_STYLES = {
  above_both: {
    label: "Above both MAs",
    badge: "bg-emerald-100 text-emerald-700 border-emerald-200",
    headline: "text-emerald-700",
    line: "#10b981",
  },
  between: {
    label: "Between MAs",
    badge: "bg-amber-100 text-amber-700 border-amber-200",
    headline: "text-gray-900",
    line: "#6b7280",
  },
  below_both: {
    label: "Below both MAs",
    badge: "bg-red-100 text-red-700 border-red-200",
    headline: "text-red-700",
    line: "#ef4444",
  },
} as const;

function JPFXView({ data }: { data: JPFXAggregate }) {
  const flow = data.flow;
  if (!flow) {
    return (
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-center">
        <div className="text-xs text-gray-500">
          USD/JPY data unavailable.
        </div>
      </div>
    );
  }

  const style = JP_POSITION_STYLES[flow.position];

  const changeTone =
    flow.changePercent > 0
      ? "text-emerald-700"
      : flow.changePercent < 0
        ? "text-red-700"
        : "text-gray-500";
  const changeText = `${flow.changePercent >= 0 ? "+" : ""}${flow.changePercent.toFixed(2)}% today`;

  // Sparkline domain: pad min/max ~0.2% so the line doesn't sit flush
  // against the edges. Recharts default yAxis would auto-fit anyway, but
  // forcing a tight domain keeps the visual change visible.
  const rates = flow.recent.map((p) => p.rate);
  const min = rates.length ? Math.min(...rates) : flow.rate;
  const max = rates.length ? Math.max(...rates) : flow.rate;
  const pad = (max - min) * 0.1 || max * 0.002;
  const domain: [number, number] = [min - pad, max + pad];

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-gray-200 bg-white p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">
              USD/JPY spot
            </div>
            <div
              className={`text-2xl font-bold tabular-nums ${style.headline}`}
            >
              {flow.rate.toFixed(2)}
            </div>
            <div className={`text-[11px] tabular-nums mt-0.5 ${changeTone}`}>
              {changeText}
            </div>
          </div>
          {flow.recent.length > 1 && (
            <div className="w-32 h-12 shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={flow.recent}
                  margin={{ top: 2, right: 0, bottom: 2, left: 0 }}
                >
                  <ReferenceLine
                    y={flow.ma50}
                    stroke="#9ca3af"
                    strokeDasharray="2 2"
                    strokeWidth={1}
                  />
                  <ReferenceLine
                    y={flow.ma200}
                    stroke="#d1d5db"
                    strokeDasharray="2 2"
                    strokeWidth={1}
                  />
                  <Line
                    type="monotone"
                    dataKey="rate"
                    stroke={style.line}
                    strokeWidth={1.5}
                    dot={false}
                    isAnimationActive={false}
                  />
                  {/* Hidden y domain hint via a 0-stroke line */}
                  <ReferenceLine y={domain[0]} stroke="transparent" />
                  <ReferenceLine y={domain[1]} stroke="transparent" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 items-stretch">
          <StatCard label="50d MA" value={flow.ma50.toFixed(1)} />
          <StatCard label="200d MA" value={flow.ma200.toFixed(1)} />
          <div className="bg-gray-50 rounded-lg p-2.5 flex flex-col justify-center">
            <div className="text-[10px] text-gray-500 mb-1">Position</div>
            <span
              className={`text-[10px] font-medium px-2 py-0.5 rounded-full border self-start ${style.badge}`}
            >
              {style.label}
            </span>
          </div>
        </div>
      </div>

      <div className="text-[11px] text-gray-500 leading-snug">
        {flow.interpretation}
      </div>
      {flow.note && (
        <div className="text-[10px] text-gray-500 leading-snug">
          {flow.note}
        </div>
      )}
      <div className="text-[10px] text-gray-400 flex items-center gap-1">
        <DollarSign className="w-3 h-3" />
        Source: {flow.source} · {flow.fetchedAt.slice(0, 10)}
      </div>
    </div>
  );
}

function PlaceholderView({ data }: { data: PlaceholderAggregate }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-center">
      <div className="text-xs text-gray-500">{data.message}</div>
    </div>
  );
}

// ── Per-market header label ─────────────────────────────────────────

function getSignalHeader(market: string): { title: string; icon: React.ReactNode } {
  const wm = STRIP_TO_WATCHLIST[market] ?? market;
  switch (wm) {
    case "US":
      return {
        title: "Market context",
        icon: <Activity className="w-4 h-4 text-gray-500" />,
      };
    case "SGX":
      return {
        title: "SGX Ownership Flags",
        icon: <Building2 className="w-4 h-4 text-gray-500" />,
      };
    case "CN":
      return {
        title: "Stock Connect — Northbound flow",
        icon: <ArrowRightLeft className="w-4 h-4 text-gray-500" />,
      };
    case "JP":
      return {
        title: "FX — USD/JPY",
        icon: <DollarSign className="w-4 h-4 text-gray-500" />,
      };
    default:
      return {
        title: "Market Signals",
        icon: <Activity className="w-4 h-4 text-gray-500" />,
      };
  }
}

// ── Main component ──────────────────────────────────────────────────

export function MarketDetailModal({
  open,
  onClose,
  market,
  country,
  flag,
  valuation,
}: MarketDetailModalProps) {
  const watchlistMarket = STRIP_TO_WATCHLIST[market] ?? market;

  const { data, isLoading, error } = useSWR<MarketDetailResponse>(
    open ? `/api/markets/${watchlistMarket}/detail` : null,
    fetcher,
  );

  const iso = flagEmojiToIso(flag);
  const header = getSignalHeader(market);

  const titleNode = (
    <span className="flex items-center gap-2">
      {iso ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`https://flagcdn.com/w40/${iso}.png`}
          srcSet={`https://flagcdn.com/w80/${iso}.png 2x`}
          width={20}
          height={15}
          alt={`${country} flag`}
          className="rounded-sm object-cover"
        />
      ) : (
        <span>{flag}</span>
      )}
      <span>{country}</span>
    </span>
  );

  // Modal `title` prop is `string`; we render the flag inline in the body
  // header instead so we can show the flag image alongside the country
  // name (the Modal primitive only supports plain-text titles).
  return (
    <Modal open={open} onClose={onClose} title={country} size="lg">
      <div className="space-y-4">
        {/* Country header (with flag) */}
        <div className="flex items-center justify-between -mt-1">
          <div className="flex items-center gap-2 text-xs text-gray-500">
            {titleNode}
          </div>
        </div>

        {/* Section 1: Valuation snapshot */}
        <ValuationSnapshot valuation={valuation} />

        {/* Section 2: Market-level context */}
        <div>
          <h2 className="text-sm font-semibold text-gray-900 mb-2 flex items-center gap-2">
            {header.icon}
            {header.title}
          </h2>

          {isLoading && (
            <div className="space-y-2">
              <div className="grid grid-cols-3 gap-2">
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="h-16 bg-gray-100 rounded-lg animate-pulse"
                  />
                ))}
              </div>
              <div className="h-24 bg-gray-50 rounded-lg animate-pulse" />
            </div>
          )}

          {error && (
            <div className="text-xs text-gray-500 italic">
              Failed to load signals.
            </div>
          )}

          {!isLoading && data && "error" in data && (
            <div className="text-xs text-gray-500 italic">
              Failed to load signals.
            </div>
          )}

          {!isLoading && data && !("error" in data) && (
            <>
              {data.signals.type === "US_MARKET_CONTEXT" && (
                <USContextView data={data.signals} />
              )}
              {data.signals.type === "SGX_FLAGS" && (
                <SGXFlagsView data={data.signals} />
              )}
              {data.signals.type === "CN_NORTHBOUND_FLOW" && (
                <CNFlowView data={data.signals} />
              )}
              {data.signals.type === "JP_FX" && (
                <JPFXView data={data.signals} />
              )}
              {data.signals.type === "PLACEHOLDER" && (
                <PlaceholderView data={data.signals} />
              )}
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
