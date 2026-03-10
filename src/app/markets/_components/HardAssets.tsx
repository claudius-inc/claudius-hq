"use client";

import { useState } from "react";
import useSWR from "swr";
import { Gem, ArrowRight } from "lucide-react";
import { Skeleton } from "@/components/Skeleton";
import { GoldDetail } from "./GoldDetail";
import { BtcDetail } from "./BtcDetail";

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

function MayerZone({ mayer }: { mayer: number }) {
  if (mayer < 0.8) return <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700">Buy &lt;0.8</span>;
  if (mayer > 2.4) return <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-700">Sell &gt;2.4</span>;
  return <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600">Normal</span>;
}

function WmaZone({ distance }: { distance: number }) {
  if (distance < 15) return <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-700">Near Floor</span>;
  if (distance < 30) return <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">Caution</span>;
  return <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700">Safe</span>;
}

function OilZone({ price }: { price: number }) {
  if (price < 65) return <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700">Cheap</span>;
  if (price < 80) return <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600">Normal</span>;
  if (price < 100) return <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">Elevated</span>;
  return <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-700">Crisis</span>;
}

function SilverStressZone({ level }: { level: SilverSnapshot["stressLevel"] }) {
  switch (level) {
    case "critical":
      return <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-700">Critical</span>;
    case "high":
      return <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">High Stress</span>;
    case "moderate":
      return <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600">Moderate</span>;
    default:
      return <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700">Low</span>;
  }
}

function GoldSilverRatioZone({ ratio }: { ratio: number }) {
  // Historical mean is ~60, below 50 = silver expensive, above 80 = silver cheap
  if (ratio > 80) return <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700">Silver Cheap</span>;
  if (ratio > 65) return <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600">Normal</span>;
  return <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">Silver Expensive</span>;
}

