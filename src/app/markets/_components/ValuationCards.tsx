"use client";

import { useState, useEffect } from "react";
import { Skeleton } from "@/components/Skeleton";
import { TrendingUp, TrendingDown, Minus, Globe } from "lucide-react";

interface SecondaryIndex {
  name: string;
  ticker: string;
  pe: number | null;
  change24h: number | null;
}

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
  secondaryIndex?: SecondaryIndex;
}

const ZONE_STYLES = {
  UNDERVALUED: {
    bg: "bg-emerald-100",
    text: "text-emerald-700",
    dot: "bg-emerald-500",
    label: "Undervalued",
  },
  FAIR: {
    bg: "bg-gray-100",
    text: "text-gray-600",
    dot: "bg-gray-400",
    label: "Fair Value",
  },
  OVERVALUED: {
    bg: "bg-amber-100",
    text: "text-amber-700",
    dot: "bg-amber-500",
    label: "Overvalued",
  },
  EXPENSIVE: {
    bg: "bg-orange-100",
    text: "text-orange-700",
    dot: "bg-orange-500",
    label: "Expensive",
  },
};

function ValuationRangeBar({
  value,
  mean,
  range,
  zone,
}: {
  value: number;
  mean: number;
  range: { min: number; max: number };
  zone: MarketValuation["zone"];
}) {
  const rangeSpan = range.max - range.min;
  const position = Math.min(
    100,
    Math.max(0, ((value - range.min) / rangeSpan) * 100),
  );
  const meanPosition = ((mean - range.min) / rangeSpan) * 100;

  return (
    <div className="relative h-2.5 w-full rounded-full overflow-hidden bg-gray-100">
      {/* Gradient background */}
      <div className="absolute inset-0 bg-gradient-to-r from-emerald-200 via-gray-200 via-50% to-orange-200" />

      {/* Historical mean marker */}
      <div
        className="absolute top-0 bottom-0 w-px bg-gray-500"
        style={{ left: `${meanPosition}%` }}
        title={`Historical mean: ${mean}x`}
      />

      {/* Current value indicator */}
      <div
        className={`absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full border-2 border-white shadow-sm ${ZONE_STYLES[zone].dot}`}
        style={{ left: `calc(${position}% - 6px)` }}
      />
    </div>
  );
}

function ValuationCard({ data }: { data: MarketValuation }) {
  const zoneStyle = ZONE_STYLES[data.zone];
  const metricLabel = data.metric === "CAPE" ? "CAPE" : "P/E";

  return (
    <div className="card p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xl">{data.flag}</span>
          <div>
            <h4 className="text-sm font-medium text-gray-900">
              {data.country}
            </h4>
            <p className="text-[10px] text-gray-500">{data.index}</p>
          </div>
        </div>
        <span
          className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${zoneStyle.bg} ${zoneStyle.text}`}
        >
          {zoneStyle.label}
        </span>
      </div>

      {/* Primary metric */}
      <div className="flex items-baseline justify-between">
        <span className="text-xl font-semibold text-gray-900">
          {data.value?.toFixed(1) ?? "—"}x
        </span>
        <span className="text-xs text-gray-500">
          {metricLabel} (mean: {data.historicalMean}x)
        </span>
      </div>

      {/* Range bar */}
      {data.value && (
        <ValuationRangeBar
          value={data.value}
          mean={data.historicalMean}
          range={data.historicalRange}
          zone={data.zone}
        />
      )}

      {/* Secondary metrics & change */}
      <div className="flex items-center justify-between text-[10px] text-gray-500 pt-1">
        <div className="flex items-center gap-2">
          {data.dividendYield !== null && data.dividendYield > 0 && (
            <span>Yield: {data.dividendYield.toFixed(1)}%</span>
          )}
          {data.priceToBook !== null && (
            <span>P/B: {data.priceToBook.toFixed(1)}x</span>
          )}
        </div>
        {data.change24h !== null && (
          <div className="flex items-center gap-0.5">
            {data.change24h > 0 ? (
              <TrendingUp className="w-3 h-3 text-emerald-500" />
            ) : data.change24h < 0 ? (
              <TrendingDown className="w-3 h-3 text-red-500" />
            ) : (
              <Minus className="w-3 h-3 text-gray-400" />
            )}
            <span
              className={
                data.change24h > 0
                  ? "text-emerald-600"
                  : data.change24h < 0
                    ? "text-red-600"
                    : ""
              }
            >
              {data.change24h > 0 ? "+" : ""}
              {data.change24h.toFixed(2)}%
            </span>
          </div>
        )}
      </div>

      {/* Secondary index (e.g., Hang Seng for China) */}
      {data.secondaryIndex && (
        <div className="flex items-center justify-between text-[10px] text-gray-500 border-t border-gray-100 pt-2 mt-1">
          <span className="font-medium">{data.secondaryIndex.name}</span>
          <div className="flex items-center gap-2">
            {data.secondaryIndex.pe !== null && (
              <span>P/E: {data.secondaryIndex.pe.toFixed(1)}x</span>
            )}
            {data.secondaryIndex.change24h !== null && (
              <span
                className={
                  data.secondaryIndex.change24h > 0
                    ? "text-emerald-600"
                    : data.secondaryIndex.change24h < 0
                      ? "text-red-600"
                      : ""
                }
              >
                {data.secondaryIndex.change24h > 0 ? "+" : ""}
                {data.secondaryIndex.change24h.toFixed(2)}%
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function ValuationCards() {
  const [valuations, setValuations] = useState<MarketValuation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/markets/valuation")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch");
        return res.json();
      })
      .then((data) => {
        setValuations(data.valuations || []);
      })
      .catch((e) => {
        console.error("Error fetching valuations:", e);
        setError("Failed to load valuations");
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="col-span-full">
        <h3 className="text-xs font-semibold text-gray-900 mb-1.5 flex items-center gap-1.5">
          <span className="text-gray-400">
            <Globe className="w-3.5 h-3.5" />
          </span>
          Market Valuations
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="card p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Skeleton className="h-6 w-6 rounded" />
                <Skeleton className="h-4 w-24" />
              </div>
              <Skeleton className="h-6 w-16" />
              <Skeleton className="h-2.5 w-full rounded-full" />
              <Skeleton className="h-3 w-32" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="col-span-full text-center text-sm text-gray-500 py-4">
        {error}
      </div>
    );
  }

  return (
    <div className="col-span-full">
      <h3 className="text-xs font-semibold text-gray-900 mb-1.5 flex items-center gap-1.5">
        <span className="text-gray-400">
          <Globe className="w-3.5 h-3.5" />
        </span>
        Market Valuations
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {valuations.map((v) => (
          <ValuationCard key={v.market} data={v} />
        ))}
      </div>
    </div>
  );
}
