"use client";

import { useState } from "react";
import useSWR from "swr";
import { Gem, ChevronRight } from "lucide-react";
import { Skeleton } from "@/components/Skeleton";
import { GoldDetail } from "./GoldDetail";
import { BtcDetail } from "./BtcDetail";
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
  dxy: { price: number; changePercent: number } | null;
  realYields: { value: number } | null;
  gld: { price: number; changePercent: number } | null;
  analysis: { ath: number | null; athDate: string | null } | null;
}

interface OilSnapshot {
  wti: {
    price: number | null;
    changePercent: number | null;
    fiftyTwoWeekHigh: number | null;
    fiftyTwoWeekLow: number | null;
  } | null;
  brent: {
    price: number | null;
    changePercent: number | null;
  } | null;
  spread: number | null;
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

// SWR config: refresh every 60s, revalidate on focus
const swrConfig = {
  refreshInterval: 60000, // 60 seconds
  revalidateOnFocus: true,
  dedupingInterval: 10000, // 10 seconds
};

function formatUsd(n: number, decimals = 0) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(n);
}

function OilGoldZone({ ratio }: { ratio: number }) {
  if (ratio < 0.02) return <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700">Very Cheap</span>;
  if (ratio < 0.035) return <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700">Cheap</span>;
  if (ratio < 0.055) return <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600">Normal</span>;
  if (ratio < 0.08) return <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">Expensive</span>;
  return <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-700">Crisis</span>;
}

const OIL_GOLD_RANGES = [
  { label: "Very Cheap", range: "< 0.020", min: 0, max: 0.02, meaning: "Oil deeply undervalued vs gold — energy sector distress or gold mania" },
  { label: "Cheap", range: "0.020 – 0.035", min: 0.02, max: 0.035, meaning: "Oil cheap relative to gold — energy underweight opportunity" },
  { label: "Normal", range: "0.035 – 0.055", min: 0.035, max: 0.055, meaning: "Fair value — historical equilibrium between energy and hard assets" },
  { label: "Expensive", range: "0.055 – 0.080", min: 0.055, max: 0.08, meaning: "Oil elevated vs gold — supply shock or geopolitical premium" },
  { label: "Crisis", range: "> 0.080", min: 0.08, max: 999, meaning: "Oil spike territory — demand destruction likely incoming" },
];

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

