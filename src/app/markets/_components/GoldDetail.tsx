"use client";

import { useState } from "react";
import useSWR from "swr";
import { Modal } from "@/components/ui/Modal";
import {
  AlertTriangle,
  ChevronDown,
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

function formatSignalValue(value: number | null, unit: string): string {
  if (value === null) return "--";
  if (unit === "%") return `${value.toFixed(1)}%`;
  if (unit === "bps") return `${Math.round(value)}bps`;
  if (unit === "T") return `${value.toLocaleString()}T`;
  if (unit === "%ile") return `${Math.round(value)}th%ile`;
  return value.toFixed(2);
}

// ── Structural / Tactical Scoring ─────────────────────────────────

const STRUCTURAL_IDS = ["cb-demand", "m2-gold-ratio", "deficit-gdp"];
const TACTICAL_IDS = ["tips-yield", "dxy"];

type ThesisStatus = "INTACT" | "WEAKENING" | "BROKEN";
type TimingStatus = "BUY" | "HOLD" | "WAIT";

function computeGroupScore(signals: EvaluatedSignal[], ids: string[]): number {
  let totalWeight = 0;
  let totalWeightedScore = 0;
  for (const id of ids) {
    const s = signals.find((sig) => sig.id === id);
    if (s && s.currentValue !== null) {
      totalWeight += s.weight;
      totalWeightedScore += s.score * s.weight;
    }
  }
  return totalWeight > 0 ? totalWeightedScore / totalWeight : 50;
}

function getThesisStatus(score: number): ThesisStatus {
  if (score >= 55) return "INTACT";
  if (score >= 30) return "WEAKENING";
  return "BROKEN";
}

function getTimingStatus(score: number): TimingStatus {
  if (score >= 65) return "BUY";
  if (score >= 40) return "HOLD";
  return "WAIT";
}

const THESIS_STATUS_CONFIG: Record<ThesisStatus, { color: string; bg: string }> = {
  INTACT: { color: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200" },
  WEAKENING: { color: "text-amber-700", bg: "bg-amber-50 border-amber-200" },
  BROKEN: { color: "text-red-700", bg: "bg-red-50 border-red-200" },
};

const TIMING_STATUS_CONFIG: Record<TimingStatus, { color: string; bg: string }> = {
  BUY: { color: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200" },
  HOLD: { color: "text-gray-700", bg: "bg-gray-50 border-gray-200" },
  WAIT: { color: "text-amber-700", bg: "bg-amber-50 border-amber-200" },
};

// ── Synthesis Generator ───────────────────────────────────────────

const SYNTHESIS_MATRIX: Record<ThesisStatus, Record<TimingStatus, string>> = {
  INTACT: {
    BUY: "Structural bull intact and tactical window open. Accumulation environment.",
    HOLD: "Bull thesis intact but tactical signals mixed. Hold, wait for better entry to add.",
    WAIT: "Bull thesis intact but tactical headwinds. Hold existing, don\u2019t add until timing improves.",
  },
  WEAKENING: {
    BUY: "Structural cracks appearing but tactical window open. Smaller sizes warranted.",
    HOLD: "Thesis weakening with mixed timing. Review position sizing.",
    WAIT: "Thesis weakening and tactical headwinds. Consider trimming on rallies.",
  },
  BROKEN: {
    BUY: "Structural thesis broken. Exit plan triggered.",
    HOLD: "Structural thesis broken. Exit plan triggered.",
    WAIT: "Structural thesis broken. Exit plan triggered.",
  },
};

function generateSynthesis(thesis: ThesisStatus, timing: TimingStatus): string {
  return SYNTHESIS_MATRIX[thesis][timing];
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


// ── Signal Explanations & Triggers ────────────────────────────────

const SIGNAL_FRIENDLY_NAME: Record<string, string> = {
  "tips-yield": "Real Yields (TIPS)",
  "cb-demand": "Central Bank Buying",
  "m2-gold-ratio": "M2 / Gold Ratio",
  "dxy": "US Dollar (DXY)",
  "deficit-gdp": "US Deficit / GDP",
  "cftc-net-spec": "Speculative Positioning",
};

const SIGNAL_TRIGGERS: Record<string, string> = {
  "tips-yield": "Watch: Fed pivot, CPI surprise",
  "cb-demand": "Watch: PBOC/RBI quarterly reports",
  "dxy": "Watch: EUR moves, USD liquidity",
  "m2-gold-ratio": "Watch: FRED M2SL monthly release, gold price moves",
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
  "m2-gold-ratio": {
    "strong-bullish": "Gold very cheap vs money supply - strong structural undervaluation",
    bullish: "Gold cheap relative to M2 - room to appreciate",
    neutral: "Gold fairly valued relative to money supply",
    bearish: "Gold rich vs M2 - less upside from valuation",
    "strong-bearish": "Gold expensive relative to money supply - valuation headwind",
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

// ── Expandable Signal Row ─────────────────────────────────────────

function ExpandableSignalRow({ signal }: { signal: EvaluatedSignal }) {
  const [expanded, setExpanded] = useState(false);
  const cfg = RATING_CONFIG[signal.rating];
  const friendlyName = SIGNAL_FRIENDLY_NAME[signal.id] ?? signal.name;
  const explanation = getExplanation(signal);
  const trigger = SIGNAL_TRIGGERS[signal.id];
  const showRealYieldsNote = signal.id === "tips-yield" && ["bearish", "strong-bearish"].includes(signal.rating);

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between py-1.5 px-2 rounded hover:bg-gray-50 text-left"
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[11px] font-medium text-gray-800">{friendlyName}</span>
          <span className="text-[11px] text-gray-500 font-mono">
            {formatSignalValue(signal.currentValue, signal.unit)}
          </span>
          <TrendArrow signal={signal} />
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${cfg.color}`}>
            {cfg.label}
          </span>
          <ChevronDown className={`w-3 h-3 text-gray-400 transition-transform ${expanded ? "rotate-180" : ""}`} />
        </div>
      </button>
      {expanded && (
        <div className="px-2 pb-2">
          <div className="text-[10px] text-gray-500 leading-relaxed">
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
          {signal.id === "cb-demand" && (
            <div className="text-[9px] text-gray-400 mt-1">
              Data as of Q4 2025 (WGC annual report)
            </div>
          )}
          <SignalRangeBar signal={signal} />
        </div>
      )}
    </div>
  );
}

// ── Assessment Card ───────────────────────────────────────────────

function AssessmentCard({
  title,
  question,
  status,
  statusConfig,
  signals,
  score,
}: {
  title: string;
  question: string;
  status: string;
  statusConfig: { color: string; bg: string };
  signals: EvaluatedSignal[];
  score: number;
}) {
  return (
    <div className="rounded-lg border bg-white p-3">
      <div className="flex items-start justify-between mb-1">
        <div>
          <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{title}</div>
          <div className="text-[10px] text-gray-500 italic">{question}</div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-[10px] text-gray-400 font-mono">{Math.round(score)}</span>
          <span className={`text-xs font-bold px-2 py-0.5 rounded border ${statusConfig.bg} ${statusConfig.color}`}>
            {status}
          </span>
        </div>
      </div>
      <div className="space-y-0">
        {signals.map((s) => (
          <ExpandableSignalRow key={s.id} signal={s} />
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


// ── Main Component ─────────────────────────────────────────────────

export function GoldDetail({ open, onClose }: GoldDetailProps) {
  const [rulesExpanded, setRulesExpanded] = useState(false);

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

  const allSignals = thesisData?.signals ?? [];
  const cftcSignal = allSignals.find((s) => s.id === "cftc-net-spec");

  // Compute structural & tactical scores
  const structuralScore = computeGroupScore(allSignals, STRUCTURAL_IDS);
  const tacticalScore = computeGroupScore(allSignals, TACTICAL_IDS);
  const thesisStatus = getThesisStatus(structuralScore);
  const timingStatus = getTimingStatus(tacticalScore);

  const structuralSignals = STRUCTURAL_IDS.map((id) => allSignals.find((s) => s.id === id)).filter(Boolean) as EvaluatedSignal[];
  const tacticalSignals = TACTICAL_IDS.map((id) => allSignals.find((s) => s.id === id)).filter(Boolean) as EvaluatedSignal[];

  const synthesis = thesisData ? generateSynthesis(thesisStatus, timingStatus) : null;

  // Pre-commitment summary
  const rules = thesisData?.preCommitment?.rules ?? [];
  const rulesSummary = rules.map((r) => `${r.type.charAt(0).toUpperCase() + r.type.slice(1)}: ${r.metCount}/${r.totalCount}`).join(" · ");

  const isLoading = goldLoading || thesisLoading;

  return (
    <Modal open={open} onClose={onClose} title="Gold Analysis" size="lg">
      <div className="space-y-4">
        {/* 1. Price Card */}
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
            </div>
            <div className="text-right space-y-1">
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

        {/* 2. Two Assessment Cards */}
        {isLoading ? (
          <div className="grid grid-cols-2 gap-3">
            {[1, 2].map((i) => (
              <div key={i} className="h-32 bg-gray-100 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : thesisData ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <AssessmentCard
              title="Structural"
              question="Is the bull thesis intact?"
              status={thesisStatus}
              statusConfig={THESIS_STATUS_CONFIG[thesisStatus]}
              signals={structuralSignals}
              score={structuralScore}
            />
            <AssessmentCard
              title="Tactical"
              question="Is now a good entry?"
              status={timingStatus}
              statusConfig={TIMING_STATUS_CONFIG[timingStatus]}
              signals={tacticalSignals}
              score={tacticalScore}
            />
          </div>
        ) : null}

        {/* 3. Pre-Commitment Rules (collapsed by default) */}
        {thesisData?.preCommitment && (
          <div className="border rounded-lg">
            <button
              onClick={() => setRulesExpanded(!rulesExpanded)}
              className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-gray-50 rounded-lg"
            >
              <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                Pre-Commitment Rules
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-gray-500 font-mono">{rulesSummary}</span>
                <ChevronDown className={`w-3.5 h-3.5 text-gray-400 transition-transform ${rulesExpanded ? "rotate-180" : ""}`} />
              </div>
            </button>
            {rulesExpanded && (
              <div className="space-y-0.5 py-1 border-t">
                {rules.map((rule, i) => (
                  <PreCommitmentRow key={i} rule={rule} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
