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
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
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

function ReturnBar({ value }: { value: number }) {
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
    <div className="flex items-center gap-2 flex-1">
      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full ${barColor} rounded-full transition-all`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      <span className="text-xs font-semibold tabular-nums w-12 text-right">
        {formatPercent(value)}
      </span>
    </div>
  );
}

function ZoneBadge({ zone }: { zone: "cheap" | "fair" | "expensive" }) {
  const styles = {
    cheap: "bg-emerald-100 text-emerald-700",
    fair: "bg-gray-100 text-gray-600",
    expensive: "bg-red-100 text-red-700",
  };

  const labels = {
    cheap: "Cheap",
    fair: "Fair",
    expensive: "Rich",
  };

  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${styles[zone]}`}>
      {labels[zone]}
    </span>
  );
}

function BiasIndicator({ bias, note }: { bias: "bullish" | "neutral" | "bearish"; note?: string }) {
  const styles = {
    bullish: "text-emerald-600",
    neutral: "text-gray-500",
    bearish: "text-red-600",
  };

  const icons = {
    bullish: <TrendingUp className="w-3 h-3" />,
    neutral: <Minus className="w-3 h-3" />,
    bearish: <TrendingDown className="w-3 h-3" />,
  };

  return (
    <span className={`flex items-center gap-0.5 text-[10px] ${styles[bias]}`}>
      {icons[bias]}
      <span className="capitalize">{bias}</span>
      {note && <span className="text-gray-400 ml-0.5">({note})</span>}
    </span>
  );
}

function TacticalDetails({ asset }: { asset: AssetValuation }) {
  const details: string[] = [];
  const { tactical } = asset;

  // DMA status
  if (tactical.vs200dma !== "at") {
    details.push(tactical.vs200dma === "above" ? ">200d" : "<200d");
  }
  if (tactical.vs50dma && tactical.vs50dma !== "at") {
    details.push(tactical.vs50dma === "above" ? ">50d" : "<50d");
  }

  // RSI
  if (tactical.rsi !== undefined) {
    if (tactical.rsi > 70) details.push(`RSI ${tactical.rsi}`);
    else if (tactical.rsi < 30) details.push(`RSI ${tactical.rsi}`);
  }

  // VIX (for SPY)
  if (tactical.vix !== undefined) {
    if (tactical.vix > 25) details.push(`VIX ${tactical.vix.toFixed(0)}`);
    else if (tactical.vix < 15) details.push(`VIX ${tactical.vix.toFixed(0)}`);
  }

  // Yield curve (for bonds)
  if (tactical.yieldCurveSlope !== undefined) {
    const slope = tactical.yieldCurveSlope;
    if (slope < 0) details.push(`10-2: ${slope.toFixed(2)}%`);
  }

  // Sentiment (for BTC)
  if (tactical.sentiment && tactical.sentiment !== "neutral") {
    const sentimentLabels = {
      "extreme-fear": "Fear",
      "fear": "Fear",
      "greed": "Greed",
      "extreme-greed": "Euphoria",
    };
    details.push(sentimentLabels[tactical.sentiment as keyof typeof sentimentLabels] || tactical.sentiment);
  }

  if (details.length === 0) return null;

  return (
    <span className="text-[9px] text-gray-400 ml-1">
      {details.slice(0, 3).join(" | ")}
    </span>
  );
}