export function HardAssets({ expectedReturns }: { expectedReturns?: ExpectedReturnsResponse | null }) {
  const btcValuation = expectedReturns?.assets.find((a) => a.symbol === "BTC");
  const goldValuation = expectedReturns?.assets.find((a) => a.symbol === "GLD");
  const [btcOpen, setBtcOpen] = useState(false);
  const [goldOpen, setGoldOpen] = useState(false);
  const [oilExpanded, setOilExpanded] = useState(false);
  const [silverExpanded, setSilverExpanded] = useState(false);

  const { data: btc, isLoading: loadingBtc } = useSWR<BtcSnapshot>("/api/btc", fetcher, swrConfig);
  const { data: gold, isLoading: loadingGold } = useSWR<GoldSnapshot>("/api/gold", fetcher, swrConfig);
  const { data: oil, isLoading: loadingOil } = useSWR<OilSnapshot>("/api/oil", fetcher, swrConfig);
  const { data: silver } = useSWR<SilverSnapshot>("/api/markets/silver", fetcher, swrConfig);
  const { data: silverPrice, isLoading: loadingSilverPrice } = useSWR<SilverPriceSnapshot>("/api/silver-price", fetcher, swrConfig);

  const goldPrice = gold?.livePrice;
  const oilGoldRatio = oil?.wti?.price && goldPrice ? oil.wti.price / goldPrice : null;

  return (
    <div>
      <h3 className="text-xs font-semibold text-gray-900 mb-1.5 flex items-center gap-1.5">
        <span className="flex items-center text-gray-400"><Gem className="w-3.5 h-3.5" /></span>
        Commodities
      </h3>

      <div className="card overflow-hidden !p-0 divide-y divide-gray-100">
        {/* BTC Row */}
        <button onClick={() => setBtcOpen(true)} className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 transition-colors group text-left">
          <ChevronRight className="w-3 h-3 text-gray-400 shrink-0" />
          <span className="text-xs font-semibold text-gray-900 flex-1 min-w-0 truncate">BTC</span>
          {loadingBtc ? (
            <Skeleton className="h-3.5 w-20" />
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
            <Skeleton className="h-3.5 w-20" />
          ) : goldPrice ? (
            <>
              {goldValuation && (
                <span className="text-[10px] text-gray-400 shrink-0">
                  Au/M2 <span className={`font-medium ${goldValuation.valuation.zone === "cheap" ? "text-emerald-600" : goldValuation.valuation.zone === "expensive" ? "text-red-600" : "text-gray-600"}`}>{goldValuation.valuation.value.toFixed(1)}</span>
                </span>
              )}
              <span className="text-xs font-bold tabular-nums text-gray-900 shrink-0">{formatUsd(goldPrice)}</span>
              {gold?.gld && (
                <span className={`text-[10px] tabular-nums shrink-0 ${gold.gld.changePercent >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                  {gold.gld.changePercent >= 0 ? "+" : ""}{gold.gld.changePercent.toFixed(2)}%
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
              <Skeleton className="h-3.5 w-20" />
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

        {/* Oil Row */}
        <div>
          <button
            onClick={() => setOilExpanded(!oilExpanded)}
            className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-gray-50 transition-colors"
          >
            <ChevronRight className={`w-3 h-3 text-gray-400 transition-transform shrink-0 ${oilExpanded ? "rotate-90" : ""}`} />
            <span className="text-xs font-semibold text-gray-900 flex-1 min-w-0 truncate">Oil (WTI)</span>
            {loadingOil ? (
              <Skeleton className="h-3.5 w-20" />
            ) : oil?.wti?.price ? (
              <>
                {oilGoldRatio !== null && (
                  <span className="text-[10px] text-gray-400 shrink-0">
                    Oil/Au <span className={`font-medium ${oilGoldRatio < 0.035 ? "text-emerald-600" : oilGoldRatio > 0.055 ? "text-red-600" : "text-gray-600"}`}>{oilGoldRatio.toFixed(3)}</span>
                  </span>
                )}
                <span className="text-xs font-bold tabular-nums text-gray-900 shrink-0">{formatUsd(oil.wti.price, 2)}</span>
                {oil.wti.changePercent != null && (
                  <span className={`text-[10px] tabular-nums shrink-0 ${oil.wti.changePercent >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                    {oil.wti.changePercent >= 0 ? "+" : ""}{oil.wti.changePercent.toFixed(2)}%
                  </span>
                )}
                {oilGoldRatio !== null && <OilGoldZone ratio={oilGoldRatio} />}
              </>
            ) : (
              <span className="text-xs text-gray-400">&mdash;</span>
            )}
          </button>
          {oilExpanded && (
            <div className="px-3 pb-3 pt-2 bg-gray-50/50 border-t border-gray-100">
              {oilGoldRatio !== null && (
                <div className="flex items-center gap-2 text-[10px] mb-2">
                  <span className="text-gray-500">Oil/Gold Ratio:</span>
                  <span className="font-bold text-gray-700 font-mono">{oilGoldRatio.toFixed(3)}</span>
                  <span className="text-gray-400">(WTI per barrel / Gold per oz)</span>
                </div>
              )}
              <div className="mb-2.5">
                <h4 className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Interpretation Guide</h4>
                <div className="space-y-1">
                  {OIL_GOLD_RANGES.map((range, idx) => {
                    const isActive = oilGoldRatio !== null && oilGoldRatio >= range.min && oilGoldRatio < range.max;
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
                        <span className="text-gray-500 w-24 shrink-0 font-mono">{range.range}</span>
                        <span className="text-gray-600 flex-1">{range.meaning}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
              <p className="text-[9px] text-gray-400">Oil/Gold ratio strips out inflation — measures energy cost in real asset terms. Historical mean ~0.04–0.05.</p>
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
