"use client";

import useSWR from "swr";
import { TrendingUp, TrendingDown, Minus, ChevronRight, Target, Activity, AlertTriangle } from "lucide-react";
import { Skeleton } from "@/components/Skeleton";
import type { ExpectedReturnsResponse, AssetValuation, TacticalSummary, SignalAlignment } from "@/lib/valuation/types";

const fetcher = (url: string) => fetch(url).then((r) => (r.ok ? r.json() : null));

const swrConfig = {
  refreshInterval: 60 * 60 * 1000, // 1 hour (matches cache)
  revalidateOnFocus: false,
  dedupingInterval: 60000,
};

function formatPercent(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(0)}%`;
}

function formatPrice(value: number, symbol: string): string {
  if (symbol === "TLT") {
    return `${value.toFixed(2)}%`;
  }
  if (symbol === "BTC") {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(value);
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function CompactReturnBar({ value }: { value: number }) {
  const minReturn = -2;
  const maxReturn = 15;
  const percentage = Math.max(0, Math.min(100, ((value - minReturn) / (maxReturn - minReturn)) * 100));

  let barColor = "bg-gray-300";
  if (value > 8) barColor = "bg-emerald-500";
  else if (value > 4) barColor = "bg-emerald-400";
  else if (value > 2) barColor = "bg-amber-400";
  else if (value > 0) barColor = "bg-amber-300";
  else barColor = "bg-red-400";

  return (
    <div className="flex items-center gap-1.5 flex-1 min-w-0">
      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full ${barColor} rounded-full transition-all`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      <span className="text-[10px] font-bold tabular-nums w-8 text-right text-gray-700">
        {formatPercent(value)}
      </span>
    </div>
  );
}

function ZoneBadge({ zone }: { zone: "cheap" | "fair" | "expensive" }) {
  const styles = {
    cheap: "bg-emerald-100 text-emerald-700",
    fair: "bg-gray-100 text-gray-500",
    expensive: "bg-red-100 text-red-700",
  };

  const labels = {
    cheap: "Cheap",
    fair: "Fair",
    expensive: "Rich",
  };

  return (
    <span className={`text-[9px] px-1 py-0.5 rounded ${styles[zone]}`}>
      {labels[zone]}
    </span>
  );
}

function BiasIcon({ bias }: { bias: "bullish" | "neutral" | "bearish" }) {
  const styles = {
    bullish: "text-emerald-500",
    neutral: "text-gray-400",
    bearish: "text-red-500",
  };

  const icons = {
    bullish: <TrendingUp className="w-2.5 h-2.5" />,
    neutral: <Minus className="w-2.5 h-2.5" />,
    bearish: <TrendingDown className="w-2.5 h-2.5" />,
  };

  return <span className={styles[bias]}>{icons[bias]}</span>;
}

// Compact asset row - ~45px height
function CompactAssetRow({ asset }: { asset: AssetValuation }) {
  const strategicBias =
    asset.valuation.zone === "cheap"
      ? "BUY"
      : asset.valuation.zone === "expensive"
      ? "AVOID"
      : "HOLD";

  const strategicStyle =
    strategicBias === "BUY"
      ? "text-emerald-600"
      : strategicBias === "AVOID"
      ? "text-red-600"
      : "text-gray-400";

  const tacticalLabel =
    asset.tactical.bias === "bullish"
      ? "↑"
      : asset.tactical.bias === "bearish"
      ? "↓"
      : "→";

  return (
    <div className="flex items-center gap-2 px-2.5 py-1.5">
      {/* Asset name + price */}
      <div className="w-[70px] shrink-0">
        <span className="text-[11px] font-semibold text-gray-900 block leading-tight">{asset.name}</span>
        <span className="text-[9px] text-gray-400 tabular-nums">
          {formatPrice(asset.price, asset.symbol)}
        </span>
      </div>

      {/* Return bar */}
      <CompactReturnBar value={asset.expectedReturn.tenYear} />

      {/* Zone badge */}
      <ZoneBadge zone={asset.valuation.zone} />

      {/* S/T indicators */}
      <div className="flex items-center gap-1 text-[9px] shrink-0 w-[52px]">
        <span className={`${strategicStyle} font-medium`}>S:{strategicBias}</span>
        <BiasIcon bias={asset.tactical.bias} />
      </div>
    </div>
  );
}

