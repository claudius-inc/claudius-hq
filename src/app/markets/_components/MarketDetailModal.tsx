"use client";

import useSWR from "swr";
import { Modal } from "@/components/ui/Modal";
import {
  ChevronUpCircle,
  ChevronDownCircle,
  MinusCircle,
  TrendingUp,
  TrendingDown,
  Shield,
  AlertTriangle,
  Activity,
  Building2,
} from "lucide-react";

// ── Shared types (mirror the API route) ─────────────────────────────

interface USInsiderAggregate {
  type: "US_INSIDER";
  totalBuyValue: number;
  totalSellValue: number;
  clusterBuyCount: number;
  netInsiderActivity: number;
  topBuyers: Array<{
    ticker: string;
    name: string | null;
    totalBuyValue: number;
    insiderBuyCount: number;
    isClusterBuy: boolean;
  }>;
  asOf: string;
}

interface HKShortAggregate {
  type: "HK_SHORT";
  averageShortTurnoverRatio: number;
  topShorts: Array<{
    ticker: string;
    name: string | null;
    shortTurnoverRatio: number;
    shortVolume: number;
  }>;
  dataDate: string;
}

interface JPGovernanceAggregate {
  type: "JP_GOVERNANCE";
  highCatalystCount: number;
  pbrBelowOneCount: number;
  capitalEfficiencyPlanCount: number;
  topCatalysts: Array<{
    ticker: string;
    name: string | null;
    score: number;
    hasPBRBelowOne: boolean;
    hasCapitalEfficiencyPlan: boolean;
  }>;
}

interface SGXFlagsAggregate {
  type: "SGX_FLAGS";
  glcCount: number;
  schipCount: number;
  glcByParent: Record<string, number>;
  glcs: Array<{ ticker: string; name: string | null; parent: string | null }>;
  schips: Array<{ ticker: string; name: string | null }>;
}

interface CNConnectAggregate {
  type: "CN_CONNECT";
  totalNorthboundHolding: number;
  totalDailyChange: number;
  averagePercentOfFloat: number;
  topInflows: Array<{
    ticker: string;
    name: string | null;
    percentOfFloat: number;
    dailyChange: number;
  }>;
  topOutflows: Array<{
    ticker: string;
    name: string | null;
    percentOfFloat: number;
    dailyChange: number;
  }>;
}

interface PlaceholderAggregate {
  type: "PLACEHOLDER";
  message: string;
}

type SignalAggregate =
  | USInsiderAggregate
  | HKShortAggregate
  | JPGovernanceAggregate
  | SGXFlagsAggregate
  | CNConnectAggregate
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

