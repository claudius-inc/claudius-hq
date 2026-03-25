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
      {
        metric: "Gross Margin",
        thresholds: ">50%: 8, >40%: 6, >30%: 4",
        max: 8,
      },
      { metric: "FCF Positive", thresholds: "Yes: 7, No: 0", max: 7 },
    ],
  },
  {
    name: "Quality - Stability",
    points: 20,
    metrics: [
      {
        metric: "Debt/Equity",
        thresholds: "<30%: 8, <60%: 5, <100%: 2",
        max: 8,
      },
      { metric: "Earnings Positive", thresholds: "Yes: 7, No: 0", max: 7 },
      { metric: "Earnings Quality", thresholds: "OCF > FCF: 5, OCF > 0: 3", max: 5 },
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
      {
        metric: "12M Return (or SMA200)",
        thresholds: ">30%: 10, >15%: 7, >0%: 4, >-10%: 2",
        max: 10,
      },
      {
        metric: "Not Overextended",
        thresholds: "<25% above SMA: 5, <40%: 3",
        max: 5,
      },
    ],
  },
  {
    name: "Shareholder Yield",
    points: 10,
    metrics: [
      {
        metric: "Div + Buyback Yield",
        thresholds: ">4%: 10, >2%: 6, >1%: 3",
        max: 10,
      },
    ],
  },
  {
    name: "Low Volatility",
    points: 5,
    metrics: [
      {
        metric: "Beta",
        thresholds: "<1.0: 5, <1.2: 3, <1.5: 1",
        max: 5,
      },
    ],
  },
];

const VALUE_SECTIONS: Section[] = [
  {
    name: "Valuation",
    points: 35,
    metrics: [
      {
        metric: "EV/EBITDA",
        thresholds: "<6: 12, <8: 10, <10: 7, <14: 4",
        max: 12,
      },
      {
        metric: "Earnings Yield Spread",
        thresholds: ">6%: 10, >4%: 8, >2%: 5, >0%: 2",
        max: 10,
      },
      { metric: "P/FCF", thresholds: "<10: 8, <15: 6, <20: 4, <25: 2", max: 8 },
      { metric: "P/B", thresholds: "<1: 5, <1.5: 4, <2.5: 3, <4: 2", max: 5 },
    ],
  },
  {
    name: "Cash Generation",
    points: 25,
    metrics: [
      { metric: "FCF Yield", thresholds: ">10%: 10, >7%: 8, >5%: 6, >3%: 4", max: 10 },
      { metric: "FCF Margin", thresholds: ">20%: 8, >12%: 6, >6%: 4, >0%: 2", max: 8 },
      { metric: "FCF/Debt", thresholds: ">0.5: 7, >0.25: 5, >0.15: 3, >0: 1", max: 7 },
    ],
  },
  {
    name: "Quality & Durability",
    points: 30,
    metrics: [
      { metric: "ROIC*", thresholds: "Regional: US >15%, JP >8%, EM Asia >10%", max: 12 },
      {
        metric: "Interest Coverage",
        thresholds: ">10x: 6, >6x: 5, >4x: 3, >2x: 1",
        max: 6,
      },
      {
        metric: "Debt/Equity",
        thresholds: "<30%: 6, <60%: 5, <100%: 3, <150%: 1",
        max: 6,
      },
      { metric: "ROE", thresholds: ">18%: 6, >12%: 5, >8%: 4, >5%: 2", max: 6 },
    ],
  },
  {
    name: "Dividend",
    points: 10,
    metrics: [
      {
        metric: "Dividend Yield",
        thresholds: ">4%: 5, >2.5%: 4, >1.5%: 3, >0.5%: 2",
        max: 5,
      },
      { metric: "Payout Ratio", thresholds: "20-50%: 5, 50-70%: 4, 0-20%: 3", max: 5 },
    ],
  },
];

