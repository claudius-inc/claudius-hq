"use client";

import { useState, useEffect } from "react";
import { Skeleton } from "@/components/Skeleton";

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
  thresholds: { undervalued: number; overvalued: number };
  zone: "UNDERVALUED" | "FAIR" | "OVERVALUED";
  percentOfMean: number;
  dividendYield: number | null;
  priceToBook: number | null;
  price: number | null;
}

const ZONE_STYLES = {
  UNDERVALUED: {
    bg: "bg-emerald-100",
    text: "text-emerald-700",
    dot: "bg-emerald-500",
    label: "Cheap",
  },
  FAIR: {
    bg: "bg-gray-100",
    text: "text-gray-600",
    dot: "bg-gray-500",
    label: "Fair",
  },
  OVERVALUED: {
    bg: "bg-orange-100",
    text: "text-orange-700",
    dot: "bg-orange-500",
    label: "Expensive",
  },
};

function clampPct(pct: number) {
  return Math.min(100, Math.max(0, pct));
}

// Convert a flag emoji (two regional indicator symbols) to its ISO 3166-1
// alpha-2 country code, lowercased — e.g. "🇺🇸" → "us". Windows desktop does
// not render flag emoji, so we serve actual images keyed by this code instead.
function flagEmojiToIso(flag: string): string | null {
  const codePoints = Array.from(flag).map((c) => c.codePointAt(0) ?? 0);
  if (codePoints.length !== 2) return null;
  const base = 0x1f1e6;
  const chars = codePoints.map((cp) => String.fromCharCode(cp - base + 97));
  return chars.join("");
}

function CompactValuationRow({ data }: { data: MarketValuation }) {
  const zoneStyle = ZONE_STYLES[data.zone];
  const metricLabel = data.metric === "CAPE" ? "CAPE" : "P/E";
  const { min, max } = data.historicalRange;
  const span = max - min;

  // Position of zone boundaries on the bar (0–100%)
  const undervaluedPct = clampPct(
    ((data.thresholds.undervalued - min) / span) * 100,
  );
  const overvaluedPct = clampPct(
    ((data.thresholds.overvalued - min) / span) * 100,
  );
  const dotPct = data.value ? clampPct(((data.value - min) / span) * 100) : 0;
  const iso = flagEmojiToIso(data.flag);

  return (
    <div className="px-3 py-1.5 hover:bg-gray-50 transition-colors">
      {/* Top row: flag, country, badge, value */}
      <div className="flex items-center gap-2">
        {iso ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`https://flagcdn.com/w40/${iso}.png`}
            srcSet={`https://flagcdn.com/w80/${iso}.png 2x`}
            width={20}
            height={15}
            alt={`${data.country} flag`}
            className="shrink-0 rounded-sm object-cover"
          />
        ) : (
          <span className="text-base shrink-0">{data.flag}</span>
        )}
        <span className="text-xs font-medium text-gray-900 truncate flex-1">
          {data.country}
        </span>
        <span
          className={`text-[9px] font-medium px-1.5 py-0.5 rounded-full shrink-0 ${zoneStyle.bg} ${zoneStyle.text}`}
        >
          {zoneStyle.label}
        </span>
        <div className="text-right shrink-0 tabular-nums">
          <span className="text-xs font-bold text-gray-900">
            {data.value?.toFixed(1) ?? "\u2014"}x
          </span>
          <span className="text-[9px] text-gray-400 ml-0.5">{metricLabel}</span>
        </div>
      </div>

      {/* Segmented zone bar with inline tick labels */}
      {data.value && (
        <div className=" relative h-3.5">
          {/* Bar centered vertically in the wrapper */}
          <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-1.5 rounded-full overflow-hidden bg-gray-100">
            {/* Cheap segment */}
            <div
              className="absolute inset-y-0 left-0 bg-emerald-200"
              style={{ width: `${undervaluedPct}%` }}
            />
            {/* Fair segment */}
            <div
              className="absolute inset-y-0 bg-gray-200"
              style={{
                left: `${undervaluedPct}%`,
                width: `${overvaluedPct - undervaluedPct}%`,
              }}
            />
            {/* Rich segment */}
            <div
              className="absolute inset-y-0 right-0 bg-orange-200"
              style={{ width: `${100 - overvaluedPct}%` }}
            />
          </div>
          {/* Threshold labels — sit on the bar, centered vertically */}
          <span
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 px-1 bg-white text-[9px] tabular-nums text-gray-400 leading-none z-10"
            style={{ left: `${undervaluedPct}%` }}
          >
            {data.thresholds.undervalued}
          </span>
          <span
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 px-1 bg-white text-[9px] tabular-nums text-gray-400 leading-none z-10"
            style={{ left: `${overvaluedPct}%` }}
          >
            {data.thresholds.overvalued}
          </span>
          {/* Current value dot — above labels so it never hides */}
          <div
            className={`absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full border border-white shadow-sm z-20 ${zoneStyle.dot}`}
            style={{ left: `calc(${dotPct}% - 5px)` }}
          />
        </div>
      )}
    </div>
  );
}

export function CompactValuationStrip() {
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
    <div className="h-full">
      <div className="card overflow-hidden !p-0 divide-y divide-gray-100 h-full">
        {loading
          ? Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="px-3 py-1.5">
                <div className="flex items-center gap-2">
                  <Skeleton className="h-[22px] w-5 rounded-sm" />
                  <Skeleton className="h-3 w-16 flex-1" />
                  <Skeleton className="h-3 w-10" />
                  <Skeleton className="h-3 w-12" />
                </div>
                <Skeleton className="h-1.5 w-full mt-2 rounded-full" />
              </div>
            ))
          : valuations.map((v) => (
              <CompactValuationRow key={v.market} data={v} />
            ))}
      </div>
    </div>
  );
}
