import { ChevronRight, BarChart3 } from "lucide-react";
import { etfColorMap } from "./constants";
import type { MarketEtf } from "./types";

interface BarometersProps {
  marketEtfs: MarketEtf[];
  loading: boolean;
  expandedIds: Set<string>;
  toggleExpanded: (id: string) => void;
}

export function Barometers({ marketEtfs, loading, expandedIds, toggleExpanded }: BarometersProps) {
  return (
    <div>
      <h3 className="text-xs font-semibold text-gray-900 mb-1.5 flex items-center gap-1.5">
        <span className="flex items-center text-gray-400"><BarChart3 className="w-3.5 h-3.5" /></span>
        Market Barometers
      </h3>
      {loading ? (
        <div className="card !p-3 text-xs text-gray-400">Loading barometers...</div>
      ) : marketEtfs.length > 0 ? (
        <div className="card overflow-hidden !p-0 divide-y divide-gray-100">
          {marketEtfs.map((etf) => {
            const etfId = `etf-${etf.ticker}`;
            return (
              <div key={etf.ticker}>
                <button
                  onClick={() => toggleExpanded(etfId)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-gray-50 transition-colors"
                >
                  <ChevronRight className={`w-3 h-3 text-gray-400 transition-transform shrink-0 ${expandedIds.has(etfId) ? "rotate-90" : ""}`} />
                  <span className="text-xs font-medium text-gray-900 flex-1 min-w-0 truncate">{etf.name}</span>
                  <span className="text-xs font-bold tabular-nums text-gray-900 shrink-0">
                    {etf.data ? `$${etf.data.price.toFixed(2)}` : "\u2014"}
                  </span>
                  {etf.data && (
                    <span className={`text-[10px] tabular-nums shrink-0 ${etf.data.changePercent >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                      {etf.data.changePercent >= 0 ? "+" : ""}{etf.data.changePercent.toFixed(2)}%
                    </span>
                  )}
                  {etf.interpretation && (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full shrink-0 ${etfColorMap[etf.interpretation.color] || "bg-gray-100 text-gray-700"}`}>
                      {etf.interpretation.label}
                    </span>
                  )}
                </button>
                {expandedIds.has(etfId) && (
                  <div className="px-3 pb-3 pt-2 bg-gray-50/50 border-t border-gray-100">
                    <p className="text-xs text-gray-500 mb-3">{etf.description}</p>
                    {etf.data && (
                      <div className="mb-3">
                        <div className="flex items-center gap-2 text-xs mb-1.5">
                          <span className="text-gray-500">Daily:</span>
                          <span className={`font-medium ${etf.data.change >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                            {etf.data.change >= 0 ? "+" : ""}{etf.data.change.toFixed(2)} ({etf.data.changePercent >= 0 ? "+" : ""}{etf.data.changePercent.toFixed(2)}%)
                          </span>
                        </div>
                        <div className="flex justify-between text-[10px] text-gray-500 mb-1">
                          <span>52W Low: ${etf.data.fiftyTwoWeekLow.toFixed(2)}</span>
                          <span>52W High: ${etf.data.fiftyTwoWeekHigh.toFixed(2)}</span>
                        </div>
                        <div className="relative h-1.5 bg-gray-200 rounded-full">
                          <div className="absolute top-0 left-0 h-full bg-blue-500 rounded-full" style={{ width: `${etf.data.rangePosition}%` }} />
                          <div className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 bg-blue-600 border-2 border-white rounded-full shadow" style={{ left: `${etf.data.rangePosition}%`, marginLeft: "-5px" }} />
                        </div>
                        <div className="flex gap-3 mt-1.5 text-[10px] text-gray-400">
                          <span>50D: ${etf.data.fiftyDayAvg.toFixed(2)}</span>
                          <span>200D: ${etf.data.twoHundredDayAvg.toFixed(2)}</span>
                          <span>{etf.data.rangePosition}th pctl</span>
                        </div>
                      </div>
                    )}
                    <div className="bg-gray-50 rounded-lg p-2.5 mb-2.5">
                      <h4 className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Why It Matters</h4>
                      <p className="text-xs text-gray-700">{etf.whyItMatters}</p>
                    </div>
                    {etf.interpretation && (
                      <div className="bg-blue-50 rounded-lg p-2.5 mb-2.5">
                        <h4 className="text-[10px] font-semibold text-blue-600 uppercase tracking-wide mb-1">Current Reading</h4>
                        <p className="text-xs text-gray-700">{etf.interpretation.meaning}</p>
                      </div>
                    )}
                    <div className="mb-2.5">
                      <h4 className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Interpretation Guide</h4>
                      <div className="space-y-1">
                        {etf.ranges.map((range, idx) => (
                          <div
                            key={idx}
                            className={`flex flex-wrap items-start gap-1 text-[10px] p-1 rounded ${
                              etf.interpretation?.label === range.label
                                ? (etfColorMap[range.color] || "bg-gray-100 text-gray-700") + " ring-1 ring-offset-1 ring-gray-300"
                                : "bg-gray-50"
                            }`}
                          >
                            <span className="font-medium w-24 shrink-0">{range.label}</span>
                            <span className="text-gray-500 w-16 shrink-0">
                              {range.min !== null ? `$${range.min}` : "<"}{range.min !== null && range.max !== null ? " \u2013 " : ""}{range.max !== null ? `$${range.max}` : "+"}
                            </span>
                            <span className="text-gray-600 flex-1">{range.meaning}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div>
                      <h4 className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Assets Affected</h4>
                      <div className="flex flex-wrap gap-1">
                        {etf.affectedAssets.map((asset, idx) => (
                          <span key={idx} className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{asset}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="card !p-3 text-xs text-gray-400">No barometer data available</div>
      )}
    </div>
  );
}
