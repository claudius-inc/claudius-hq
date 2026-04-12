"use client";

import { useState } from "react";
import useSWR from "swr";
import { ChevronRight } from "lucide-react";
import { Skeleton } from "@/components/Skeleton";
import { GoldDetail } from "./GoldDetail";
import { BtcDetail } from "./BtcDetail";
import { RefreshIndicator } from "@/components/ui/RefreshIndicator";
import type { ExpectedReturnsResponse } from "@/lib/valuation/types";

interface BtcSnapshot {
  livePrice: number;
  changePercent: number;
  distancePercent: number;
  wma200: number;
  mayerMultiple: number;
  sma200d: number;
}

interface GoldSnapshot {
  livePrice: number | null;
  change: number | null;
  changePercent: number | null;
  dxy: { price: number; changePercent: number } | null;
  realYields: { value: number } | null;
  gld: { price: number; changePercent: number } | null;
  analysis: { ath: number | null; athDate: string | null } | null;
}

interface SilverSnapshot {
  latest: {
    registeredMoz: number;
    eligibleMoz: number;
    totalMoz: number;
    activityDate: string;
  } | null;
  change30d: {
    registeredPercent: number;
  } | null;
  stressLevel: "low" | "moderate" | "high" | "critical";
}

interface SilverPriceSnapshot {
  price: number | null;
  changePercent: number | null;
  goldSilverRatio: number | null;
}

const fetcher = (url: string) => fetch(url).then((r) => (r.ok ? r.json() : null));

// SWR config: refresh every 60s, revalidate on focus, longer deduping
const swrConfig = {
  refreshInterval: 60000, // 60 seconds
  revalidateOnFocus: true,
  dedupingInterval: 30000, // 30 seconds - prevents rapid re-fetches
};

function formatUsd(n: number, decimals = 0) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(n);
}

function GoldSilverRatioZone({ ratio }: { ratio: number }) {
  if (ratio > 100) return <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700">Extreme</span>;
  if (ratio > 80) return <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700">Cheap</span>;
  if (ratio > 60) return <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600">Normal</span>;
  if (ratio > 45) return <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">Expensive</span>;
  return <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-700">Extreme</span>;
}

const AU_AG_RANGES = [
  { label: "Extreme", range: "> 100", min: 100, max: 999, meaning: "Silver historically very cheap vs gold — mean-reversion opportunity" },
  { label: "Cheap", range: "80 – 100", min: 80, max: 100, meaning: "Silver undervalued relative to gold — favors silver accumulation" },
  { label: "Normal", range: "60 – 80", min: 60, max: 80, meaning: "Historical equilibrium range" },
  { label: "Expensive", range: "45 – 60", min: 45, max: 60, meaning: "Silver elevated vs gold — ratio compression, often late-cycle" },
  { label: "Extreme", range: "< 45", min: 0, max: 45, meaning: "Silver mania / gold weakness — last seen in 2011" },
];

function ValuationZone({ zone }: { zone: "cheap" | "fair" | "expensive" }) {
  const styles = {
    cheap: "bg-emerald-100 text-emerald-700",
    fair: "bg-gray-100 text-gray-500",
    expensive: "bg-red-100 text-red-700",
  };
  const labels = { cheap: "Cheap", fair: "Fair", expensive: "Rich" };
  return <span className={`text-[9px] px-1 py-0.5 rounded ${styles[zone]}`}>{labels[zone]}</span>;
}

function TacticalBias({ bias }: { bias: "bullish" | "neutral" | "bearish" }) {
  const styles = {
    bullish: "bg-emerald-100 text-emerald-700",
    neutral: "bg-gray-100 text-gray-400",
    bearish: "bg-red-100 text-red-700",
  };
  const labels = { bullish: "Bull", neutral: "Neut", bearish: "Bear" };
  return <span className={`text-[9px] px-1 py-0.5 rounded ${styles[bias]}`}>{labels[bias]}</span>;
}