function formatUsdCompact(n: number): string {
  if (Math.abs(n) >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${Math.round(n)}`;
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

function USInsiderView({ data }: { data: USInsiderAggregate }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        <StatCard
          label="Total Buys (30d)"
          value={formatUsdCompact(data.totalBuyValue)}
          tone="positive"
        />
        <StatCard
          label="Total Sells (30d)"
          value={formatUsdCompact(data.totalSellValue)}
          tone="negative"
        />
        <StatCard
          label="Cluster Buys"
          value={`${data.clusterBuyCount}`}
          hint="3+ insiders buying"
        />
      </div>
      <div>
        <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1.5">
          Net Insider Flow
        </div>
        <div
          className={`text-sm font-semibold ${data.netInsiderActivity >= 0 ? "text-emerald-700" : "text-red-700"}`}
        >
          {data.netInsiderActivity >= 0 ? "+" : ""}
          {formatUsdCompact(data.netInsiderActivity)}
        </div>
      </div>
      {data.topBuyers.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1.5">
            Top Buys
          </div>
          <div className="space-y-1">
            {data.topBuyers.map((b) => (
              <div
                key={b.ticker}
                className="flex items-center justify-between bg-white border border-gray-100 rounded p-2"
              >
                <div className="min-w-0 flex-1 mr-2">
                  <div className="text-xs font-medium text-gray-900 flex items-center gap-1.5">
                    {b.ticker}
                    {b.isClusterBuy && (
                      <span className="text-[9px] px-1 py-0.5 rounded bg-emerald-100 text-emerald-700 font-medium">
                        cluster
                      </span>
                    )}
                  </div>
                  {b.name && (
                    <div className="text-[10px] text-gray-500 truncate">
                      {b.name}
                    </div>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <div className="text-xs font-semibold text-emerald-700 tabular-nums">
                    {formatUsdCompact(b.totalBuyValue)}
                  </div>
                  <div className="text-[9px] text-gray-400">
                    {b.insiderBuyCount} buyer{b.insiderBuyCount === 1 ? "" : "s"}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="text-[9px] text-gray-400">As of {data.asOf}</div>
    </div>
  );
}

function HKShortView({ data }: { data: HKShortAggregate }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <StatCard
          label="Avg Short Turnover"
          value={`${data.averageShortTurnoverRatio.toFixed(2)}%`}
          hint="Watchlist average"
        />
        <StatCard
          label="Names Reporting"
          value={`${data.topShorts.length}+`}
          hint="With short data"
        />
      </div>
      {data.topShorts.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1.5">
            Highest Short Turnover
          </div>
          <div className="space-y-1">
            {data.topShorts.map((s) => (
              <div
                key={s.ticker}
                className="flex items-center justify-between bg-white border border-gray-100 rounded p-2"
              >
                <div className="min-w-0 flex-1 mr-2">
                  <div className="text-xs font-medium text-gray-900">
                    {s.ticker}
                  </div>
                  {s.name && (
                    <div className="text-[10px] text-gray-500 truncate">
                      {s.name}
                    </div>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <div className="text-xs font-semibold text-amber-700 tabular-nums">
                    {s.shortTurnoverRatio.toFixed(2)}%
                  </div>
                  <div className="text-[9px] text-gray-400">
                    {formatNumberCompact(s.shortVolume)} vol
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="text-[9px] text-gray-400">Data date {data.dataDate}</div>
    </div>
  );
}

function JPGovernanceView({ data }: { data: JPGovernanceAggregate }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        <StatCard
          label="High Catalyst"
          value={`${data.highCatalystCount}`}
          hint="Score >= 7"
          tone="positive"
        />
        <StatCard
          label="PBR < 1"
          value={`${data.pbrBelowOneCount}`}
          hint="Below book"
        />
        <StatCard
          label="Cap Efficiency"
          value={`${data.capitalEfficiencyPlanCount}`}
          hint="Disclosed plans"
        />
      </div>
      {data.topCatalysts.length > 0 ? (
        <div>
          <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1.5">
            Top Governance Catalysts
          </div>
          <div className="space-y-1">
            {data.topCatalysts.map((c) => (
              <div
                key={c.ticker}
                className="flex items-center justify-between bg-white border border-gray-100 rounded p-2"
              >
                <div className="min-w-0 flex-1 mr-2">
                  <div className="text-xs font-medium text-gray-900">
                    {c.ticker}
                  </div>
                  {c.name && (
                    <div className="text-[10px] text-gray-500 truncate">
                      {c.name}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {c.hasCapitalEfficiencyPlan && (
                    <span className="text-[9px] px-1 py-0.5 rounded bg-emerald-100 text-emerald-700">
                      plan
                    </span>
                  )}
                  {c.hasPBRBelowOne && (
                    <span className="text-[9px] px-1 py-0.5 rounded bg-blue-100 text-blue-700">
                      PBR&lt;1
                    </span>
                  )}
                  <div className="text-xs font-semibold text-gray-900 tabular-nums">
                    {c.score}/10
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="text-xs text-gray-500 italic">
          No governance catalysts in current watchlist top 20.
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

function CNConnectView({ data }: { data: CNConnectAggregate }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        <StatCard
          label="N. Holding"
          value={formatNumberCompact(data.totalNorthboundHolding)}
          hint="Total shares"
        />
        <StatCard
          label="Daily Δ"
          value={`${data.totalDailyChange >= 0 ? "+" : ""}${formatNumberCompact(data.totalDailyChange)}`}
          tone={data.totalDailyChange >= 0 ? "positive" : "negative"}
        />
        <StatCard
          label="Avg % of Float"
          value={`${data.averagePercentOfFloat.toFixed(2)}%`}
        />
      </div>
      {data.topInflows.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-wider text-emerald-700 mb-1.5 flex items-center gap-1">
            <TrendingUp className="w-3 h-3" /> Top Inflows
          </div>
          <div className="space-y-1">
            {data.topInflows.map((r) => (
              <div
                key={r.ticker}
                className="flex items-center justify-between bg-white border border-gray-100 rounded p-2"
              >
                <div className="min-w-0 flex-1 mr-2">
                  <div className="text-xs font-medium text-gray-900">
                    {r.ticker}
                  </div>
                  {r.name && (
                    <div className="text-[10px] text-gray-500 truncate">
                      {r.name}
                    </div>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <div className="text-xs font-semibold text-emerald-700 tabular-nums">
                    +{formatNumberCompact(r.dailyChange)}
                  </div>
                  <div className="text-[9px] text-gray-400">
                    {r.percentOfFloat.toFixed(2)}% float
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {data.topOutflows.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-wider text-red-700 mb-1.5 flex items-center gap-1">
            <TrendingDown className="w-3 h-3" /> Top Outflows
          </div>
          <div className="space-y-1">
            {data.topOutflows.map((r) => (
              <div
                key={r.ticker}
                className="flex items-center justify-between bg-white border border-gray-100 rounded p-2"
              >
                <div className="min-w-0 flex-1 mr-2">
                  <div className="text-xs font-medium text-gray-900">
                    {r.ticker}
                  </div>
                  {r.name && (
                    <div className="text-[10px] text-gray-500 truncate">
                      {r.name}
                    </div>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <div className="text-xs font-semibold text-red-700 tabular-nums">
                    {formatNumberCompact(r.dailyChange)}
                  </div>
                  <div className="text-[9px] text-gray-400">
                    {r.percentOfFloat.toFixed(2)}% float
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {data.topInflows.length === 0 && data.topOutflows.length === 0 && (
        <div className="text-xs text-gray-500 italic">
          No Stock Connect flow data for current watchlist (cache may need refresh).
        </div>
      )}
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
        title: "US Insider Activity (last 30d)",
        icon: <Activity className="w-4 h-4 text-gray-500" />,
      };
    case "HK":
      return {
        title: "HK Short Selling",
        icon: <AlertTriangle className="w-4 h-4 text-gray-500" />,
      };
    case "JP":
      return {
        title: "JP Governance Catalysts",
        icon: <Shield className="w-4 h-4 text-gray-500" />,
      };
    case "SGX":
      return {
        title: "SGX Ownership Flags",
        icon: <Building2 className="w-4 h-4 text-gray-500" />,
      };
    case "CN":
      return {
        title: "CN Stock Connect Flows",
        icon: <Activity className="w-4 h-4 text-gray-500" />,
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
  const isPlaceholder = watchlistMarket === "KS" || watchlistMarket === "LSE";

  const { data, isLoading, error } = useSWR<MarketDetailResponse>(
    open && !isPlaceholder ? `/api/markets/${watchlistMarket}/detail` : null,
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

        {/* Section 2: Market-specific signal aggregate */}
        <div>
          <h2 className="text-sm font-semibold text-gray-900 mb-2 flex items-center gap-2">
            {header.icon}
            {header.title}
          </h2>

          {isPlaceholder && (
            <PlaceholderView
              data={{
                type: "PLACEHOLDER",
                message:
                  "Per-market signals not yet wired for this market.",
              }}
            />
          )}

          {!isPlaceholder && isLoading && (
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

          {!isPlaceholder && error && (
            <div className="text-xs text-gray-500 italic">
              Failed to load signals.
            </div>
          )}

          {!isPlaceholder && !isLoading && data && "error" in data && (
            <div className="text-xs text-gray-500 italic">
              Failed to load signals.
            </div>
          )}

          {!isPlaceholder && !isLoading && data && !("error" in data) && (
            <>
              {data.signals.type === "US_INSIDER" && (
                <USInsiderView data={data.signals} />
              )}
              {data.signals.type === "HK_SHORT" && (
                <HKShortView data={data.signals} />
              )}
              {data.signals.type === "JP_GOVERNANCE" && (
                <JPGovernanceView data={data.signals} />
              )}
              {data.signals.type === "SGX_FLAGS" && (
                <SGXFlagsView data={data.signals} />
              )}
              {data.signals.type === "CN_CONNECT" && (
                <CNConnectView data={data.signals} />
              )}
              {data.signals.type === "PLACEHOLDER" && (
                <PlaceholderView data={data.signals} />
              )}
              <div className="text-[9px] text-gray-400 mt-2">
                Aggregated across {data.tickerCount} watchlist tickers
              </div>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
