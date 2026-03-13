import { Skeleton } from "@/components/Skeleton";
import { ChevronRight } from "lucide-react";
import { categoryOrder, categoryLabels, categoryIcons } from "./constants";
import { getStatusColor, getTrendArrow, formatIndicatorVal } from "./helpers";
import { IndicatorDetails } from "./IndicatorDetails";
import { GexChart } from "./GexChart";
import { MACRO_INDICATORS } from "@/lib/macro-indicators";
import type { MacroIndicator, YieldSpread } from "./types";

interface IndicatorsProps {
  macroIndicators: MacroIndicator[];
  yieldSpreads: YieldSpread[];
  loading: boolean;
  expandedIds: Set<string>;
  toggleExpanded: (id: string) => void;
}

export function Indicators({
  macroIndicators,
  yieldSpreads,
  loading,
  expandedIds,
  toggleExpanded,
}: IndicatorsProps) {
  const grouped = macroIndicators.reduce(
    (acc: Record<string, MacroIndicator[]>, ind) => {
      if (!acc[ind.category]) acc[ind.category] = [];
      acc[ind.category].push(ind);
      return acc;
    },
    {},
  );

  return (
    <div className="col-span-full space-y-4">
      {loading ? (
        categoryOrder.map((category) => {
          const staticIndicators = MACRO_INDICATORS.filter(i => i.category === category);
          if (!staticIndicators.length) return null;
          return (
            <div key={category}>
              <h3 className="text-xs font-semibold text-gray-900 mb-1.5 flex items-center gap-1.5">
                <span className="flex items-center text-gray-400">
                  {categoryIcons[category]}
                </span>
                {categoryLabels[category]}
              </h3>
              <div className="card overflow-hidden !p-0 divide-y divide-gray-100">
                {staticIndicators.map((ind) => (
                  <div key={ind.id} className="px-3 py-2.5 flex items-center gap-3">
                    <ChevronRight className="w-3 h-3 text-gray-400 shrink-0" />
                    <span className="text-xs font-medium text-gray-900 flex-1 min-w-0 truncate">{ind.name}</span>
                    <Skeleton className="h-3 w-14 !bg-gray-100" />
                    <Skeleton className="h-4 w-16 rounded-full !bg-gray-100" />
                  </div>
                ))}
              </div>
            </div>
          );
        })
      ) : (
        categoryOrder.map((category) => {
          const categoryIndicators = grouped[category];
          if (!categoryIndicators?.length) return null;

          return (
            <div key={category}>
              <h3 className="text-xs font-semibold text-gray-900 mb-1.5 flex items-center gap-1.5">
                <span className="flex items-center text-gray-400">
                  {categoryIcons[category]}
                </span>
                {categoryLabels[category]}
              </h3>
              <div className="card overflow-hidden !p-0 divide-y divide-gray-100">
                {categoryIndicators.map((indicator) => (
                  <div key={indicator.id}>
                    <button
                      onClick={() => toggleExpanded(indicator.id)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-gray-50 transition-colors"
                    >
                      <ChevronRight
                        className={`w-3 h-3 text-gray-400 transition-transform shrink-0 ${expandedIds.has(indicator.id) ? "rotate-90" : ""}`}
                      />
                      <span className="text-xs font-medium text-gray-900 flex-1 min-w-0 truncate">
                        {indicator.name}
                      </span>
                      {indicator.category === "fx" &&
                        indicator.data &&
                        (() => {
                          const trend = getTrendArrow(
                            indicator.data!.current,
                            indicator.data!.avg,
                          );
                          return (
                            <span className={`text-xs ${trend.color} shrink-0`}>
                              {trend.arrow}
                            </span>
                          );
                        })()}
                      <span className="text-xs font-bold tabular-nums text-gray-900 shrink-0">
                        {formatIndicatorVal(indicator)}
                      </span>
                      {indicator.interpretation && (
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded-full shrink-0 ${getStatusColor(indicator.interpretation.label)}`}
                        >
                          {indicator.interpretation.label}
                        </span>
                      )}
                      {indicator.percentile !== null && (
                        <div className="w-14 shrink-0 hidden sm:flex items-center gap-1">
                          <div className="flex-1 h-1 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-blue-400 rounded-full"
                              style={{ width: `${indicator.percentile}%` }}
                            />
                          </div>
                          <span className="text-[9px] text-gray-400 tabular-nums">
                            {indicator.percentile}th
                          </span>
                        </div>
                      )}
                    </button>
                    {expandedIds.has(indicator.id) && (
                      <div className="px-3 pb-3 pt-2 bg-gray-50/50 border-t border-gray-100">
                        <p className="text-xs text-gray-500 mb-2">
                          {indicator.description}
                        </p>
                        <IndicatorDetails indicator={indicator} />
                      </div>
                    )}
                  </div>
                ))}
                {/* GEX under rates & credit */}
                {category === "rates" && (
                  <GexChart
                    expanded={expandedIds.has("gex-chart")}
                    onToggle={() => toggleExpanded("gex-chart")}
                  />
                )}
                {/* Yield spreads under foreign-yields */}
                {category === "foreign-yields" &&
                  yieldSpreads.map((spread) => {
                    const spreadId = `spread-${spread.name.toLowerCase().replace(/\s+/g, "-")}`;
                    const badgeColor =
                      spread.color === "green"
                        ? "bg-emerald-100 text-emerald-700"
                        : spread.color === "amber"
                          ? "bg-amber-100 text-amber-700"
                          : "bg-gray-100 text-gray-700";
                    return (
                      <div key={spreadId}>
                        <button
                          onClick={() => toggleExpanded(spreadId)}
                          className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-gray-50 transition-colors"
                        >
                          <ChevronRight
                            className={`w-3 h-3 text-gray-400 transition-transform shrink-0 ${expandedIds.has(spreadId) ? "rotate-90" : ""}`}
                          />
                          <span className="text-xs font-medium text-gray-900 flex-1 min-w-0 truncate">
                            {spread.name}
                          </span>
                          <span className="text-xs font-bold tabular-nums text-gray-900 shrink-0">
                            {spread.value !== null ? `${spread.value}%` : "N/A"}
                          </span>
                          <span
                            className={`text-[10px] px-1.5 py-0.5 rounded-full shrink-0 ${badgeColor}`}
                          >
                            {spread.interpretation}
                          </span>
                        </button>
                        {expandedIds.has(spreadId) && (
                          <div className="px-3 pb-3 pt-2 bg-gray-50/50 border-t border-gray-100">
                            <p className="text-[10px] text-gray-500 mb-2">
                              {spread.name === "US-Japan Spread"
                                ? "Yield differential between US 10Y Treasury and Japan 10Y Government Bond. Measures yen carry trade attractiveness."
                                : "Yield differential between US 10Y Treasury and Germany 10Y Bund. Reflects US-Europe monetary policy divergence."}
                            </p>
                            <div className="space-y-2">
                              <div className="bg-blue-50 rounded-lg p-2.5">
                                <h4 className="text-[10px] font-semibold text-blue-600 uppercase tracking-wide mb-1">
                                  Current Reading
                                </h4>
                                <p className="text-[10px] text-gray-700 mb-0.5">
                                  <strong>Status:</strong>{" "}
                                  {spread.interpretation}
                                </p>
                                <p className="text-[10px] text-gray-700">
                                  <strong>Market Impact:</strong>{" "}
                                  {spread.name === "US-Japan Spread"
                                    ? "Higher spread attracts capital to USD, pressures yen lower, and supports carry trade positions."
                                    : "Higher spread attracts capital to USD over EUR, reflects relative economic strength."}
                                </p>
                              </div>
                              <div className="bg-gray-50 rounded-lg p-2.5">
                                <h4 className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">
                                  Why It Matters
                                </h4>
                                <p className="text-[10px] text-gray-700">
                                  {spread.name === "US-Japan Spread"
                                    ? "Japan\u2019s ultra-low rates make Yen the funding currency for global carry trades. When the spread narrows, carry trades unwind violently, causing global risk-off moves."
                                    : "The US-Europe yield gap drives transatlantic capital flows and EUR/USD direction. A narrowing spread can signal ECB hawkishness or Fed dovishness."}
                                </p>
                              </div>
                              <div>
                                <h4 className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                                  Interpretation Guide
                                </h4>
                                <div className="space-y-1">
                                  {[
                                    {
                                      label: "Attractive Carry",
                                      min: "3%",
                                      max: null,
                                      meaning:
                                        "Strong incentive for carry trades into USD assets",
                                      clr: "green" as const,
                                    },
                                    {
                                      label: "Moderate Carry",
                                      min: "2%",
                                      max: "3%",
                                      meaning:
                                        "Carry trades viable but with lower margin of safety",
                                      clr: "amber" as const,
                                    },
                                    {
                                      label: "Unattractive",
                                      min: null,
                                      max: "2%",
                                      meaning:
                                        "Carry trade unwind risk \u2014 capital may flow out of USD",
                                      clr: "amber" as const,
                                    },
                                  ].map((range, idx) => {
                                    const isActive = spread.color === range.clr;
                                    const rowColor =
                                      range.clr === "green"
                                        ? "bg-emerald-100 text-emerald-700 ring-1 ring-offset-1 ring-gray-300"
                                        : "bg-amber-100 text-amber-700 ring-1 ring-offset-1 ring-gray-300";
                                    return (
                                      <div
                                        key={idx}
                                        className={`flex flex-wrap items-start gap-1 text-[10px] p-1 rounded ${isActive ? rowColor : "bg-gray-50"}`}
                                      >
                                        <span className="font-medium w-24 shrink-0">
                                          {range.label}
                                        </span>
                                        <span className="text-gray-500 w-16 shrink-0 tabular-nums">
                                          {range.min !== null ? range.min : "<"}
                                          {range.min !== null &&
                                          range.max !== null
                                            ? " \u2013 "
                                            : ""}
                                          {range.max !== null ? range.max : "+"}
                                        </span>
                                        <span className="text-gray-600 flex-1">
                                          {range.meaning}
                                        </span>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                              <div>
                                <h4 className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">
                                  Assets Affected
                                </h4>
                                <div className="flex flex-wrap gap-1">
                                  {(spread.name === "US-Japan Spread"
                                    ? [
                                        "Carry trades",
                                        "Japanese banks",
                                        "Global risk assets",
                                        "Yen",
                                        "US Treasuries",
                                      ]
                                    : [
                                        "EUR/USD",
                                        "European equities",
                                        "US Treasuries",
                                        "Bunds",
                                        "Carry trades",
                                      ]
                                  ).map((asset, idx) => (
                                    <span
                                      key={idx}
                                      className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded"
                                    >
                                      {asset}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
