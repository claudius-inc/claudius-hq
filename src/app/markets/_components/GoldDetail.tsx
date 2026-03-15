"use client";

import useSWR, { mutate } from "swr";
import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import {
  TrendingUp,
  TrendingDown,
  Target,
  ChevronDown,
  ChevronRight,
  Plus,
} from "lucide-react";
import type { EvaluatedSignal, SignalRating, CompositeRating, RuleEvaluation } from "@/lib/thesis/types";

// ── Types ──────────────────────────────────────────────────────────

interface GoldData {
  livePrice: number | null;
  dxy: { price: number; changePercent: number } | null;
  realYields: { value: number; tips?: number | null } | null;
  gld: { price: number; changePercent: number } | null;
  analysis: {
    ath: number | null;
    athDate: string | null;
    keyLevels?: Array<{ level: number; significance: string }>;
    scenarios?: Array<{ name: string; target: number; probability: number; thesis: string }>;
    thesisNotes?: string;
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

// ── Signal Panel ───────────────────────────────────────────────────

function SignalRow({ signal }: { signal: EvaluatedSignal }) {
  const cfg = RATING_CONFIG[signal.rating];
  return (
    <div className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-gray-50">
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <span className="text-xs font-medium text-gray-900 w-24 shrink-0">{signal.name}</span>
        <span className="text-xs text-gray-600 font-mono">
          {formatSignalValue(signal.currentValue, signal.unit)}
        </span>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${cfg.color}`}>
          {cfg.icon} {cfg.label}
        </span>
      </div>
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

// ── Collapsible Section ────────────────────────────────────────────

function CollapsibleSection({
  title,
  children,
  defaultOpen = false,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 text-xs font-semibold text-gray-900 hover:text-gray-700 w-full text-left py-1"
      >
        {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        {title}
      </button>
      {open && <div className="mt-2">{children}</div>}
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

  const primarySignals = thesisData?.signals.filter((s) => s.category === "primary") ?? [];
  const secondarySignals = thesisData?.signals.filter((s) => s.category === "secondary") ?? [];
  const sentimentSignals = thesisData?.signals.filter((s) => s.category === "sentiment") ?? [];

  const isLoading = goldLoading || thesisLoading;

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

        {/* Key Levels (collapsed) */}
        {goldData?.analysis?.keyLevels && goldData.analysis.keyLevels.length > 0 && (
          <CollapsibleSection title="Key Levels">
            <div className="space-y-1.5">
              {goldData.analysis.keyLevels.map((level, i) => {
                const isAbove = goldPrice && goldPrice >= level.level;
                return (
                  <div key={i} className={`flex items-center justify-between rounded-lg p-2 border ${isAbove ? "bg-emerald-50 border-emerald-200" : "bg-gray-50 border-gray-200"}`}>
                    <div className="flex items-center gap-2">
                      {isAbove ? (
                        <TrendingUp className="w-3 h-3 text-emerald-500" />
                      ) : (
                        <TrendingDown className="w-3 h-3 text-gray-400" />
                      )}
                      <span className="text-xs font-medium text-gray-900">{formatUsd(level.level)}</span>
                    </div>
                    <span className="text-[10px] text-gray-500">{level.significance}</span>
                  </div>
                );
              })}
            </div>
          </CollapsibleSection>
        )}

        {/* Scenarios (collapsed) */}
        {goldData?.analysis?.scenarios && goldData.analysis.scenarios.length > 0 && (
          <CollapsibleSection title="Scenarios">
            <div className="space-y-2">
              {goldData.analysis.scenarios.map((scenario, i) => (
                <div key={i} className="bg-gray-50 rounded-lg p-2.5">
                  <div className="flex justify-between items-center mb-0.5">
                    <span className="text-xs font-semibold text-gray-900">{scenario.name}</span>
                    <span className="text-[10px] text-gray-500">{scenario.probability}% prob</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] text-gray-600">{scenario.thesis}</span>
                    <span className="text-xs font-medium text-amber-600">{formatUsd(scenario.target)}</span>
                  </div>
                </div>
              ))}
            </div>
          </CollapsibleSection>
        )}

        {/* Thesis Notes (collapsed) */}
        {goldData?.analysis?.thesisNotes && (
          <CollapsibleSection title="Thesis Notes">
            <div className="text-xs text-gray-600 bg-gray-50 rounded-lg p-3 whitespace-pre-wrap">
              {goldData.analysis.thesisNotes}
            </div>
          </CollapsibleSection>
        )}
      </div>
    </Modal>
  );
}
