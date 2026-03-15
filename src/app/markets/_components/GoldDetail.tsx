"use client";

import useSWR, { mutate } from "swr";
import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Modal } from "@/components/ui/Modal";
import {
  TrendingUp,
  TrendingDown,
  Plus,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";
import type { EvaluatedSignal, SignalRating, CompositeRating, RuleEvaluation } from "@/lib/thesis/types";

// ── Types ──────────────────────────────────────────────────────────

interface GoldData {
  livePrice: number | null;
  dxy: { price: number; changePercent: number } | null;
  realYields: { value: number; tips?: number | null } | null;
  gld: { price: number; changePercent: number } | null;
  ratios: {
    dowGold: number | null;
    goldSilver: number | null;
    m2Gold: number | null;
  } | null;
  movingAverages: {
    ema50: number | null;
    ema200: number | null;
  } | null;
  analysis: {
    ath: number | null;
    athDate: string | null;
    keyLevels?: Array<{ level: number; significance: string }>;
    thesisNotes?: string;
    cyclePhase?: number | null;
    catalysts?: { bull: string[]; bear: string[] } | null;
  } | null;
}

interface ThesisData {
  asset: string;
  signals: EvaluatedSignal[];
  compositeScore: number;
  compositeRating: CompositeRating;
  preCommitment: {
    entryMet: boolean;
    thesisChangeMet: boolean;
    reviewTriggered: boolean;
    rules: RuleEvaluation[];
  };
  recentDecisions: Array<{
    id: number;
    decisionType: string;
    reasoning: string | null;
    priceAtDecision: number | null;
    quantity: string | null;
    emotionalState: string | null;
    createdAt: string | null;
  }>;
}

interface GoldDetailProps {
  open: boolean;
  onClose: () => void;
}

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function formatUsd(n: number, decimals = 0) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(n);
}

// ── Rating Helpers ─────────────────────────────────────────────────

const RATING_CONFIG: Record<SignalRating, { label: string; color: string; icon: string }> = {
  "strong-bullish": { label: "Strong Bull", color: "text-emerald-700 bg-emerald-50 border-emerald-200", icon: "+" },
  bullish: { label: "Bullish", color: "text-emerald-600 bg-emerald-50 border-emerald-200", icon: "+" },
  neutral: { label: "Neutral", color: "text-gray-600 bg-gray-50 border-gray-200", icon: "-" },
  bearish: { label: "Bearish", color: "text-amber-600 bg-amber-50 border-amber-200", icon: "!" },
  "strong-bearish": { label: "Bearish", color: "text-red-600 bg-red-50 border-red-200", icon: "!!" },
};

const COMPOSITE_CONFIG: Record<CompositeRating, { label: string; color: string }> = {
  "strong-buy": { label: "Strong Buy", color: "text-emerald-700 bg-emerald-100" },
  buy: { label: "Buy", color: "text-emerald-600 bg-emerald-50" },
  neutral: { label: "Neutral", color: "text-gray-600 bg-gray-100" },
  caution: { label: "Caution", color: "text-amber-600 bg-amber-50" },
  avoid: { label: "Avoid", color: "text-red-600 bg-red-50" },
};

function formatSignalValue(value: number | null, unit: string): string {
  if (value === null) return "--";
  if (unit === "%") return `${value.toFixed(1)}%`;
  if (unit === "bps") return `${Math.round(value)}bps`;
  if (unit === "T") return `${value.toLocaleString()}T`;
  if (unit === "%ile") return `${Math.round(value)}th%ile`;
  return value.toFixed(2);
}

// ── Cycle Phase Indicator ─────────────────────────────────────────

const CYCLE_PHASES = [
  { label: "Accumulation", desc: "Smart money buys, public ignores" },
  { label: "Markup", desc: "Trend emerges, institutions join" },
  { label: "Acceleration", desc: "Broad participation, price surges" },
  { label: "Mania", desc: "Euphoria, retail FOMO, blow-off top" },
];

