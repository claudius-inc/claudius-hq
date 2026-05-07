"use client";

import { TrendingUp, AlertTriangle } from "lucide-react";

import type { MarketSignals } from "@/lib/scanner/signals/types";

interface MarketSignalsCardProps {
  market: string; // "US" | "SGX" | "HK" | "JP" | "CN" | "KS" | "LSE"
  signals: MarketSignals | null | undefined;
}

function formatThousands(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "-";
  return Math.round(n).toLocaleString("en-US");
}

function formatUSD(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "-";
  if (Math.abs(n) >= 1_000_000_000)
    return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

function shortRatioColor(ratio: number): string {
  // ratio is a fraction (0-1) per HKShortSellingSignals.shortTurnoverRatio docs
  const pct = ratio * 100;
  if (pct < 10) return "text-emerald-600";
  if (pct < 20) return "text-amber-600";
  return "text-red-600";
}

function jpScoreColor(score: number): {
  text: string;
  bg: string;
  border: string;
} {
  if (score >= 7)
    return {
      text: "text-emerald-700",
      bg: "bg-emerald-50",
      border: "border-emerald-200",
    };
  if (score >= 4)
    return {
      text: "text-amber-700",
      bg: "bg-amber-50",
      border: "border-amber-200",
    };
  return {
    text: "text-gray-600",
    bg: "bg-gray-50",
    border: "border-gray-200",
  };
}

function USCard({ us }: { us: NonNullable<MarketSignals["us"]> }) {
  return (
    <div className="space-y-1.5">
      {us.isClusterBuy && (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold rounded bg-emerald-100 text-emerald-800 border border-emerald-200">
          <TrendingUp size={12} />
          Cluster Buy
        </span>
      )}
      <div className="flex items-baseline gap-3 text-xs">
        <span className="text-gray-700">
          <span className="font-semibold text-emerald-700">
            {us.insiderBuyCount}
          </span>{" "}
          buys ·{" "}
          <span className="font-semibold text-red-700">
            {us.insiderSellCount}
          </span>{" "}
          sells
        </span>
        <span className="text-gray-500">(last 30d)</span>
      </div>
      <div className="flex items-baseline gap-3 text-xs text-gray-600">
        <span>Buy {formatUSD(us.totalBuyValue)}</span>
        <span>Sell {formatUSD(us.totalSellValue)}</span>
      </div>
      {us.lastTransactionDate && (
        <p className="text-[10px] text-gray-500">
          Last: {us.lastTransactionDate}
        </p>
      )}
    </div>
  );
}

function HKCard({ hk }: { hk: NonNullable<MarketSignals["hk"]> }) {
  const pct = (hk.shortTurnoverRatio * 100).toFixed(1);
  return (
    <div className="space-y-1">
      <div className="flex items-baseline gap-2">
        <span
          className={`text-lg font-bold ${shortRatioColor(hk.shortTurnoverRatio)}`}
        >
          {pct}%
        </span>
        <span className="text-xs text-gray-600">short turnover</span>
      </div>
      <div className="text-xs text-gray-600">
        Short volume:{" "}
        <span className="font-medium text-gray-800">
          {formatThousands(hk.shortVolume)}
        </span>
      </div>
      {hk.dataDate && (
        <p className="text-[10px] text-gray-500">As of: {hk.dataDate}</p>
      )}
    </div>
  );
}

function JPCard({ jp }: { jp: NonNullable<MarketSignals["jp"]> }) {
  const colors = jpScoreColor(jp.governanceCatalystScore);
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <span
          className={`inline-flex items-center justify-center w-9 h-9 rounded border text-base font-bold ${colors.bg} ${colors.text} ${colors.border}`}
        >
          {jp.governanceCatalystScore}
        </span>
        <span className="text-xs text-gray-600">Governance catalyst (/10)</span>
      </div>
      <div className="flex flex-wrap gap-1">
        {jp.hasPBRBelowOne && (
          <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-blue-50 text-blue-700 border border-blue-200">
            PBR&lt;1
          </span>
        )}
        {jp.hasCapitalEfficiencyPlan && (
          <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-violet-50 text-violet-700 border border-violet-200">
            Capital Plan
          </span>
        )}
      </div>
    </div>
  );
}

function SGCard({ sg }: { sg: NonNullable<MarketSignals["sg"]> }) {
  if (!sg.isGLC && !sg.isSChip) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {sg.isGLC && (
        <span className="px-2 py-0.5 text-[11px] font-medium rounded bg-blue-50 text-blue-700 border border-blue-200">
          GLC{sg.glcParent ? ` · ${sg.glcParent}` : ""}
        </span>
      )}
      {sg.isSChip && (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded bg-amber-50 text-amber-800 border border-amber-200">
          <AlertTriangle size={11} />
          S-Chip
        </span>
      )}
    </div>
  );
}

function CNCard({ cn }: { cn: NonNullable<MarketSignals["cn"]> }) {
  const deltaColor =
    cn.dailyChange > 0
      ? "text-emerald-600"
      : cn.dailyChange < 0
        ? "text-red-600"
        : "text-gray-600";
  const deltaSign = cn.dailyChange > 0 ? "+" : "";
  return (
    <div className="space-y-1">
      <div className="text-xs text-gray-700">
        Stock Connect:{" "}
        <span className="font-semibold text-gray-900">
          {cn.percentOfFloat.toFixed(2)}%
        </span>{" "}
        of float
      </div>
      <div className="text-xs">
        <span className="text-gray-600">Daily change: </span>
        <span className={`font-medium ${deltaColor}`}>
          {deltaSign}
          {formatThousands(cn.dailyChange)}
        </span>
      </div>
      <div className="text-xs text-gray-600">
        Northbound holding:{" "}
        <span className="font-medium text-gray-800">
          {formatThousands(cn.northboundHolding)}
        </span>
      </div>
    </div>
  );
}

export function MarketSignalsCard({ market, signals }: MarketSignalsCardProps) {
  if (!signals) return null;

  let body: React.ReactNode = null;
  let label: string = market;

  if (market === "US" && signals.us) {
    body = <USCard us={signals.us} />;
    label = "US Insider Activity";
  } else if (market === "HK" && signals.hk) {
    body = <HKCard hk={signals.hk} />;
    label = "HK Short Selling";
  } else if (market === "JP" && signals.jp) {
    body = <JPCard jp={signals.jp} />;
    label = "JP Governance";
  } else if (market === "SGX" && signals.sg) {
    // SGX renders nothing when neither flag is true.
    if (signals.sg.isGLC || signals.sg.isSChip) {
      body = <SGCard sg={signals.sg} />;
      label = "SGX Flags";
    }
  } else if (market === "CN" && signals.cn) {
    body = <CNCard cn={signals.cn} />;
    label = "CN Stock Connect";
  }

  if (!body) return null;

  return (
    <div className="space-y-2 border-t border-gray-200 pt-3">
      <h4 className="text-xs font-medium text-gray-700">{label}</h4>
      {body}
    </div>
  );
}
