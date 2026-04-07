import { Skeleton } from "@/components/Skeleton";
import { ChevronRight } from "lucide-react";
import { categoryOrder, categoryLabels, categoryIcons } from "./constants";
import { getStatusColor, getTrendArrow, formatIndicatorVal } from "./helpers";
import { IndicatorDetails } from "./IndicatorDetails";
import { MACRO_INDICATORS } from "@/lib/macro-indicators";
import type { MacroIndicator } from "./types";

interface IndicatorsProps {
  macroIndicators: MacroIndicator[];
  loading: boolean;
  expandedIds: Set<string>;
  toggleExpanded: (id: string) => void;
}

export function Indicators({
  macroIndicators,
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
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
