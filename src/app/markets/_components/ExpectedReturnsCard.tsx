"use client";

import useSWR from "swr";
import { TrendingUp, TrendingDown, Minus, ChevronRight, Target } from "lucide-react";
import { Skeleton } from "@/components/Skeleton";
import type { ExpectedReturnsResponse, AssetValuation } from "@/lib/valuation/types";

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
    // TLT shows yield
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
  // Scale: -2% to +15% mapped to 0-100% width
  const minReturn = -2;
  const maxReturn = 15;
  const percentage = Math.max(0, Math.min(100, ((value - minReturn) / (maxReturn - minReturn)) * 100));

  // Color based on expected return
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

function TacticalBadge({ vs200dma, momentum }: { vs200dma: string; momentum: string }) {
  if (vs200dma === "below") {
    return (
      <span className="flex items-center gap-0.5 text-[10px] text-red-600">
        <TrendingDown className="w-3 h-3" />
        &lt;200d
      </span>
    );
  }
  if (vs200dma === "above" && momentum === "bullish") {
    return (
      <span className="flex items-center gap-0.5 text-[10px] text-emerald-600">
        <TrendingUp className="w-3 h-3" />
        &gt;200d
      </span>
    );
  }
  return (
    <span className="flex items-center gap-0.5 text-[10px] text-gray-500">
      <Minus className="w-3 h-3" />
      ~200d
    </span>
  );
}

function AssetRow({ asset }: { asset: AssetValuation }) {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-semibold text-gray-900">{asset.name}</span>
          <span className="text-[10px] text-gray-400 tabular-nums">
            {formatPrice(asset.price, asset.symbol)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <ReturnBar value={asset.expectedReturn.tenYear} />
        </div>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-[10px] text-gray-400">
            {asset.valuation.metric}{" "}
            <span className="font-medium text-gray-600">
              {asset.valuation.value}
            </span>
          </span>
          <ZoneBadge zone={asset.valuation.zone} />
          <TacticalBadge
            vs200dma={asset.tactical.vs200dma}
            momentum={asset.tactical.momentum}
          />
        </div>
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
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : data?.assets && data.assets.length > 0 ? (
          <>
            {data.assets.map((asset) => (
              <AssetRow key={asset.symbol} asset={asset} />
            ))}
            <RankingStrip ranking={data.relativeRanking} />
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