function CyclePhaseIndicator({ phase }: { phase: number }) {
  return (
    <div>
      <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2 px-2">
        Cycle Position
      </div>
      <div className="flex gap-1">
        {CYCLE_PHASES.map((p, i) => {
          const phaseNum = i + 1;
          const isCurrent = phaseNum === phase;
          const isPast = phaseNum < phase;
          return (
            <div key={i} className="flex-1">
              <div
                className={`h-1.5 rounded-full mb-1 ${
                  isCurrent
                    ? "bg-amber-500"
                    : isPast
                    ? "bg-amber-300"
                    : "bg-gray-200"
                }`}
              />
              <div className={`text-[10px] font-medium ${isCurrent ? "text-amber-700" : "text-gray-400"}`}>
                {p.label}
              </div>
              {isCurrent && (
                <div className="text-[9px] text-gray-500 mt-0.5">{p.desc}</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Live Ratios Grid ──────────────────────────────────────────────

const RATIO_INFO: Record<string, { label: string; peakLabel: string; peak: number; desc: string }> = {
  dowGold: {
    label: "Dow / Gold",
    peakLabel: "1980 peak",
    peak: 1.29,
    desc: "Lower = gold outperforming stocks. Hit 1.3 at 1980 peak.",
  },
  goldSilver: {
    label: "Gold / Silver",
    peakLabel: "1980 peak",
    peak: 17,
    desc: "High ratio = silver cheap vs gold. Compresses in mania phases.",
  },
  m2Gold: {
    label: "M2 / Gold",
    peakLabel: "1980 peak",
    peak: 2.5,
    desc: "How much money supply per oz of gold. Lower = gold expensive vs money supply.",
  },
};

function RatiosGrid({ ratios }: { ratios: GoldData["ratios"] }) {
  if (!ratios) return null;
  const entries = Object.entries(ratios).filter(([, v]) => v !== null) as [string, number][];
  if (entries.length === 0) return null;

  return (
    <div>
      <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5 px-2">
        Key Ratios (Live)
      </div>
      <div className="grid grid-cols-3 gap-2">
        {entries.map(([key, value]) => {
          const info = RATIO_INFO[key];
          if (!info) return null;
          return (
            <div key={key} className="bg-gray-50 rounded-lg p-2.5 border border-gray-100">
              <div className="text-[10px] text-gray-500 mb-0.5">{info.label}</div>
              <div className="text-sm font-bold text-gray-900 font-mono">{value.toFixed(1)}</div>
              <div className="text-[9px] text-gray-400 mt-0.5">
                {info.peakLabel}: {info.peak}
              </div>
              <div className="text-[9px] text-gray-400 mt-1 leading-tight">{info.desc}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Strategy Levels ───────────────────────────────────────────────

function StrategyLevels({
  goldPrice,
  ema50,
  ema200,
  keyLevels,
}: {
  goldPrice: number | null;
  ema50: number | null;
  ema200: number | null;
  keyLevels: Array<{ level: number; significance: string }>;
}) {
  // Merge EMAs with key levels
  const allLevels: Array<{ level: number; label: string; type: "ema" | "key" }> = [];
  if (ema50) allLevels.push({ level: ema50, label: "50-day EMA", type: "ema" });
  if (ema200) allLevels.push({ level: ema200, label: "200-day EMA", type: "ema" });
  keyLevels.forEach((kl) => allLevels.push({ level: kl.level, label: kl.significance, type: "key" }));

  if (allLevels.length === 0) return null;

  // Sort descending so highest level is first
  allLevels.sort((a, b) => b.level - a.level);

  return (
    <div>
      <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1 px-2">
        Key Levels & Strategy
      </div>
      <div className="space-y-1">
        {allLevels.map((lvl, i) => {
          const isAbove = goldPrice && goldPrice >= lvl.level;
          const dist = goldPrice ? ((goldPrice - lvl.level) / lvl.level) * 100 : null;
          const isEma = lvl.type === "ema";
          return (
            <div
              key={i}
              className={`flex items-center justify-between rounded-lg p-2 border ${
                isAbove
                  ? "bg-emerald-50 border-emerald-200"
                  : "bg-gray-50 border-gray-200"
              }`}
            >
              <div className="flex items-center gap-2">
                {isAbove ? (
                  <TrendingUp className="w-3 h-3 text-emerald-500" />
                ) : (
                  <TrendingDown className="w-3 h-3 text-gray-400" />
                )}
                <span className={`text-xs font-medium ${isEma ? "text-blue-700" : "text-gray-900"}`}>
                  {formatUsd(lvl.level)}
                </span>
                {dist !== null && (
                  <span className={`text-[10px] font-mono ${isAbove ? "text-emerald-500" : "text-gray-400"}`}>
                    {dist >= 0 ? "+" : ""}{dist.toFixed(1)}%
                  </span>
                )}
              </div>
              <span className={`text-[10px] ${isEma ? "text-blue-600 font-medium" : "text-gray-500"}`}>
                {lvl.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Catalysts ─────────────────────────────────────────────────────

function CatalystsPanel({ catalysts }: { catalysts: { bull: string[]; bear: string[] } }) {
  return (
    <div>
      <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5 px-2">
        Catalysts to Watch
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-emerald-50 rounded-lg p-2.5 border border-emerald-100">
          <div className="text-[10px] font-semibold text-emerald-700 mb-1.5 flex items-center gap-1">
            <ArrowUpRight className="w-3 h-3" /> Bull Triggers
          </div>
          <ul className="space-y-1">
            {catalysts.bull.map((c, i) => (
              <li key={i} className="text-[10px] text-emerald-800 leading-tight">{c}</li>
            ))}
          </ul>
        </div>
        <div className="bg-red-50 rounded-lg p-2.5 border border-red-100">
          <div className="text-[10px] font-semibold text-red-700 mb-1.5 flex items-center gap-1">
            <ArrowDownRight className="w-3 h-3" /> Bear Triggers
          </div>
          <ul className="space-y-1">
            {catalysts.bear.map((c, i) => (
              <li key={i} className="text-[10px] text-red-800 leading-tight">{c}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

// ── Signal Explanations ───────────────────────────────────────────

const SIGNAL_FRIENDLY_NAME: Record<string, string> = {
  "tips-yield": "Real Yields (TIPS)",
  "dxy": "US Dollar (DXY)",
  "cb-demand": "Central Bank Buying",
  "5y5y-breakeven": "Inflation Expectations",
  "hy-spread": "Credit Stress",
  "deficit-gdp": "US Deficit / GDP",
  "real-policy-rate": "Real Fed Rate",
  "cftc-net-spec": "Speculative Positioning",
  "gold-sp-ratio": "Gold vs S&P 500",
};

const SIGNAL_EXPLANATIONS: Record<string, Record<string, string>> = {
  "tips-yield": {
    "strong-bullish": "Real yields deeply negative — gold thrives when cash loses purchasing power",
    bullish: "Real yields low — holding gold costs little vs bonds",
    neutral: "Real yields moderate — neither helping nor hurting gold",
    bearish: "Real yields elevated — bonds offer real return, competing with gold",
    "strong-bearish": "Real yields high — strong headwind, bonds much more attractive than gold",
  },
  dxy: {
    "strong-bullish": "Dollar very weak — gold priced in USD gets cheaper for global buyers",
    bullish: "Dollar soft — tailwind for gold prices",
    neutral: "Dollar in middle range — no strong push either way",
    bearish: "Dollar strong — makes gold expensive for foreign buyers",
    "strong-bearish": "Dollar surging — major headwind for gold",
  },
  "cb-demand": {
    "strong-bullish": "Central banks buying aggressively (>1,000T/yr) — structural floor under prices",
    bullish: "Central banks buying steadily — supports demand",
    neutral: "Central bank buying at normal levels",
    bearish: "Central bank buying below trend",
    "strong-bearish": "Central banks not buying — missing a key demand pillar",
  },
  "5y5y-breakeven": {
    "strong-bullish": "Markets pricing in high long-term inflation — gold's sweet spot",
    bullish: "Inflation expectations rising — investors seek inflation hedges",
    neutral: "Inflation expectations well-anchored around target",
    bearish: "Low inflation expectations — less need for gold as hedge",
    "strong-bearish": "Deflation fears — gold usually underperforms in deflation",
  },
  "hy-spread": {
    "strong-bullish": "Credit markets stressed — flight to safety benefits gold",
    bullish: "Spreads widening — rising risk aversion supports gold",
    neutral: "Credit markets calm — no fear bid for gold",
    bearish: "Spreads tight — risk appetite high, gold less appealing",
    "strong-bearish": "Spreads very tight — complacency, no safe-haven demand",
  },
  "deficit-gdp": {
    "strong-bullish": "Deficit >6% of GDP — crisis-level spending without a crisis, serious debasement risk",
    bullish: "Deficit 4.5-6% — well above the 3% sustainability line, historically only seen in recessions",
    neutral: "Deficit around 3% — roughly the level that stabilizes debt-to-GDP ratio",
    bearish: "Deficit below 3% — fiscal position improving, less need for gold as a hedge",
    "strong-bearish": "Near surplus — strong fiscal discipline, removes a key gold catalyst",
  },
  "real-policy-rate": {
    "strong-bullish": "Fed rate deeply negative in real terms — effectively paying you to borrow, great for gold",
    bullish: "Real rate negative — Fed behind the curve, supports gold",
    neutral: "Real rate near zero — neutral for gold",
    bearish: "Fed rate positive in real terms — tighter policy headwind for gold",
    "strong-bearish": "Aggressively positive real rate — strong headwind for gold",
  },
  "cftc-net-spec": {
    "strong-bullish": "Speculators underweight — room for new buying to push prices up",
    bullish: "Positioning light — not crowded, healthy setup",
    neutral: "Positioning average — no extreme signal",
    bearish: "Speculators getting crowded — less room for new longs",
    "strong-bearish": "Extremely crowded long — contrarian warning, vulnerable to a shakeout",
  },
  "gold-sp-ratio": {
    "strong-bullish": "Gold cheap vs stocks — historically strong forward returns from here",
    bullish: "Gold reasonably valued vs stocks",
    neutral: "Gold/stocks ratio at average levels",
    bearish: "Gold expensive vs stocks — outperformance may be stretched",
    "strong-bearish": "Gold very expensive vs stocks — mean reversion risk is high",
  },
};

function getExplanation(signal: EvaluatedSignal): string {
  return SIGNAL_EXPLANATIONS[signal.id]?.[signal.rating] ?? signal.detail;
}

// ── Signal Range Bar ──────────────────────────────────────────────

function getBarPosition(value: number | null, thresholds: number[]): number {
  if (value === null || !thresholds || thresholds.length < 4) return 50;
  const [t0, , , t3] = thresholds;
  const pad = (t3 - t0) * 0.2;
  const min = t0 - pad;
  const max = t3 + pad;
  const pct = ((value - min) / (max - min)) * 100;
  return Math.max(1, Math.min(99, pct));
}

function getZonePcts(thresholds: number[]): number[] {
  if (!thresholds || thresholds.length < 4) return [20, 40, 60, 80];
  const [t0, t1, t2, t3] = thresholds;
  const pad = (t3 - t0) * 0.2;
  const min = t0 - pad;
  const max = t3 + pad;
  const range = max - min;
  return [t0, t1, t2, t3].map((t) => ((t - min) / range) * 100);
}

function formatThreshold(value: number, unit: string): string {
  if (unit === "%") return `${value}%`;
  if (unit === "bps") return `${value}`;
  if (unit === "T") return `${value}T`;
  if (unit === "%ile") return `${value}th`;
  return value.toString();
}

function SignalRangeBar({ signal }: { signal: EvaluatedSignal }) {
  if (!signal.thresholds || signal.thresholds.length < 4) return null;
  const pos = getBarPosition(signal.currentValue, signal.thresholds);
  const zones = getZonePcts(signal.thresholds);
  const isBelow = signal.bullishDirection === "below";

  const zoneColors = isBelow
    ? ["bg-emerald-400", "bg-emerald-200", "bg-gray-200", "bg-amber-200", "bg-red-200"]
    : ["bg-red-200", "bg-amber-200", "bg-gray-200", "bg-emerald-200", "bg-emerald-400"];

  return (
    <div className="mt-1.5">
      <div className="relative h-1.5 rounded-full overflow-hidden flex">
        <div className={`${zoneColors[0]}`} style={{ width: `${zones[0]}%` }} />
        <div className={`${zoneColors[1]}`} style={{ width: `${zones[1] - zones[0]}%` }} />
        <div className={`${zoneColors[2]}`} style={{ width: `${zones[2] - zones[1]}%` }} />
        <div className={`${zoneColors[3]}`} style={{ width: `${zones[3] - zones[2]}%` }} />
        <div className={`${zoneColors[4]}`} style={{ width: `${100 - zones[3]}%` }} />
      </div>
      <div className="relative h-0">
        <div
          className="absolute -top-[7px] w-2 h-2 rounded-full bg-gray-900 border border-white shadow-sm"
          style={{ left: `${pos}%`, transform: "translateX(-50%)" }}
        />
      </div>
      <div className="relative h-3 mt-1">
        {signal.thresholds.map((t, i) => (
          <span
            key={i}
            className="absolute text-[8px] text-gray-400 font-mono"
            style={{ left: `${zones[i]}%`, transform: "translateX(-50%)" }}
          >
            {formatThreshold(t, signal.unit)}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Trend Arrow ───────────────────────────────────────────────────

function TrendArrow({ signal }: { signal: EvaluatedSignal }) {
  if (signal.currentValue === null || !signal.previousValue) return null;
  const delta = signal.currentValue - signal.previousValue;
  if (Math.abs(delta) < 0.001) return null;

  const movingBullish = signal.bullishDirection === "below" ? delta < 0 : delta > 0;
  const color = movingBullish ? "text-emerald-500" : "text-red-400";
  const arrow = movingBullish
    ? (signal.bullishDirection === "below" ? "\u2193" : "\u2191")
    : (signal.bullishDirection === "below" ? "\u2191" : "\u2193");

  return (
    <span className={`text-[10px] font-bold ${color}`} title={`prev: ${signal.previousValue}`}>
      {arrow}
    </span>
  );
}

// ── Signal Panel ───────────────────────────────────────────────────

function SignalRow({ signal }: { signal: EvaluatedSignal }) {
  const cfg = RATING_CONFIG[signal.rating];
  const friendlyName = SIGNAL_FRIENDLY_NAME[signal.id] ?? signal.name;
  const explanation = getExplanation(signal);
  return (
    <div className="py-2 px-2.5 rounded-lg hover:bg-gray-50">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs font-semibold text-gray-900">{friendlyName}</span>
          <span className="text-xs text-gray-500 font-mono">
            {formatSignalValue(signal.currentValue, signal.unit)}
          </span>
          <TrendArrow signal={signal} />
        </div>
        <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium shrink-0 ${cfg.color}`}>
          {cfg.label}
        </span>
      </div>
      <div className="text-[10px] text-gray-500 mt-0.5 leading-relaxed">
        {explanation}
      </div>
      <SignalRangeBar signal={signal} />
    </div>
  );
}

function SignalGroup({ title, signals }: { title: string; signals: EvaluatedSignal[] }) {
  if (signals.length === 0) return null;
  return (
    <div>
      <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1 px-2">
        {title}
      </div>
      <div className="space-y-0.5">
        {signals.map((s) => (
          <SignalRow key={s.id} signal={s} />
        ))}
      </div>
    </div>
  );
}

// ── Pre-Commitment Panel ───────────────────────────────────────────

function PreCommitmentRow({ rule }: { rule: RuleEvaluation }) {
  const fraction = `${rule.metCount}/${rule.totalCount}`;
  const pct = rule.totalCount > 0 ? (rule.metCount / rule.totalCount) * 100 : 0;
  const barColor = rule.met ? "bg-emerald-500" : pct > 0 ? "bg-amber-400" : "bg-gray-200";

  return (
    <div className="flex items-center gap-3 py-1.5 px-2">
      <span className="text-[10px] font-semibold text-gray-500 uppercase w-16 shrink-0">
        {rule.type}
      </span>
      <div className="flex items-center gap-1.5 flex-1 min-w-0 flex-wrap">
        {rule.conditions.map((c, i) => (
          <span
            key={i}
            className={`text-[10px] px-1.5 py-0.5 rounded border ${
              c.met
                ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                : "bg-gray-50 border-gray-200 text-gray-400"
            }`}
          >
            {c.met ? "[x]" : "[ ]"}{c.label}
          </span>
        ))}
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <span className="text-[10px] font-mono text-gray-500">{fraction}</span>
        <div className="w-12 h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div className={`h-full rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
        </div>
      </div>
    </div>
  );
}

// ── Decision Log Form ──────────────────────────────────────────────

function DecisionForm({ goldPrice, onSubmit }: { goldPrice: number | null; onSubmit: () => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    decisionType: "add",
    priceAtDecision: goldPrice?.toString() ?? "",
    quantity: "",
    reasoning: "",
    emotionalState: "calm",
  });

  if (!isOpen) {
    return (
      <button
        onClick={() => {
          setForm((f) => ({ ...f, priceAtDecision: goldPrice?.toString() ?? "" }));
          setIsOpen(true);
        }}
        className="flex items-center gap-1 text-[10px] text-blue-600 hover:text-blue-700 font-medium mt-1"
      >
        <Plus className="w-3 h-3" /> Log Decision
      </button>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await fetch("/api/thesis/gold/decision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          priceAtDecision: form.priceAtDecision ? parseFloat(form.priceAtDecision) : null,
        }),
      });
      setIsOpen(false);
      setForm({ decisionType: "add", priceAtDecision: "", quantity: "", reasoning: "", emotionalState: "calm" });
      onSubmit();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-2 space-y-2 bg-gray-50 rounded-lg p-3 border border-gray-200">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] text-gray-500 block mb-0.5">Type</label>
          <select
            value={form.decisionType}
            onChange={(e) => setForm((f) => ({ ...f, decisionType: e.target.value }))}
            className="w-full text-xs border rounded px-2 py-1 bg-white"
          >
            {["entry", "add", "trim", "exit", "review"].map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-[10px] text-gray-500 block mb-0.5">Price</label>
          <input
            type="number"
            value={form.priceAtDecision}
            onChange={(e) => setForm((f) => ({ ...f, priceAtDecision: e.target.value }))}
            className="w-full text-xs border rounded px-2 py-1"
            placeholder="Price"
            step="0.01"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] text-gray-500 block mb-0.5">Quantity</label>
          <input
            type="text"
            value={form.quantity}
            onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))}
            className="w-full text-xs border rounded px-2 py-1"
            placeholder="e.g., 2% GLD"
          />
        </div>
        <div>
          <label className="text-[10px] text-gray-500 block mb-0.5">Emotional State</label>
          <select
            value={form.emotionalState}
            onChange={(e) => setForm((f) => ({ ...f, emotionalState: e.target.value }))}
            className="w-full text-xs border rounded px-2 py-1 bg-white"
          >
            {["calm", "anxious", "excited", "fearful"].map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label className="text-[10px] text-gray-500 block mb-0.5">Reasoning</label>
        <textarea
          value={form.reasoning}
          onChange={(e) => setForm((f) => ({ ...f, reasoning: e.target.value }))}
          className="w-full text-xs border rounded px-2 py-1 h-14 resize-none"
          placeholder="Why this decision?"
        />
      </div>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="text-[10px] px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {submitting ? "Saving..." : "Save"}
        </button>
        <button
          type="button"
          onClick={() => setIsOpen(false)}
          className="text-[10px] px-3 py-1 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

// ── Historical Cycles ─────────────────────────────────────────────

function HistoricalCycles({ currentReturn }: { currentReturn: number | null }) {
  const cycles = [
    { era: "1970s", range: "$35 → $850", pct: 2329, driver: "Nixon shock, inflation" },
    { era: "2000s", range: "$255 → $1,921", pct: 653, driver: "GFC, QE" },
    { era: "Current", range: "$1,050 → ?", pct: currentReturn, driver: "De-dollarization, fiscal dominance" },
  ];

  return (
    <div>
      <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5 px-2">
        Historical Bull Markets
      </div>
      <div className="space-y-1">
        {cycles.map((c, i) => (
          <div key={i} className="flex items-center gap-3 px-2 py-1.5 text-[10px]">
            <span className="font-semibold text-gray-700 w-14 shrink-0">{c.era}</span>
            <span className="font-mono text-gray-500 w-28 shrink-0">{c.range}</span>
            <span className="font-mono font-bold text-emerald-600 w-14 shrink-0 text-right">
              {c.pct !== null ? `+${Math.round(c.pct)}%` : "--"}
            </span>
            <span className="text-gray-400 truncate">{c.driver}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────

export function GoldDetail({ open, onClose }: GoldDetailProps) {
  const { data: goldData, isLoading: goldLoading } = useSWR<GoldData>(
    open ? "/api/gold" : null,
    fetcher,
  );

  const { data: thesisData, isLoading: thesisLoading } = useSWR<ThesisData>(
    open ? "/api/thesis/gold" : null,
    fetcher,
  );

  const goldPrice = goldData?.livePrice ?? null;
  const goldAth = goldData?.analysis?.ath ?? null;
  const athDist = goldPrice && goldAth ? ((goldPrice - goldAth) / goldAth) * 100 : null;
  const bullStartPrice = 1050; // 2015 low — current cycle start
  const currentReturn = goldPrice ? ((goldPrice - bullStartPrice) / bullStartPrice) * 100 : null;

  const primarySignals = thesisData?.signals.filter((s) => s.category === "primary") ?? [];
  const secondarySignals = thesisData?.signals.filter((s) => s.category === "secondary") ?? [];
  const sentimentSignals = thesisData?.signals.filter((s) => s.category === "sentiment") ?? [];

  const isLoading = goldLoading || thesisLoading;
  const cyclePhase = goldData?.analysis?.cyclePhase ?? 3;

  return (
    <Modal open={open} onClose={onClose} title="Gold Analysis" size="lg">
      <div className="space-y-5">
        {/* Price Card with Composite Score */}
        <div className="rounded-lg border bg-gradient-to-br from-amber-50 to-yellow-50 p-4">
          <div className="flex justify-between items-start">
            <div>
              <div className="text-xs text-gray-500 mb-1">Gold Spot</div>
              {isLoading ? (
                <div className="h-8 w-32 bg-gray-200 rounded animate-pulse" />
              ) : goldPrice ? (
                <div className="text-2xl font-bold text-gray-900">{formatUsd(goldPrice)}</div>
              ) : (
                <div className="text-2xl font-bold text-gray-400">--</div>
              )}
              {currentReturn !== null && (
                <div className="text-[10px] text-amber-700 mt-0.5">
                  +{Math.round(currentReturn)}% from 2015 cycle start
                </div>
              )}
            </div>
            <div className="text-right space-y-1">
              {thesisData && (
                <div className={`inline-block text-xs font-semibold px-2 py-1 rounded ${COMPOSITE_CONFIG[thesisData.compositeRating].color}`}>
                  {thesisData.compositeScore}/100 {COMPOSITE_CONFIG[thesisData.compositeRating].label}
                </div>
              )}
              {goldData?.gld && (
                <div className={`text-xs font-medium ${goldData.gld.changePercent >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                  GLD {goldData.gld.changePercent >= 0 ? "+" : ""}{goldData.gld.changePercent.toFixed(2)}%
                </div>
              )}
              {athDist !== null && (
                <div className={`text-[10px] ${athDist >= 0 ? "text-emerald-600" : "text-gray-500"}`}>
                  {athDist >= 0 ? "New ATH" : `${athDist.toFixed(1)}% from ATH`}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Cycle Phase */}
        <CyclePhaseIndicator phase={cyclePhase} />

        {/* Historical Cycles */}
        <HistoricalCycles currentReturn={currentReturn} />

        {/* Live Ratios */}
        <RatiosGrid ratios={goldData?.ratios ?? null} />

        {/* Signal Panel */}
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-6 bg-gray-100 rounded animate-pulse" />
            ))}
          </div>
        ) : thesisData ? (
          <div className="space-y-3">
            <SignalGroup title="Primary Signals" signals={primarySignals} />
            <SignalGroup title="Secondary Signals" signals={secondarySignals} />
            <SignalGroup title="Contrarian Checks" signals={sentimentSignals} />
          </div>
        ) : null}

        {/* Pre-Commitment Contract */}
        {thesisData?.preCommitment && (
          <div>
            <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1 px-2">
              Pre-Commitment
            </div>
            <div className="space-y-0.5 border rounded-lg py-1">
              {thesisData.preCommitment.rules.map((rule, i) => (
                <PreCommitmentRow key={i} rule={rule} />
              ))}
            </div>
          </div>
        )}

        {/* Catalysts */}
        {goldData?.analysis?.catalysts && (
          <CatalystsPanel catalysts={goldData.analysis.catalysts} />
        )}

        {/* Key Levels & Strategy */}
        <StrategyLevels
          goldPrice={goldPrice}
          ema50={goldData?.movingAverages?.ema50 ?? null}
          ema200={goldData?.movingAverages?.ema200 ?? null}
          keyLevels={goldData?.analysis?.keyLevels ?? []}
        />

        {/* Decision Log */}
        {thesisData && (
          <div>
            <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1 px-2">
              Recent Decisions
            </div>
            {thesisData.recentDecisions.length > 0 ? (
              <div className="space-y-1">
                {thesisData.recentDecisions.map((d) => (
                  <div key={d.id} className="flex items-center gap-2 text-[10px] px-2 py-1 rounded hover:bg-gray-50">
                    <span className="text-gray-400 w-14 shrink-0">
                      {d.createdAt ? new Date(d.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "--"}
                    </span>
                    <span className="font-medium text-gray-700 capitalize w-10">{d.decisionType}</span>
                    {d.quantity && <span className="text-gray-500">{d.quantity}</span>}
                    {d.priceAtDecision && (
                      <span className="text-gray-400 font-mono">{formatUsd(d.priceAtDecision)}</span>
                    )}
                    {d.reasoning && (
                      <span className="text-gray-400 truncate flex-1" title={d.reasoning}>
                        &ldquo;{d.reasoning}&rdquo;
                      </span>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-[10px] text-gray-400 px-2">No decisions logged yet</div>
            )}
            <DecisionForm
              goldPrice={goldPrice}
              onSubmit={() => mutate("/api/thesis/gold")}
            />
          </div>
        )}

        {/* Thesis Notes — qualitative narrative only */}
        {goldData?.analysis?.thesisNotes && (
          <div>
            <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1 px-2">
              Thesis Notes
            </div>
            <div className="text-xs text-gray-600 bg-gray-50 rounded-lg p-3 prose prose-xs prose-gray max-w-none [&_table]:w-full [&_table]:text-[10px] [&_th]:text-left [&_th]:py-1 [&_th]:px-2 [&_th]:border-b [&_th]:border-gray-200 [&_th]:font-semibold [&_td]:py-1 [&_td]:px-2 [&_td]:border-b [&_td]:border-gray-100">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {goldData.analysis.thesisNotes}
              </ReactMarkdown>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