export function HardAssets() {
  const [btcOpen, setBtcOpen] = useState(false);
  const [goldOpen, setGoldOpen] = useState(false);

  const { data: btc, isLoading: loadingBtc } = useSWR<BtcSnapshot>("/api/btc", fetcher, swrConfig);
  const { data: gold, isLoading: loadingGold } = useSWR<GoldSnapshot>("/api/gold", fetcher, swrConfig);
  const { data: oil, isLoading: loadingOil } = useSWR<OilSnapshot>("/api/oil", fetcher, swrConfig);
  const { data: silver, isLoading: loadingSilver } = useSWR<SilverSnapshot>("/api/markets/silver", fetcher, swrConfig);
  const { data: silverPrice, isLoading: loadingSilverPrice } = useSWR<SilverPriceSnapshot>("/api/silver-price", fetcher, swrConfig);

  const goldPrice = gold?.livePrice;
  const goldAth = gold?.analysis?.ath;
  const athDist = goldPrice && goldAth ? ((goldPrice - goldAth) / goldAth) * 100 : null;

  return (
    <div>
      <h3 className="text-xs font-semibold text-gray-900 mb-1.5 flex items-center gap-1.5">
        <span className="flex items-center text-gray-400"><Gem className="w-3.5 h-3.5" /></span>
        Hard Assets
      </h3>

      <div className="card overflow-hidden !p-0 divide-y divide-gray-100">
        {/* BTC Row */}
        <button onClick={() => setBtcOpen(true)} className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 transition-colors group text-left">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-gray-900">BTC</span>
              {loadingBtc ? (
                <Skeleton className="h-3.5 w-20" />
              ) : btc ? (
                <span className="text-xs font-bold tabular-nums text-gray-900">{formatUsd(btc.livePrice)}</span>
              ) : (
                <span className="text-xs text-gray-400">&mdash;</span>
              )}
              {btc && (
                <span className={`text-[10px] tabular-nums ${btc.changePercent >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                  {btc.changePercent >= 0 ? "+" : ""}{btc.changePercent.toFixed(2)}%
                </span>
              )}
            </div>
            {loadingBtc ? (
              <Skeleton className="h-2.5 w-40 mt-1" />
            ) : btc ? (
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[10px] text-gray-400">
                  Mayer <span className="font-medium text-gray-600">{btc.mayerMultiple.toFixed(2)}</span>
                </span>
                <MayerZone mayer={btc.mayerMultiple} />
                <span className="text-[10px] text-gray-400">
                  200WMA <span className="font-medium text-gray-600">+{btc.distancePercent.toFixed(0)}%</span>
                </span>
                <WmaZone distance={btc.distancePercent} />
              </div>
            ) : null}
          </div>
          <ArrowRight className="w-3 h-3 text-gray-300 group-hover:text-gray-500 transition-colors shrink-0" />
        </button>

        {/* Gold Row */}
        <button onClick={() => setGoldOpen(true)} className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 transition-colors group text-left">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-gray-900">Gold</span>
              {loadingGold ? (
                <Skeleton className="h-3.5 w-20" />
              ) : goldPrice ? (
                <span className="text-xs font-bold tabular-nums text-gray-900">{formatUsd(goldPrice)}</span>
              ) : (
                <span className="text-xs text-gray-400">&mdash;</span>
              )}
              {gold?.gld && (
                <span className={`text-[10px] tabular-nums ${gold.gld.changePercent >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                  GLD {gold.gld.changePercent >= 0 ? "+" : ""}{gold.gld.changePercent.toFixed(2)}%
                </span>
              )}
            </div>
            {loadingGold ? (
              <Skeleton className="h-2.5 w-40 mt-1" />
            ) : gold ? (
              <div className="flex items-center gap-2 mt-0.5">
                {gold.realYields && (
                  <span className="text-[10px] text-gray-400">
                    RY <span className={`font-medium ${gold.realYields.value < 0 ? "text-amber-600" : "text-emerald-600"}`}>{gold.realYields.value.toFixed(2)}%</span>
                  </span>
                )}
                {gold.dxy && (
                  <span className="text-[10px] text-gray-400">
                    DXY <span className="font-medium text-gray-600">{gold.dxy.price.toFixed(1)}</span>
                  </span>
                )}
                {athDist !== null && (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${athDist >= 0 ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-600"}`}>
                    {athDist >= 0 ? "New ATH" : `${athDist.toFixed(1)}% from ATH`}
                  </span>
                )}
              </div>
            ) : null}
          </div>
          <ArrowRight className="w-3 h-3 text-gray-300 group-hover:text-gray-500 transition-colors shrink-0" />
        </button>

        {/* Silver Row */}
        <div className="flex items-center gap-3 px-3 py-2.5">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-gray-900">Silver</span>
              {loadingSilverPrice ? (
                <Skeleton className="h-3.5 w-20" />
              ) : silverPrice?.price ? (
                <span className="text-xs font-bold tabular-nums text-gray-900">{formatUsd(silverPrice.price, 2)}</span>
              ) : (
                <span className="text-xs text-gray-400">&mdash;</span>
              )}
              {silverPrice?.changePercent != null && (
                <span className={`text-[10px] tabular-nums ${silverPrice.changePercent >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                  {silverPrice.changePercent >= 0 ? "+" : ""}{silverPrice.changePercent.toFixed(2)}%
                </span>
              )}
            </div>
            {loadingSilver || loadingSilverPrice ? (
              <Skeleton className="h-2.5 w-48 mt-1" />
            ) : (
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                {silverPrice?.goldSilverRatio && (
                  <>
                    <span className="text-[10px] text-gray-400">
                      Au/Ag <span className="font-medium text-gray-600">{silverPrice.goldSilverRatio.toFixed(1)}</span>
                    </span>
                    <GoldSilverRatioZone ratio={silverPrice.goldSilverRatio} />
                  </>
                )}
                {silver?.latest && (
                  <span className="text-[10px] text-gray-400">
                    COMEX <span className="font-medium text-gray-600">{silver.latest.registeredMoz}M oz</span>
                  </span>
                )}
                {silver?.change30d && (
                  <span className={`text-[10px] tabular-nums ${silver.change30d.registeredPercent < 0 ? "text-red-600" : "text-emerald-600"}`}>
                    {silver.change30d.registeredPercent >= 0 ? "+" : ""}{silver.change30d.registeredPercent.toFixed(1)}% 30d
                  </span>
                )}
                {silver && <SilverStressZone level={silver.stressLevel} />}
              </div>
            )}
          </div>
        </div>

        {/* Oil Row */}
        <div className="flex items-center gap-3 px-3 py-2.5">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-gray-900">Oil</span>
              {loadingOil ? (
                <Skeleton className="h-3.5 w-20" />
              ) : oil?.wti?.price ? (
                <span className="text-xs font-bold tabular-nums text-gray-900">{formatUsd(oil.wti.price, 2)}</span>
              ) : (
                <span className="text-xs text-gray-400">&mdash;</span>
              )}
              {oil?.wti?.changePercent != null && (
                <span className={`text-[10px] tabular-nums ${oil.wti.changePercent >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                  WTI {oil.wti.changePercent >= 0 ? "+" : ""}{oil.wti.changePercent.toFixed(2)}%
                </span>
              )}
            </div>
            {loadingOil ? (
              <Skeleton className="h-2.5 w-40 mt-1" />
            ) : oil?.wti ? (
              <div className="flex items-center gap-2 mt-0.5">
                {oil.brent?.price && (
                  <span className="text-[10px] text-gray-400">
                    Brent <span className="font-medium text-gray-600">${oil.brent.price.toFixed(2)}</span>
                  </span>
                )}
                {oil.spread != null && (
                  <span className="text-[10px] text-gray-400">
                    Spread <span className="font-medium text-gray-600">${oil.spread.toFixed(2)}</span>
                  </span>
                )}
                {oil.wti.price && <OilZone price={oil.wti.price} />}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* Detail Modals */}
      <BtcDetail open={btcOpen} onClose={() => setBtcOpen(false)} />
      <GoldDetail open={goldOpen} onClose={() => setGoldOpen(false)} />
    </div>
  );
}
