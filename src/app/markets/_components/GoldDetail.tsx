"use client";

import useSWR, { mutate } from "swr";
import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import {
  TrendingUp,
  TrendingDown,
  Plus,
  AlertTriangle,
  Info,
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
  "strong-buy": { label: "ACCUMULATE", color: "text-emerald-700 bg-emerald-100" },
  buy: { label: "ACCUMULATE", color: "text-emerald-600 bg-emerald-50" },
  neutral: { label: "HOLD", color: "text-gray-600 bg-gray-100" },
  caution: { label: "CAUTION", color: "text-amber-600 bg-amber-50" },
  avoid: { label: "AVOID", color: "text-red-600 bg-red-50" },
};

function formatSignalValue(value: number | null, unit: string): string {
  if (value === null) return "--";
  if (unit === "%") return `${value.toFixed(1)}%`;
  if (unit === "bps") return `${Math.round(value)}bps`;
  if (unit === "T") return `${value.toLocaleString()}T`;
  if (unit === "%ile") return `${Math.round(value)}th%ile`;
  return value.toFixed(2);
}

// ── Synthesis Generator ───────────────────────────────────────────

function generateSynthesis(signals: EvaluatedSignal[]): string {
  const cbSignal = signals.find((s) => s.id === "cb-demand");
  const tipsSignal = signals.find((s) => s.id === "tips-yield");
  const dxySignal = signals.find((s) => s.id === "dxy");
  const m2Signal = signals.find((s) => s.id === "m2-growth");

  const cbBullish = cbSignal && ["strong-bullish", "bullish"].includes(cbSignal.rating);
  const tipsBearish = tipsSignal && ["bearish", "strong-bearish"].includes(tipsSignal.rating);
  const dxyBullish = dxySignal && ["strong-bullish", "bullish"].includes(dxySignal.rating);
  const m2Bullish = m2Signal && ["strong-bullish", "bullish"].includes(m2Signal.rating);

  // CB buying overriding real yields headwind
  if (cbBullish && tipsBearish) {
    return "CB buying (1000T+/yr) overriding real yield headwind. Secular bull intact.";
  }

  // All bullish
  if (cbBullish && !tipsBearish && dxyBullish && m2Bullish) {
    return "All macro drivers aligned bullish. Strong accumulation environment.";
  }

  // Dollar weakness driving
  if (dxyBullish && !cbBullish) {
    return "Dollar weakness supporting gold. Watch for CB demand confirmation.";
  }

  // Mixed signals
  const bullishCount = signals.filter((s) => ["strong-bullish", "bullish"].includes(s.rating)).length;
  const bearishCount = signals.filter((s) => ["bearish", "strong-bearish"].includes(s.rating)).length;

  if (bullishCount > bearishCount) {
    return "Net bullish signal mix. Secular bull continues with near-term crosscurrents.";
  }

  if (bearishCount > bullishCount) {
    return "Caution: More headwinds than tailwinds. Watch for thesis deterioration.";
  }

  return "Mixed signals. Hold existing position, no new adds.";
}

// ── CFTC Warning Badge ────────────────────────────────────────────

