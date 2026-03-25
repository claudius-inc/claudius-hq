"use client";

import { useState } from "react";
import { Info } from "lucide-react";
import { Modal } from "@/components/ui/Modal";

type ScoringMode = "quant" | "value" | "growth" | "combined";

interface MetricRow {
  metric: string;
  thresholds: string;
  max: number;
}

interface Section {
  name: string;
  points: number;
  metrics: MetricRow[];
}

const QUANT_SECTIONS: Section[] = [
  {
    name: "Quality - Profitability",
    points: 25,
    metrics: [
      { metric: "ROE", thresholds: ">20%: 10, >15%: 7, >10%: 4", max: 10 },
      { metric: "Gross Margin", thresholds: ">50%: 8, >40%: 6, >30%: 4", max: 8 },
      { metric: "FCF Positive", thresholds: "Yes: 7, No: 0", max: 7 },
    ],
  },
  {
    name: "Quality - Stability",
    points: 15,
    metrics: [
      { metric: "Debt/Equity", thresholds: "<30%: 8, <60%: 5, <100%: 2", max: 8 },
      { metric: "Earnings Positive", thresholds: "Yes: 7, No: 0", max: 7 },
    ],
  },
  {
    name: "Value",
    points: 25,
    metrics: [
      { metric: "EV/EBITDA", thresholds: "<8: 10, <12: 7, <16: 4", max: 10 },
      { metric: "P/B", thresholds: "<1.5: 8, <2.5: 5, <4: 2", max: 8 },
      { metric: "FCF Yield", thresholds: ">8%: 7, >5%: 5, >3%: 3", max: 7 },
    ],
  },
  {
    name: "Momentum",
    points: 15,
    metrics: [
      { metric: "Price vs SMA200", thresholds: ">10%: 8, >0%: 5, >-10%: 2", max: 8 },
      { metric: "Not Overextended", thresholds: "<25% above: 7, <40%: 4", max: 7 },
    ],
  },
  {
    name: "Size",
    points: 10,
    metrics: [
      { metric: "Market Cap $500M-$5B", thresholds: "10 pts", max: 10 },
      { metric: "Market Cap $5B-$20B", thresholds: "7 pts", max: 7 },
      { metric: "Market Cap $20B-$100B", thresholds: "4 pts", max: 4 },
    ],
  },
  {
    name: "Shareholder Yield",
    points: 10,
    metrics: [
      { metric: "Div + Buyback Yield", thresholds: ">4%: 10, >2%: 6, >1%: 3", max: 10 },
    ],
  },
];

const VALUE_SECTIONS: Section[] = [
  {
    name: "Valuation",
    points: 40,
    metrics: [
      { metric: "EV/EBITDA", thresholds: "<6: 12, <8: 10, <10: 7, <14: 4", max: 12 },
      { metric: "Earnings Yield Spread", thresholds: ">6%: 10, >4%: 8, >2%: 5", max: 10 },
      { metric: "P/FCF", thresholds: "<10: 10, <15: 7, <20: 4", max: 10 },
      { metric: "P/B", thresholds: "<1: 8, <1.5: 6, <2.5: 4", max: 8 },
    ],
  },
  {
    name: "Cash Generation",
    points: 25,
    metrics: [
      { metric: "FCF Yield", thresholds: ">10%: 10, >7%: 8, >5%: 6", max: 10 },
      { metric: "FCF Margin", thresholds: ">20%: 8, >12%: 6, >6%: 4", max: 8 },
      { metric: "FCF/Debt", thresholds: ">0.5: 7, >0.25: 5, >0.15: 3", max: 7 },
    ],
  },
  {
    name: "Quality & Durability",
    points: 25,
    metrics: [
      { metric: "ROIC", thresholds: ">20%: 10, >15%: 8, >12%: 6", max: 10 },
      { metric: "Interest Coverage", thresholds: ">10x: 6, >6x: 5, >4x: 3", max: 6 },
      { metric: "Debt/Equity", thresholds: "<30%: 5, <60%: 4, <100%: 3", max: 5 },
      { metric: "ROE", thresholds: ">18%: 4, >12%: 3, >8%: 2", max: 4 },
    ],
  },
  {
    name: "Dividend",
    points: 10,
    metrics: [
      { metric: "Dividend Yield", thresholds: ">4%: 5, >2.5%: 4, >1.5%: 3", max: 5 },
      { metric: "Payout Ratio", thresholds: "20-50%: 5, 50-70%: 4", max: 5 },
    ],
  },
];