function StrategicVsTactical({ asset }: { asset: AssetValuation }) {
  const strategicBias =
    asset.valuation.zone === "cheap"
      ? "BUY"
      : asset.valuation.zone === "expensive"
      ? "AVOID"
      : "HOLD";

  const tacticalBias =
    asset.tactical.bias === "bullish"
      ? "BULLISH"
      : asset.tactical.bias === "bearish"
      ? "BEARISH"
      : "NEUTRAL";

  const strategicStyle =
    strategicBias === "BUY"
      ? "text-emerald-600"
      : strategicBias === "AVOID"
      ? "text-red-600"
      : "text-gray-500";

  const tacticalStyle =
    tacticalBias === "BULLISH"
      ? "text-emerald-600"
      : tacticalBias === "BEARISH"
      ? "text-red-600"
      : "text-gray-500";

  // Check if aligned or divergent
  const isAligned =
    (strategicBias === "BUY" && tacticalBias === "BULLISH") ||
    (strategicBias === "AVOID" && tacticalBias === "BEARISH") ||
    strategicBias === "HOLD" ||
    tacticalBias === "NEUTRAL";

  return (
    <div className="flex items-center gap-2 text-[10px]">
      <span className={strategicStyle}>S: {strategicBias}</span>
      <span className="text-gray-300">|</span>
      <span className={tacticalStyle}>T: {tacticalBias}</span>
      {!isAligned && (
        <AlertTriangle className="w-3 h-3 text-amber-500" />
      )}
    </div>
  );
}

function AssetRow({ asset }: { asset: AssetValuation }) {
  return (
    <div className="flex flex-col gap-1 px-3 py-2.5">
      {/* Top row: Name, price, strategic badge */}
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold text-gray-900">{asset.name}</span>
        <span className="text-[10px] text-gray-400 tabular-nums">
          {formatPrice(asset.price, asset.symbol)}
        </span>
        <div className="flex-1" />
        <ZoneBadge zone={asset.valuation.zone} />
      </div>

      {/* Return bar */}
      <ReturnBar value={asset.expectedReturn.tenYear} />

      {/* Valuation metric and Strategic vs Tactical */}
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-gray-400">
          {asset.valuation.metric}{" "}
          <span className="font-medium text-gray-600">
            {asset.valuation.value}
          </span>
        </span>
        <StrategicVsTactical asset={asset} />
      </div>

      {/* Tactical details row */}
      <div className="flex items-center">
        <BiasIndicator bias={asset.tactical.bias} note={asset.tactical.note} />
        <TacticalDetails asset={asset} />
      </div>
    </div>
  );
}

function RankingStrip({ ranking }: { ranking: string[] }) {
  return (
    <div className="flex items-center gap-1 px-3 py-2 bg-gray-50 border-t border-gray-100">
      <span className="text-[10px] text-gray-400">Ranking:</span>
      {ranking.map((symbol, i) => (
        <span key={symbol} className="flex items-center">
          <span className="text-[10px] font-medium text-gray-700">{symbol}</span>
          {i < ranking.length - 1 && (
            <ChevronRight className="w-3 h-3 text-gray-300 mx-0.5" />
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
    "strong-buy": <TrendingUp className="w-3 h-3" />,
    "buy": <TrendingUp className="w-3 h-3" />,
    "mixed": <Activity className="w-3 h-3" />,
    "sell": <TrendingDown className="w-3 h-3" />,
    "strong-sell": <TrendingDown className="w-3 h-3" />,
  };

  const alignmentLabels: Record<SignalAlignment, string> = {
    "strong-buy": "Strong Buy Signal",
    "buy": "Buy Signal",
    "mixed": "Mixed Signals",
    "sell": "Sell Signal",
    "strong-sell": "Strong Sell Signal",
  };

  return (
    <div className={`px-3 py-2 border-t ${alignmentStyles[summary.alignment]}`}>
      <div className="flex items-center gap-1.5 mb-0.5">
        {alignmentIcons[summary.alignment]}
        <span className="text-[10px] font-semibold">
          {alignmentLabels[summary.alignment]}
        </span>
      </div>
      <p className="text-[10px] leading-tight opacity-80">
        {summary.message}
      </p>
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
          <div className="px-3 py-4 space-y-3">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        ) : data?.assets && data.assets.length > 0 ? (
          <>
            {data.assets.map((asset) => (
              <AssetRow key={asset.symbol} asset={asset} />
            ))}
            <RankingStrip ranking={data.relativeRanking} />
            {data.tacticalSummary && (
              <TacticalSummaryStrip summary={data.tacticalSummary} />
            )}
          </>
        ) : (
          <div className="px-3 py-4 text-xs text-gray-400 text-center">
            Unable to load valuation data
          </div>
        )}
      </div>
    </div>
  );
}