function CftcWarningBadge({ signal }: { signal: EvaluatedSignal | undefined }) {
  if (!signal || signal.currentValue === null) return null;
  
  const percentile = signal.currentValue;
  const isCrowded = percentile > 75;
  const isWashedOut = percentile < 25;
  
  if (!isCrowded && !isWashedOut) return null;
  
  return (
    <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border ${
      isCrowded 
        ? "bg-amber-50 border-amber-200 text-amber-700" 
        : "bg-blue-50 border-blue-200 text-blue-700"
    }`}>
      <AlertTriangle className="w-3.5 h-3.5" />
      <span className="text-xs font-medium">
        {isCrowded 
          ? `CFTC Crowded (${Math.round(percentile)}th %ile)` 
          : `CFTC Washed Out (${Math.round(percentile)}th %ile)`
        }
      </span>
    </div>
  );
}

// ── Key Ratios with Health Colors ─────────────────────────────────

interface RatioHealth {
  color: string;
  label: string;
}

function getRatioHealth(key: string, value: number): RatioHealth {
  switch (key) {
    case "dowGold":
      // Higher = gold cheap relative to stocks
      if (value > 8) return { color: "border-emerald-300 bg-emerald-50", label: "Gold cheap" };
      if (value < 4) return { color: "border-red-300 bg-red-50", label: "Gold expensive" };
      return { color: "border-amber-300 bg-amber-50", label: "Fair value" };
    case "goldSilver":
      // Higher = silver cheap relative to gold
      if (value > 80) return { color: "border-emerald-300 bg-emerald-50", label: "Silver cheap" };
      if (value < 50) return { color: "border-red-300 bg-red-50", label: "Silver rich" };
      return { color: "border-amber-300 bg-amber-50", label: "Normal" };
    case "m2Gold":
      // Higher = gold cheap relative to money supply
      if (value > 5) return { color: "border-emerald-300 bg-emerald-50", label: "Gold cheap" };
      if (value < 3) return { color: "border-red-300 bg-red-50", label: "Gold expensive" };
      return { color: "border-amber-300 bg-amber-50", label: "Fair value" };
    default:
      return { color: "border-gray-200 bg-gray-50", label: "" };
  }
}

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
          const health = getRatioHealth(key, value);
          return (
            <div key={key} className={`rounded-lg p-2.5 border-2 ${health.color}`}>
              <div className="text-[10px] text-gray-500 mb-0.5">{info.label}</div>
              <div className="text-sm font-bold text-gray-900 font-mono">{value.toFixed(1)}</div>
              {health.label && (
                <div className="text-[9px] font-medium text-gray-600 mt-0.5">
                  {health.label}
                </div>
              )}
              <div className="text-[9px] text-gray-400 mt-0.5">
                {info.peakLabel}: {info.peak}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Signal Explanations & Triggers ────────────────────────────────

const SIGNAL_FRIENDLY_NAME: Record<string, string> = {
  "tips-yield": "Real Yields (TIPS)",
  "cb-demand": "Central Bank Buying",
  "m2-growth": "M2 Money Supply Growth",
  "dxy": "US Dollar (DXY)",
  "deficit-gdp": "US Deficit / GDP",
  "etf-flow-momentum": "ETF Flow Momentum",
  "cftc-net-spec": "Speculative Positioning",
};

const SIGNAL_TRIGGERS: Record<string, string> = {
  "tips-yield": "Watch: Fed pivot, CPI surprise",
  "cb-demand": "Watch: PBOC/RBI quarterly reports",
  "dxy": "Watch: EUR moves, USD liquidity",
  "m2-growth": "Watch: Fed balance sheet, QE/QT shifts",
  "etf-flow-momentum": "Watch: GLD holdings weekly change",
  "deficit-gdp": "Watch: Budget negotiations, recession",
  "cftc-net-spec": "Watch: COT report Fridays",
};

const SIGNAL_EXPLANATIONS: Record<string, Record<string, string>> = {
  "tips-yield": {
    "strong-bullish": "Real yields deeply negative - gold thrives when cash loses purchasing power",
    bullish: "Real yields low - holding gold costs little vs bonds",
    neutral: "Real yields moderate - neither helping nor hurting gold",
    bearish: "Real yields elevated - bonds offer real return, competing with gold",
    "strong-bearish": "Real yields high - strong headwind, bonds much more attractive than gold",
  },
  "cb-demand": {
    "strong-bullish": "Central banks buying aggressively (>1,000T/yr) - structural floor under prices",
    bullish: "Central banks buying steadily - supports demand",
    neutral: "Central bank buying at normal levels",
    bearish: "Central bank buying below trend",
    "strong-bearish": "Central banks not buying - missing a key demand pillar",
  },
  "m2-growth": {
    "strong-bullish": "Money supply expanding rapidly (>8% YoY) - strong debasement tailwind",
    bullish: "M2 growing above trend - supportive for gold",
    neutral: "Money supply growth moderate",
    bearish: "M2 growth slowing - less monetary inflation pressure",
    "strong-bearish": "Money supply contracting - deflationary, headwind for gold",
  },
  dxy: {
    "strong-bullish": "Dollar very weak - gold priced in USD gets cheaper for global buyers",
    bullish: "Dollar soft - tailwind for gold prices",
    neutral: "Dollar in middle range - no strong push either way",
    bearish: "Dollar strong - makes gold expensive for foreign buyers",
    "strong-bearish": "Dollar surging - major headwind for gold",
  },
  "deficit-gdp": {
    "strong-bullish": "Deficit >6% of GDP - crisis-level spending without a crisis, serious debasement risk",
    bullish: "Deficit 4.5-6% - well above the 3% sustainability line",
    neutral: "Deficit around 3% - roughly the level that stabilizes debt-to-GDP ratio",
    bearish: "Deficit below 3% - fiscal position improving",
    "strong-bearish": "Near surplus - strong fiscal discipline, removes a key gold catalyst",
  },
  "etf-flow-momentum": {
    "strong-bullish": "Strong ETF inflows - institutional buying momentum",
    bullish: "Positive ETF flows - demand building",
    neutral: "ETF flows flat - no clear direction",
    bearish: "ETF outflows - selling pressure",
    "strong-bearish": "Heavy ETF redemptions - institutions exiting",
  },
  "cftc-net-spec": {
    "strong-bullish": "Speculators underweight - room for new buying to push prices up",
    bullish: "Positioning light - not crowded, healthy setup",
    neutral: "Positioning average - no extreme signal",
    bearish: "Speculators getting crowded - less room for new longs",
    "strong-bearish": "Extremely crowded long - contrarian warning, vulnerable to a shakeout",
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

// ── Signal Row with Trigger ───────────────────────────────────────

function SignalRow({ signal }: { signal: EvaluatedSignal }) {
  const cfg = RATING_CONFIG[signal.rating];
  const friendlyName = SIGNAL_FRIENDLY_NAME[signal.id] ?? signal.name;
  const explanation = getExplanation(signal);
  const trigger = SIGNAL_TRIGGERS[signal.id];
  const showRealYieldsNote = signal.id === "tips-yield" && ["bearish", "strong-bearish"].includes(signal.rating);

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
      {trigger && (
        <div className="text-[9px] text-blue-600 mt-0.5 font-medium">
          {trigger}
        </div>
      )}
      {showRealYieldsNote && (
        <div className="flex items-start gap-1 mt-1.5 p-1.5 bg-blue-50 rounded border border-blue-100">
          <Info className="w-3 h-3 text-blue-500 mt-0.5 shrink-0" />
          <span className="text-[9px] text-blue-700 leading-tight">
            Note: Gold has rallied despite positive real yields since 2022 because central bank buying has been the dominant driver.
          </span>
        </div>
      )}
      <SignalRangeBar signal={signal} />
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
    { era: "1970s", range: "$35 -> $850", pct: 2329, driver: "Nixon shock, inflation" },
    { era: "2000s", range: "$255 -> $1,921", pct: 653, driver: "GFC, QE" },
    { era: "Current", range: "$1,050 -> ?", pct: currentReturn, driver: "De-dollarization, fiscal dominance" },
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
  const bullStartPrice = 1050;
  const currentReturn = goldPrice ? ((goldPrice - bullStartPrice) / bullStartPrice) * 100 : null;

  // Filter signals: exclude warning-only signals from main display
  const scoredSignals = thesisData?.signals.filter((s) => s.category !== "warning") ?? [];
  const cftcSignal = thesisData?.signals.find((s) => s.id === "cftc-net-spec");

  // Generate synthesis line
  const synthesis = thesisData ? generateSynthesis(thesisData.signals) : null;

  const isLoading = goldLoading || thesisLoading;

  return (
    <Modal open={open} onClose={onClose} title="Gold Analysis" size="lg">
      <div className="space-y-5">
        {/* 1. Price Card with Composite Score + Synthesis */}
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
                <div className={`inline-block text-sm font-bold px-3 py-1.5 rounded ${COMPOSITE_CONFIG[thesisData.compositeRating].color}`}>
                  {thesisData.compositeScore}/100 - {COMPOSITE_CONFIG[thesisData.compositeRating].label}
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
          
          {/* Synthesis Line */}
          {synthesis && (
            <div className="mt-3 text-xs text-gray-700 font-medium bg-white/60 rounded px-2.5 py-1.5 border border-amber-200">
              {synthesis}
            </div>
          )}
          
          {/* CFTC Warning Badge */}
          <div className="mt-2">
            <CftcWarningBadge signal={cftcSignal} />
          </div>
        </div>

        {/* 2. Signal Panel - scored signals with triggers */}
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-6 bg-gray-100 rounded animate-pulse" />
            ))}
          </div>
        ) : thesisData && scoredSignals.length > 0 ? (
          <div>
            <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1 px-2">
              Thesis Signals
            </div>
            <div className="space-y-0.5">
              {scoredSignals.map((s) => (
                <SignalRow key={s.id} signal={s} />
              ))}
            </div>
          </div>
        ) : null}

        {/* 3. Key Ratios with health colors */}
        <RatiosGrid ratios={goldData?.ratios ?? null} />

        {/* 4. Historical Bull Markets */}
        <HistoricalCycles currentReturn={currentReturn} />

        {/* 5. Pre-Commitment Contract */}
        {thesisData?.preCommitment && (
          <div>
            <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1 px-2">
              Pre-Commitment Rules
            </div>
            <div className="space-y-0.5 border rounded-lg py-1">
              {thesisData.preCommitment.rules.map((rule, i) => (
                <PreCommitmentRow key={i} rule={rule} />
              ))}
            </div>
          </div>
        )}

        {/* 6. Recent Decisions */}
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
      </div>
    </Modal>
  );
}
