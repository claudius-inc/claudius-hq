"use client";

import { useState, useEffect } from "react";
import { Skeleton } from "@/components/Skeleton";
import { TrendingUp, TrendingDown, Minus, Globe } from "lucide-react";
import { GavekalQuadrant } from "./GavekalQuadrant";
import type { GavekalData } from "./types";

interface MarketValuation {
  market: string;
  country: string;
  flag: string;
  index: string;
  ticker: string;
  metric: "CAPE" | "TTM_PE";
  value: number | null;
  historicalMean: number;
  historicalRange: { min: number; max: number };
  zone: "UNDERVALUED" | "FAIR" | "OVERVALUED" | "EXPENSIVE";
  percentOfMean: number;
  dividendYield: number | null;
  priceToBook: number | null;
  price: number | null;
  change24h: number | null;
  secondaryIndex?: {
    name: string;
    ticker: string;
    pe: number | null;
    change24h: number | null;
  };
}

interface RegimeAndValuationsProps {
  gavekalData: GavekalData | null;
  loadingGavekal: boolean;
}

const ZONE_STYLES = {
  UNDERVALUED: { bg: "bg-emerald-100", text: "text-emerald-700", dot: "bg-emerald-500", label: "Cheap" },
  FAIR: { bg: "bg-gray-100", text: "text-gray-600", dot: "bg-gray-400", label: "Fair" },
  OVERVALUED: { bg: "bg-amber-100", text: "text-amber-700", dot: "bg-amber-500", label: "Rich" },
  EXPENSIVE: { bg: "bg-orange-100", text: "text-orange-700", dot: "bg-orange-500", label: "Pricey" },
};

function CompactValuationRow({ data }: { data: MarketValuation }) {
  const zoneStyle = ZONE_STYLES[data.zone];
  const metricLabel = data.metric === "CAPE" ? "CAPE" : "P/E";
  const rangeSpan = data.historicalRange.max - data.historicalRange.min;
  const position = data.value
    ? Math.min(100, Math.max(0, ((data.value - data.historicalRange.min) / rangeSpan) * 100))
    : 0;

  return (
    <div className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 transition-colors">
      <span className="text-base shrink-0">{data.flag}</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-medium text-gray-900 truncate">{data.country}</span>
          <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded-full shrink-0 ${zoneStyle.bg} ${zoneStyle.text}`}>
            {zoneStyle.label}
          </span>
        </div>
        {/* Mini range bar */}
        {data.value && (
          <div className="relative h-1 w-full mt-1 rounded-full overflow-hidden bg-gray-100">
            <div className="absolute inset-0 bg-gradient-to-r from-emerald-200 via-gray-200 via-50% to-orange-200" />
            <div
              className={`absolute top-1/2 -translate-y-1/2 w-2 h-2 rounded-full border border-white shadow-sm ${zoneStyle.dot}`}
              style={{ left: `calc(${position}% - 4px)` }}
            />
          </div>
        )}
      </div>
      <div className="text-right shrink-0">
        <span className="text-xs font-bold tabular-nums text-gray-900">
          {data.value?.toFixed(1) ?? "\u2014"}x
        </span>
        <span className="text-[9px] text-gray-400 ml-0.5">{metricLabel}</span>
      </div>
      {data.change24h !== null && (
        <div className="flex items-center gap-0.5 shrink-0 w-14 justify-end">
          {data.change24h > 0 ? (
            <TrendingUp className="w-2.5 h-2.5 text-emerald-500" />
          ) : data.change24h < 0 ? (
            <TrendingDown className="w-2.5 h-2.5 text-red-500" />
          ) : (
            <Minus className="w-2.5 h-2.5 text-gray-400" />
          )}
          <span className={`text-[10px] tabular-nums ${data.change24h > 0 ? "text-emerald-600" : data.change24h < 0 ? "text-red-600" : "text-gray-500"}`}>
            {data.change24h > 0 ? "+" : ""}{data.change24h.toFixed(1)}%
          </span>
        </div>
      )}
    </div>
  );
}

function CompactValuationStrip() {
  const [valuations, setValuations] = useState<MarketValuation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/markets/valuation")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setValuations(data?.valuations || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <h3 className="text-xs font-semibold text-gray-900 mb-1.5 flex items-center gap-1.5">
        <span className="text-gray-400"><Globe className="w-3.5 h-3.5" /></span>
        Valuations
      </h3>
      <div className="card overflow-hidden !p-0 divide-y divide-gray-100">
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-2 px-3 py-2.5">
              <Skeleton className="h-5 w-5 rounded" />
              <Skeleton className="h-3 w-16 flex-1" />
              <Skeleton className="h-3 w-10" />
              <Skeleton className="h-3 w-12" />
            </div>
          ))
        ) : (
          valuations.map((v) => <CompactValuationRow key={v.market} data={v} />)
        )}
      </div>
    </div>
  );
}

export function RegimeAndValuations({ gavekalData, loadingGavekal }: RegimeAndValuationsProps) {
  return (
    <div className="col-span-full">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
        <div className="lg:col-span-2">
          <GavekalQuadrant data={gavekalData} loading={loadingGavekal} />
        </div>
        <div className="lg:col-span-1">
          <CompactValuationStrip />
        </div>
      </div>
    </div>
  );
}