export function HardAssets({
  expectedReturns,
  initialBtc,
  initialGold,
  initialSilver,
  initialSilverPrice,
}: {
  expectedReturns?: ExpectedReturnsResponse | null;
  initialBtc?: BtcSnapshot | null;
  initialGold?: GoldSnapshot | null;
  initialSilver?: SilverSnapshot | null;
  initialSilverPrice?: SilverPriceSnapshot | null;
}) {
  const btcValuation = expectedReturns?.assets.find((a) => a.symbol === "BTC");
  const goldValuation = expectedReturns?.assets.find((a) => a.symbol === "GLD");
  const [btcOpen, setBtcOpen] = useState(false);
  const [goldOpen, setGoldOpen] = useState(false);
  const [silverExpanded, setSilverExpanded] = useState(false);

  const { data: btc, isLoading: loadingBtc, isValidating: validatingBtc } =
    useSWR<BtcSnapshot>("/api/btc", fetcher, { ...swrConfig, fallbackData: initialBtc ?? undefined });
  const { data: gold, isLoading: loadingGold, isValidating: validatingGold } =
    useSWR<GoldSnapshot>("/api/gold", fetcher, { ...swrConfig, fallbackData: initialGold ?? undefined });
  const { data: silver, isValidating: validatingSilver } =
    useSWR<SilverSnapshot>("/api/markets/silver", fetcher, { ...swrConfig, fallbackData: initialSilver ?? undefined });
  const { data: silverPrice, isLoading: loadingSilverPrice, isValidating: validatingSilverPrice } =
    useSWR<SilverPriceSnapshot>("/api/silver-price", fetcher, { ...swrConfig, fallbackData: initialSilverPrice ?? undefined });

  const refreshing =
    validatingBtc || validatingGold || validatingSilver || validatingSilverPrice;

  const goldPrice = gold?.livePrice;

  return (
    <div>
      <h3 className="text-xs font-semibold text-gray-900 mb-1.5 flex items-center gap-1.5">
        Commodities
        <RefreshIndicator active={refreshing} />
      </h3>

      <div className="card overflow-hidden !p-0 divide-y divide-gray-100">
        {/* BTC Row */}
        <button onClick={() => setBtcOpen(true)} className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 transition-colors group text-left">
          <ChevronRight className="w-3 h-3 text-gray-400 shrink-0" />
          <span className="text-xs font-semibold text-gray-900 flex-1 min-w-0 truncate">BTC</span>
          {loadingBtc ? (
            <>
              <Skeleton className="h-2.5 w-12 shrink-0" />
              <Skeleton className="h-3 w-16 shrink-0" />
              <Skeleton className="h-2.5 w-10 shrink-0" />
              <Skeleton className="h-3 w-10 rounded shrink-0" />
            </>
          ) : btc ? (
            <>
              <span className="text-[10px] text-gray-400 shrink-0">
                Mayer <span className={`font-medium ${btc.mayerMultiple < 0.8 ? "text-emerald-600" : btc.mayerMultiple > 2.4 ? "text-red-600" : "text-gray-600"}`}>{btc.mayerMultiple.toFixed(2)}</span>
              </span>
              <span className="text-xs font-bold tabular-nums text-gray-900 shrink-0">{formatUsd(btc.livePrice)}</span>
              <span className={`text-[10px] tabular-nums shrink-0 ${btc.changePercent >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                {btc.changePercent >= 0 ? "+" : ""}{btc.changePercent.toFixed(2)}%
              </span>
              {btcValuation && btcValuation.tactical.bias !== "neutral" && <TacticalBias bias={btcValuation.tactical.bias} />}
            </>
          ) : (
            <span className="text-xs text-gray-400">&mdash;</span>
          )}
        </button>

        {/* Gold Row */}
        <button onClick={() => setGoldOpen(true)} className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 transition-colors group text-left">
          <ChevronRight className="w-3 h-3 text-gray-400 shrink-0" />
          <span className="text-xs font-semibold text-gray-900 flex-1 min-w-0 truncate">Gold</span>
          {loadingGold ? (
            <>
              <Skeleton className="h-2.5 w-14 shrink-0" />
              <Skeleton className="h-3 w-16 shrink-0" />
              <Skeleton className="h-2.5 w-10 shrink-0" />
              <Skeleton className="h-3 w-10 rounded shrink-0" />
            </>
          ) : goldPrice ? (
            <>
              {goldValuation && (
                <span className="text-[10px] text-gray-400 shrink-0">
                  M2/Au <span className={`font-medium ${goldValuation.valuation.zone === "cheap" ? "text-emerald-600" : goldValuation.valuation.zone === "expensive" ? "text-red-600" : "text-gray-600"}`}>{goldValuation.valuation.value.toFixed(1)}</span>
                </span>
              )}
              <span className="text-xs font-bold tabular-nums text-gray-900 shrink-0">{formatUsd(goldPrice)}</span>
              {gold?.changePercent != null && (
                <span className={`text-[10px] tabular-nums shrink-0 ${gold.changePercent >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                  {gold.changePercent >= 0 ? "+" : ""}{gold.changePercent.toFixed(2)}%
                </span>
              )}
              {goldValuation && <ValuationZone zone={goldValuation.valuation.zone} />}
              {goldValuation && goldValuation.tactical.bias !== "neutral" && <TacticalBias bias={goldValuation.tactical.bias} />}
            </>
          ) : (
            <span className="text-xs text-gray-400">&mdash;</span>
          )}
        </button>

        {/* Silver Row */}
        <div>
          <button
            onClick={() => setSilverExpanded(!silverExpanded)}
            className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-gray-50 transition-colors"
          >
            <ChevronRight className={`w-3 h-3 text-gray-400 transition-transform shrink-0 ${silverExpanded ? "rotate-90" : ""}`} />
            <span className="text-xs font-semibold text-gray-900 flex-1 min-w-0 truncate">Silver</span>
            {loadingSilverPrice ? (
              <>
                <Skeleton className="h-2.5 w-14 shrink-0" />
                <Skeleton className="h-3 w-14 shrink-0" />
                <Skeleton className="h-2.5 w-10 shrink-0" />
                <Skeleton className="h-3 w-10 rounded shrink-0" />
              </>
            ) : silverPrice?.price ? (
              <>
                {silverPrice.goldSilverRatio && (
                  <span className="text-[10px] text-gray-400 shrink-0">
                    Au/Ag <span className={`font-medium ${silverPrice.goldSilverRatio > 80 ? "text-emerald-600" : silverPrice.goldSilverRatio < 45 ? "text-red-600" : "text-gray-600"}`}>{silverPrice.goldSilverRatio.toFixed(1)}</span>
                  </span>
                )}
                <span className="text-xs font-bold tabular-nums text-gray-900 shrink-0">{formatUsd(silverPrice.price, 2)}</span>
                {silverPrice.changePercent != null && (
                  <span className={`text-[10px] tabular-nums shrink-0 ${silverPrice.changePercent >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                    {silverPrice.changePercent >= 0 ? "+" : ""}{silverPrice.changePercent.toFixed(2)}%
                  </span>
                )}
                {silverPrice.goldSilverRatio && <GoldSilverRatioZone ratio={silverPrice.goldSilverRatio} />}
              </>
            ) : (
              <span className="text-xs text-gray-400">&mdash;</span>
            )}
          </button>
          {silverExpanded && silverPrice?.goldSilverRatio && (
            <div className="px-3 pb-3 pt-2 bg-gray-50/50 border-t border-gray-100">
              <div className="flex items-center gap-2 text-[10px] mb-2">
                <span className="text-gray-500">Gold/Silver Ratio:</span>
                <span className="font-bold text-gray-700 font-mono">{silverPrice.goldSilverRatio.toFixed(1)}</span>
                <span className="text-gray-400">(oz of gold / oz of silver)</span>
              </div>
              {silver?.latest && (
                <div className="flex items-center gap-3 text-[10px] mb-2">
                  <span className="text-gray-500">COMEX Registered:</span>
                  <span className="font-bold text-gray-700 font-mono">{silver.latest.registeredMoz}M oz</span>
                  {silver.change30d && (
                    <span className={`tabular-nums ${silver.change30d.registeredPercent < 0 ? "text-red-600" : "text-emerald-600"}`}>
                      {silver.change30d.registeredPercent >= 0 ? "+" : ""}{silver.change30d.registeredPercent.toFixed(1)}% 30d
                    </span>
                  )}
                </div>
              )}
              <div className="mb-2.5">
                <h4 className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Interpretation Guide</h4>
                <div className="space-y-1">
                  {AU_AG_RANGES.map((range, idx) => {
                    const isActive = silverPrice.goldSilverRatio! >= range.min && silverPrice.goldSilverRatio! < range.max;
                    return (
                      <div
                        key={idx}
                        className={`flex flex-wrap items-start gap-1 text-[10px] p-1 rounded ${
                          isActive
                            ? "bg-blue-50 text-blue-700 ring-1 ring-offset-1 ring-gray-300"
                            : "bg-gray-50"
                        }`}
                      >
                        <span className="font-medium w-20 shrink-0">{range.label}</span>
                        <span className="text-gray-500 w-20 shrink-0 font-mono">{range.range}</span>
                        <span className="text-gray-600 flex-1">{range.meaning}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
              <p className="text-[9px] text-gray-400">Historical mean ~65. Ratio spikes in recessions (silver sells off harder) and compresses in precious metals bull markets.</p>
            </div>
          )}
        </div>

      </div>

      {/* Detail Modals */}
      <BtcDetail open={btcOpen} onClose={() => setBtcOpen(false)} />
      <GoldDetail open={goldOpen} onClose={() => setGoldOpen(false)} />
    </div>
  );
}