const GROWTH_SECTIONS: Section[] = [
  {
    name: "Revenue Growth",
    points: 40,
    metrics: [
      {
        metric: "3Y CAGR",
        thresholds: ">60%: 15, >40%: 12, >25%: 8, >15%: 5, >0%: 2",
        max: 15,
      },
      {
        metric: "YoY Growth",
        thresholds: ">80%: 15, >50%: 12, >30%: 8, >15%: 5, >0%: 2",
        max: 15,
      },
      {
        metric: "QoQ Growth",
        thresholds: ">20%: 10, >10%: 7, >5%: 4, >0%: 2",
        max: 10,
      },
    ],
  },
  {
    name: "Growth Durability",
    points: 20,
    metrics: [
      {
        metric: "Acceleration",
        thresholds: ">10pp: 10, >5pp: 7, stable (±2pp): 4, decel: 1",
        max: 10,
      },
      {
        metric: "Consistency",
        thresholds: "4/4 Q positive: 10, 3/4: 7, 2/4: 4",
        max: 10,
      },
    ],
  },
  {
    name: "Scalability",
    points: 25,
    metrics: [
      {
        metric: "Gross Margin",
        thresholds: ">70%: 12, >60%: 10, >50%: 7, >40%: 4, >30%: 2",
        max: 12,
      },
      {
        metric: "GM Trend",
        thresholds: "Improving >3pp: 5, >1pp: 3, stable: 2",
        max: 5,
      },
      {
        metric: "Rule of 40*",
        thresholds: "Tech only: ≥40: 8, ≥30: 5, else: based on op margin",
        max: 8,
      },
    ],
  },
  {
    name: "Momentum",
    points: 5,
    metrics: [
      { metric: "3M Return", thresholds: ">15%: 5, >8%: 4, >0%: 2, <-20%: 1", max: 5 },
    ],
  },
  {
    name: "TAM Proxy",
    points: 10,
    metrics: [
      {
        metric: "P/S-to-Growth Ratio",
        thresholds: "<0.1: 6, <0.2: 5, <0.3: 4, <0.5: 2",
        max: 6,
      },
      {
        metric: "Market Cap Sweet Spot",
        thresholds: "$500M-$5B: 4, $5B-$20B: 3, $100M-$500M: 2, $20B-$100B: 1",
        max: 4,
      },
    ],
  },
];

const TIER_INFO = [
  {
    score: "≥80",
    tier: "🟢 HIGH CONVICTION",
    desc: "Strong across multiple factors",
  },
  {
    score: "65-79",
    tier: "🔵 WATCHLIST",
    desc: "Good score, worth researching",
  },
  {
    score: "50-64",
    tier: "🟡 SPECULATIVE",
    desc: "Mixed signals, higher risk",
  },
  { score: "<50", tier: "🔴 AVOID", desc: "Poor multi-factor profile" },
];