function RankingStrip({ ranking }: { ranking: string[] }) {
  return (
    <div className="flex items-center gap-1 px-2.5 py-1.5 bg-gray-50 border-t border-gray-100">
      <span className="text-[9px] text-gray-400">Rank:</span>
      {ranking.map((symbol, i) => (
        <span key={symbol} className="flex items-center">
          <span className="text-[9px] font-medium text-gray-600">{symbol}</span>
          {i < ranking.length - 1 && (
            <ChevronRight className="w-2.5 h-2.5 text-gray-300" />
          )}
        </span>
      ))}
    </div>
  );
}

function TacticalSummaryStrip({ summary }: { summary: TacticalSummary }) {
  const alignmentStyles: Record<SignalAlignment, string> = {
    "strong-buy": "bg-emerald-50 border-emerald-200 text-emerald-700",
    "buy": "bg-emerald-50/50 border-emerald-100 text-emerald-600",
    "mixed": "bg-amber-50 border-amber-200 text-amber-700",
    "sell": "bg-red-50/50 border-red-100 text-red-600",
    "strong-sell": "bg-red-50 border-red-200 text-red-700",
  };

  const alignmentIcons: Record<SignalAlignment, React.ReactNode> = {
    "strong-buy": <TrendingUp className="w-2.5 h-2.5" />,
    "buy": <TrendingUp className="w-2.5 h-2.5" />,
    "mixed": <Activity className="w-2.5 h-2.5" />,
    "sell": <TrendingDown className="w-2.5 h-2.5" />,
    "strong-sell": <TrendingDown className="w-2.5 h-2.5" />,
  };

  const alignmentLabels: Record<SignalAlignment, string> = {
    "strong-buy": "Strong Buy",
    "buy": "Buy Signal",
    "mixed": "Mixed",
    "sell": "Sell Signal",
    "strong-sell": "Strong Sell",
  };

  return (
    <div className={`px-2.5 py-1.5 border-t ${alignmentStyles[summary.alignment]}`}>
      <div className="flex items-center gap-1">
        {alignmentIcons[summary.alignment]}
        <span className="text-[9px] font-semibold">
          {alignmentLabels[summary.alignment]}
        </span>
        <span className="text-[9px] opacity-70 truncate">
          — {summary.message}
        </span>
      </div>
    </div>
  );
}

export function ExpectedReturnsCard() {
  const { data, isLoading } = useSWR<ExpectedReturnsResponse>(
    "/api/valuation/expected-returns",
    fetcher,
    swrConfig
  );

  return (
    <div>
      <h3 className="text-xs font-semibold text-gray-900 mb-1.5 flex items-center gap-1.5">
        <span className="flex items-center text-gray-400">
          <Target className="w-3.5 h-3.5" />
        </span>
        Expected Returns (10Y)
      </h3>

      <div className="card overflow-hidden !p-0 divide-y divide-gray-100">
        {isLoading ? (
          <div className="px-2.5 py-2 space-y-1.5">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : data?.assets && data.assets.length > 0 ? (
          <>
            {data.assets.map((asset) => (
              <CompactAssetRow key={asset.symbol} asset={asset} />
            ))}
            <RankingStrip ranking={data.relativeRanking} />
            {data.tacticalSummary && (
              <TacticalSummaryStrip summary={data.tacticalSummary} />
            )}
          </>
        ) : (
          <div className="px-2.5 py-3 text-xs text-gray-400 text-center">
            Unable to load valuation data
          </div>
        )}
      </div>
    </div>
  );
}