const GROWTH_SECTIONS: Section[] = [
  {
    name: "Revenue Growth",
    points: 40,
    metrics: [
      { metric: "3Y CAGR", thresholds: ">100%: 15, >50%: 11, >25%: 7", max: 15 },
      { metric: "YoY Growth", thresholds: ">150%: 15, >75%: 11, >35%: 7", max: 15 },
      { metric: "QoQ Growth", thresholds: ">30%: 10, >15%: 6, >5%: 2", max: 10 },
    ],
  },
  {
    name: "Growth Durability",
    points: 15,
    metrics: [
      { metric: "Acceleration", thresholds: ">10pp: 8, >5pp: 6, stable: 4", max: 8 },
      { metric: "Consistency", thresholds: "4/4 Q positive: 7, 3/4: 5", max: 7 },
    ],
  },
  {
    name: "Scalability",
    points: 15,
    metrics: [
      { metric: "Gross Margin", thresholds: ">70%: 10, >60%: 8, >50%: 6", max: 10 },
      { metric: "GM Trend", thresholds: "Improving >3pp: 5, stable: 3", max: 5 },
    ],
  },
  {
    name: "Momentum",
    points: 15,
    metrics: [
      { metric: "6M Return", thresholds: ">50%: 8, >30%: 7, >15%: 5", max: 8 },
      { metric: "3M Return", thresholds: ">25%: 7, >15%: 5, >5%: 4", max: 7 },
    ],
  },
  {
    name: "TAM Proxy",
    points: 15,
    metrics: [
      { metric: "P/S-to-Growth Ratio", thresholds: "<0.1: 10, <0.2: 8, <0.3: 6", max: 10 },
      { metric: "Market Cap Sweet Spot", thresholds: "$500M-$5B: 5, $5B-$20B: 4", max: 5 },
    ],
  },
];

const TIER_INFO = [
  { score: "≥80", tier: "🟢 HIGH CONVICTION", desc: "Strong across multiple factors" },
  { score: "65-79", tier: "🔵 WATCHLIST", desc: "Good score, worth researching" },
  { score: "50-64", tier: "🟡 SPECULATIVE", desc: "Mixed signals, higher risk" },
  { score: "<50", tier: "🔴 AVOID", desc: "Poor multi-factor profile" },
];

