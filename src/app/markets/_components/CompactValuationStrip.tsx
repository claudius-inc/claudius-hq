"use client";

import { useState } from "react";
import useSWR from "swr";
import { Skeleton } from "@/components/Skeleton";
import {
  ChevronUpCircle,
  ChevronDownCircle,
  MinusCircle,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { fetcher, ssrHydratedConfig } from "@/lib/swr-config";
import { RefreshIndicator } from "@/components/ui/RefreshIndicator";
import { MarketDetailModal } from "./MarketDetailModal";

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
  // Per-market tactical momentum bias — derived server-side from price
  // vs 50/200-day moving averages. See deriveTacticalBias() in
  // src/lib/valuation.ts. Renders as the chevron icon next to the
  // country name.
  tacticalBias?: "bullish" | "neutral" | "bearish";
}

/**
 * Direct mapping from tactical bias to a visual direction. Bullish → up,
 * bearish → down, neutral → flat. The chevron is a short-horizon momentum
 * read that sits next to the long-horizon zone badge — when they agree
 * (e.g. Expensive + ↓), both signals reinforce; when they disagree (e.g.
 * Expensive + ↑), the chevron is the contradiction the user needs to
 * notice. Tooltip explains the underlying signals.
 *
 * Note: an earlier version of this code reframed the chevron as
 * "strategic call strengthening / weakening" by XOR-ing the zone with
 * the bias. That reframing only works when there's a chart visible to
 * provide temporal context (e.g. the Gavekal momentum charts) — in the
 * strip there's no chart and the reframed icon is counterintuitive.
 */
function deriveTacticalDirection(
  bias: MarketValuation["tacticalBias"],
): "up" | "down" | "neutral" {
  if (!bias || bias === "neutral") return "neutral";
  return bias === "bullish" ? "up" : "down";
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

function CompactValuationRow({
  data,
  onClick,
}: {
  data: MarketValuation;
  onClick: () => void;
}) {
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

  // Tactical momentum chevron — populated server-side for every market
  // from price vs 50/200-day MAs. Hidden when tacticalBias is undefined
  // (e.g. if Yahoo's quote endpoint failed and we couldn't compute it).
  const tacticalDirection = deriveTacticalDirection(data.tacticalBias);
  const showChevron = data.tacticalBias !== undefined;

  // Tooltip content explains, in plain English, what the chevron means.
  // The chevron is a short-horizon trend read (price vs 50/200-day moving
  // averages) that sits next to the long-horizon valuation zone badge.
  // When they agree, both signals reinforce; when they disagree, the
  // tooltip explicitly flags the divergence.
  const zoneWord = zoneStyle.label; // "Cheap" | "Fair" | "Expensive"
  let chevronTooltip: string;
  if (tacticalDirection === "up") {
    const agreement =
      data.zone === "UNDERVALUED"
        ? ` Reinforces the ${zoneWord} valuation read.`
        : data.zone === "OVERVALUED"
          ? ` Diverges from the ${zoneWord} valuation read — late-cycle momentum despite stretched multiples.`
          : "";
    chevronTooltip = `Short-term momentum is bullish — price is above both the 50-day and 200-day moving averages.${agreement}`;
  } else if (tacticalDirection === "down") {
    const agreement =
      data.zone === "OVERVALUED"
        ? ` Reinforces the ${zoneWord} valuation read — both long-term valuation and short-term technicals point the same way.`
        : data.zone === "UNDERVALUED"
          ? ` Diverges from the ${zoneWord} valuation read — falling-knife risk: the asset is cheap but still selling off.`
          : "";
    chevronTooltip = `Short-term momentum is bearish — price is below both the 50-day and 200-day moving averages.${agreement}`;
  } else {
    chevronTooltip = `Short-term momentum is mixed — price is between or close to the 50-day and 200-day moving averages, no clear directional trend.`;
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Open ${data.country} market detail`}
      className="block w-full text-left px-3 py-1.5 hover:bg-gray-50 transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-gray-400"
    >
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
        {showChevron && (
          <Tooltip>
            <TooltipTrigger asChild>
              {/*
                Rendered as a <span> rather than a <button> because this
                element sits inside the row-level <button>. Nested
                interactive elements are invalid HTML and React will fire
                the outer onClick when the inner is clicked. Stopping
                propagation here keeps the chevron click from also
                opening the market detail modal.
              */}
              <span
                role="img"
                aria-label={`Tactical momentum ${tacticalDirection === "up" ? "bullish" : tacticalDirection === "down" ? "bearish" : "neutral"}`}
                tabIndex={0}
                // Touch-fix: Radix Tooltip on mobile opens on touchstart
                // but the subsequent click event triggers an immediate
                // close. Calling preventDefault here stops the click from
                // toggling the open state away. Hover behavior on desktop
                // is unaffected.
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                className="inline-flex items-center justify-center shrink-0 focus:outline-none focus-visible:ring-1 focus-visible:ring-gray-400 rounded-full"
              >
                {tacticalDirection === "up" ? (
                  <ChevronUpCircle className="w-3.5 h-3.5 text-emerald-600" />
                ) : tacticalDirection === "down" ? (
                  <ChevronDownCircle className="w-3.5 h-3.5 text-red-600" />
                ) : (
                  <MinusCircle className="w-3.5 h-3.5 text-gray-400" />
                )}
              </span>
            </TooltipTrigger>
            <TooltipContent
              side="top"
              align="end"
              collisionPadding={8}
              className="z-[10000] max-w-xs text-[11px] leading-snug"
            >
              {chevronTooltip}
            </TooltipContent>
          </Tooltip>
        )}
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
    </button>
  );
}

interface ValuationResponse {
  valuations: MarketValuation[];
}

export interface CompactValuationStripProps {
  initialData?: ValuationResponse | null;
}

export function CompactValuationStrip(props: CompactValuationStripProps = {}) {
  const { initialData } = props;
  const { data, isValidating } = useSWR<ValuationResponse>(
    "/api/markets/valuation",
    fetcher,
    {
      ...ssrHydratedConfig,
      fallbackData: initialData ?? undefined,
    },
  );
  const valuations = data?.valuations ?? [];
  const loading = !data;

  // Selected market drives the per-market detail modal. Held inside this
  // component because (a) only this component knows the full
  // `MarketValuation` shape, (b) the detail modal needs the same data the
  // row already has so we don't refetch valuation in the modal.
  const [selectedMarket, setSelectedMarket] = useState<MarketValuation | null>(
    null,
  );

  return (
    <TooltipProvider delayDuration={150}>
      <div className="h-full relative">
        <div className="absolute top-1.5 right-2 z-10">
          <RefreshIndicator active={isValidating} />
        </div>
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
                <CompactValuationRow
                  key={v.market}
                  data={v}
                  onClick={() => setSelectedMarket(v)}
                />
              ))}
        </div>
      </div>
      {selectedMarket && (
        <MarketDetailModal
          open={selectedMarket !== null}
          onClose={() => setSelectedMarket(null)}
          market={selectedMarket.market}
          country={selectedMarket.country}
          flag={selectedMarket.flag}
          valuation={{
            metric: selectedMarket.metric,
            value: selectedMarket.value,
            historicalMean: selectedMarket.historicalMean,
            historicalRange: selectedMarket.historicalRange,
            thresholds: selectedMarket.thresholds,
            zone: selectedMarket.zone,
            tacticalBias: selectedMarket.tacticalBias,
          }}
        />
      )}
    </TooltipProvider>
  );
}