function MetricTable({ sections }: { sections: Section[] }) {
  return (
    <div className="space-y-4">
      {sections.map((section) => (
        <div key={section.name} className="overflow-hidden">
          <div className="flex items-center justify-between bg-gray-50 px-3 py-2 rounded-t-lg border border-gray-200 border-b-0">
            <span className="font-medium text-gray-900 text-sm">
              {section.name}
            </span>
            <span className="text-xs font-semibold text-gray-600 bg-gray-200 px-2 py-0.5 rounded">
              {section.points} pts
            </span>
          </div>
          <div className="border border-gray-200 rounded-b-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50/50">
                  <th className="text-left px-3 py-1.5 text-xs font-medium text-gray-500">
                    Metric
                  </th>
                  <th className="text-left px-3 py-1.5 text-xs font-medium text-gray-500">
                    Thresholds
                  </th>
                  <th className="text-right px-3 py-1.5 text-xs font-medium text-gray-500 w-16">
                    Max
                  </th>
                </tr>
              </thead>
              <tbody>
                {section.metrics.map((row, idx) => (
                  <tr
                    key={row.metric}
                    className={idx % 2 === 0 ? "bg-white" : "bg-gray-50/30"}
                  >
                    <td className="px-3 py-1.5 text-gray-800 font-medium">
                      {row.metric}
                    </td>
                    <td className="px-3 py-1.5 text-gray-600 text-xs">
                      {row.thresholds}
                    </td>
                    <td className="px-3 py-1.5 text-right text-gray-700 font-semibold">
                      {row.max}
                    </td>
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
        Factor-based scoring using academically validated metrics — 100 points
        total. Size factor removed (dead factor post-2000).
      </p>
      <MetricTable sections={QUANT_SECTIONS} />
      <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
        <p className="text-xs font-semibold text-blue-800 mb-1">
          Key Factor Changes
        </p>
        <ul className="text-xs text-blue-700 space-y-0.5">
          <li>• <strong>Size removed:</strong> No longer predictive post-2000</li>
          <li>• <strong>Earnings Quality added:</strong> OCF vs FCF check</li>
          <li>• <strong>Low Volatility:</strong> Beta &lt;1 rewarded</li>
        </ul>
      </div>
    </div>
  );
}

function ValueTab() {
  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600 italic">
        Buffett/Klarman style: margin of safety, cash generation, durability —
        100 points total
      </p>
      <MetricTable sections={VALUE_SECTIONS} />
      <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg">
        <p className="text-xs font-semibold text-green-800 mb-1">
          ROIC Regional Thresholds
        </p>
        <ul className="text-xs text-green-700 space-y-0.5">
          <li>🇺🇸 <strong>US:</strong> &gt;15% for max points</li>
          <li>🇯🇵 <strong>Japan:</strong> &gt;8% for max points (lower capital returns)</li>
          <li>🇭🇰🇨🇳🇸🇬 <strong>EM Asia (HK, CN, SGX):</strong> &gt;10% for max points</li>
        </ul>
      </div>
      <div className="mt-2 p-3 bg-gray-50 border border-gray-200 rounded-lg">
        <p className="text-xs font-semibold text-gray-700 mb-1">
          No Value Trap Penalties
        </p>
        <p className="text-xs text-gray-600">
          Value trap indicators are shown but don&apos;t reduce scores — they can kill
          contrarian plays. Use them as context, not disqualifiers.
        </p>
      </div>
    </div>
  );
}

function GrowthTab() {
  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600 italic">
        Hypergrowth-friendly: revenue velocity, scalability, unit economics —
        100 points total
      </p>
      <MetricTable sections={GROWTH_SECTIONS} />
      <div className="mt-4 p-3 bg-purple-50 border border-purple-200 rounded-lg">
        <p className="text-xs font-semibold text-purple-800 mb-1">
          Methodology Notes
        </p>
        <ul className="text-xs text-purple-700 space-y-0.5">
          <li>
            • <strong>3Y CAGR Cap:</strong> Max at &gt;60% (not 100% — too unrealistic)
          </li>
          <li>
            • <strong>Rule of 40:</strong> Only applies to Technology/Internet sectors
          </li>
          <li>
            • <strong>Momentum Reduced:</strong> Only 5 pts (from 15) — use 3M return as mean reversion signal
          </li>
          <li>
            • <strong>Non-tech sectors:</strong> Rule of 40 replaced with operating margin score
          </li>
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
        Stocks scoring high across all three modes are rare &quot;universal
        quality&quot; opportunities.
      </p>

      <div className="mt-4">
        <h4 className="font-semibold text-gray-900 mb-2 text-sm">
          Tier Classification
        </h4>
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50">
                <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">
                  Score
                </th>
                <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">
                  Tier
                </th>
                <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">
                  Interpretation
                </th>
              </tr>
            </thead>
            <tbody>
              {TIER_INFO.map((row, idx) => (
                <tr
                  key={row.tier}
                  className={idx % 2 === 0 ? "bg-white" : "bg-gray-50/50"}
                >
                  <td className="px-3 py-2 font-mono text-gray-800">
                    {row.score}
                  </td>
                  <td className="px-3 py-2 font-medium">{row.tier}</td>
                  <td className="px-3 py-2 text-gray-600 text-xs">
                    {row.desc}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-4 p-3 bg-gray-50 border border-gray-200 rounded-lg">
        <p className="text-xs font-semibold text-gray-700 mb-1">Data Sources</p>
        <p className="text-xs text-gray-600">
          All metrics from Yahoo Finance API: financialData,
          defaultKeyStatistics, earnings, price, summaryDetail
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
        className="inline-flex items-center gap-1.5 px-2 py-1.5 text-xs text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors border border-gray-300"
        title="Scoring Methodology"
      >
        <Info size={16} />
        <span className="hidden sm:inline">Methodology</span>
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Scoring Methodology"
        size="lg"
      >
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