function MetricTable({ sections }: { sections: Section[] }) {
  return (
    <div className="space-y-4">
      {sections.map((section) => (
        <div key={section.name} className="overflow-hidden">
          <div className="flex items-center justify-between bg-gray-50 px-3 py-2 rounded-t-lg border border-gray-200 border-b-0">
            <span className="font-medium text-gray-900 text-sm">{section.name}</span>
            <span className="text-xs font-semibold text-gray-600 bg-gray-200 px-2 py-0.5 rounded">
              {section.points} pts
            </span>
          </div>
          <div className="border border-gray-200 rounded-b-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50/50">
                  <th className="text-left px-3 py-1.5 text-xs font-medium text-gray-500">Metric</th>
                  <th className="text-left px-3 py-1.5 text-xs font-medium text-gray-500">Thresholds</th>
                  <th className="text-right px-3 py-1.5 text-xs font-medium text-gray-500 w-16">Max</th>
                </tr>
              </thead>
              <tbody>
                {section.metrics.map((row, idx) => (
                  <tr key={row.metric} className={idx % 2 === 0 ? "bg-white" : "bg-gray-50/30"}>
                    <td className="px-3 py-1.5 text-gray-800 font-medium">{row.metric}</td>
                    <td className="px-3 py-1.5 text-gray-600 text-xs">{row.thresholds}</td>
                    <td className="px-3 py-1.5 text-right text-gray-700 font-semibold">{row.max}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}

function QuantTab() {
  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600 italic">
        Factor-based scoring using academically validated metrics — 100 points total
      </p>
      <MetricTable sections={QUANT_SECTIONS} />
    </div>
  );
}

function ValueTab() {
  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600 italic">
        Buffett/Klarman style: margin of safety, cash generation, durability — 100 points total
      </p>
      <MetricTable sections={VALUE_SECTIONS} />
      <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
        <p className="text-xs font-semibold text-amber-800 mb-1">Value Trap Flags (Info Only)</p>
        <ul className="text-xs text-amber-700 space-y-0.5">
          <li>🔴 Falling Knife: 6M return &lt; -40%</li>
          <li>🔴 Cash Burn: FCF negative 2+ years</li>
          <li>🟡 Margin Deterioration: GM down &gt;5pp YoY</li>
        </ul>
      </div>
    </div>
  );
}

function GrowthTab() {
  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600 italic">
        Hypergrowth-friendly: revenue velocity, scalability, unit economics — 100 points total
      </p>
      <MetricTable sections={GROWTH_SECTIONS} />
      <div className="mt-4 p-3 bg-purple-50 border border-purple-200 rounded-lg">
        <p className="text-xs font-semibold text-purple-800 mb-1">Hypergrowth Exception Rules</p>
        <ul className="text-xs text-purple-700 space-y-0.5">
          <li>• <strong>Profitability Bypass:</strong> If YoY &gt;100%, FCF/net income ignored</li>
          <li>• <strong>GM Gate:</strong> Must have GM ≥40% even for hypergrowth</li>
          <li>• <strong>Bonus +5 pts:</strong> If YoY &gt;150% AND GM &gt;50% AND accelerating</li>
        </ul>
      </div>
    </div>
  );
}

function CombinedTab() {
  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600 italic">
        The Combined Score averages all three modes equally
      </p>
      
      <div className="p-4 bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-200 rounded-lg">
        <p className="text-center font-mono text-lg text-indigo-800 font-semibold">
          Combined = (Quant + Value + Growth) / 3
        </p>
      </div>

      <p className="text-sm text-gray-600">
        Stocks scoring high across all three modes are rare &quot;universal quality&quot; opportunities.
      </p>

      <div className="mt-4">
        <h4 className="font-semibold text-gray-900 mb-2 text-sm">Tier Classification</h4>
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50">
                <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Score</th>
                <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Tier</th>
                <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Interpretation</th>
              </tr>
            </thead>
            <tbody>
              {TIER_INFO.map((row, idx) => (
                <tr key={row.tier} className={idx % 2 === 0 ? "bg-white" : "bg-gray-50/50"}>
                  <td className="px-3 py-2 font-mono text-gray-800">{row.score}</td>
                  <td className="px-3 py-2 font-medium">{row.tier}</td>
                  <td className="px-3 py-2 text-gray-600 text-xs">{row.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-4 p-3 bg-gray-50 border border-gray-200 rounded-lg">
        <p className="text-xs font-semibold text-gray-700 mb-1">Data Sources</p>
        <p className="text-xs text-gray-600">
          All metrics from Yahoo Finance API: financialData, defaultKeyStatistics, earnings, price, summaryDetail
        </p>
      </div>
    </div>
  );
}

const TAB_CONFIG: { key: ScoringMode; label: string; icon: string }[] = [
  { key: "quant", label: "Quant", icon: "🔢" },
  { key: "value", label: "Value", icon: "💰" },
  { key: "growth", label: "Growth", icon: "🚀" },
  { key: "combined", label: "Combined", icon: "⚖️" },
];

export function MethodologyModal() {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<ScoringMode>("combined");

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
        title="Scoring Methodology"
      >
        <Info size={16} />
        <span className="hidden sm:inline">Methodology</span>
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title="Scoring Methodology" size="lg">
        {/* Tabs */}
        <div className="flex gap-1 mb-4 p-1 bg-gray-100 rounded-lg overflow-x-auto">
          {TAB_CONFIG.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 min-w-0 flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${
                activeTab === tab.key
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
              }`}
            >
              <span>{tab.icon}</span>
              <span className="hidden xs:inline">{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="min-h-[300px]">
          {activeTab === "quant" && <QuantTab />}
          {activeTab === "value" && <ValueTab />}
          {activeTab === "growth" && <GrowthTab />}
          {activeTab === "combined" && <CombinedTab />}
        </div>
      </Modal>
    </>
  );
}
