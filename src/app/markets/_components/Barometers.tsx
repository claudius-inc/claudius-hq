import { Skeleton } from "@/components/Skeleton";
import { ChevronRight, BarChart3 } from "lucide-react";
import { etfColorMap } from "./constants";
import type { MarketEtf } from "./types";
import type { ExpectedReturnsResponse, ConfidenceLevel } from "@/lib/valuation/types";

interface BarometersProps {
  marketEtfs: MarketEtf[];
  loading: boolean;
  expandedIds: Set<string>;
  toggleExpanded: (id: string) => void;
  expectedReturns?: ExpectedReturnsResponse | null;
}

const BAROMETER_NAMES = [
  { ticker: "SPY", name: "SPY (S&P 500)" },
  { ticker: "ITA", name: "ITA (Aerospace & Defense)" },
];

const SPY_PE_RANGES: { label: string; peRange: string; min: number; max: number; expectedReturn: number; confidence: ConfidenceLevel }[] = [
  { label: "Very Cheap", peRange: "< 10", min: 0, max: 10, expectedReturn: 11, confidence: "high" },
  { label: "Cheap", peRange: "10 \u2013 15", min: 10, max: 15, expectedReturn: 9, confidence: "high" },
  { label: "Fair", peRange: "15 \u2013 20", min: 15, max: 20, expectedReturn: 6, confidence: "medium" },
  { label: "Fair", peRange: "20 \u2013 25", min: 20, max: 25, expectedReturn: 3, confidence: "medium" },
  { label: "Rich", peRange: "25 \u2013 30", min: 25, max: 30, expectedReturn: 1, confidence: "medium" },
  { label: "Rich", peRange: "30 \u2013 35", min: 30, max: 35, expectedReturn: 0, confidence: "low" },
  { label: "Expensive", peRange: "35+", min: 35, max: 999, expectedReturn: -1, confidence: "low" },
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

function ConfidenceDots({ level }: { level: ConfidenceLevel }) {
  const filled = level === "high" ? 3 : level === "medium" ? 2 : 1;
  return (
    <span className="inline-flex gap-[2px] ml-0.5">
      {[1, 2, 3].map((i) => (
        <span key={i} className={`inline-block w-[3px] h-[3px] rounded-full ${i <= filled ? "bg-gray-500" : "bg-gray-200"}`} />
      ))}
    </span>
  );
}

export function Barometers({ marketEtfs, loading, expandedIds, toggleExpanded, expectedReturns }: BarometersProps) {
  const spyValuation = expectedReturns?.assets.find((a) => a.symbol === "SPY");

  return (
    <div>
      <h3 className="text-xs font-semibold text-gray-900 mb-1.5 flex items-center gap-1.5">
        <span className="flex items-center text-gray-400"><BarChart3 className="w-3.5 h-3.5" /></span>
        Market Barometers
      </h3>
      {loading ? (
        <div className="card overflow-hidden !p-0 divide-y divide-gray-100 min-h-[74px]">
          {BAROMETER_NAMES.map(({ ticker, name }) => (
            <div key={ticker} className="px-3 py-2.5 flex items-center gap-3">
              <ChevronRight className="w-3 h-3 text-gray-400 shrink-0" />
              <span className="text-xs font-medium text-gray-900 flex-1 min-w-0 truncate">{name}</span>
              <Skeleton className="h-3 w-14 !bg-gray-100" />
              <Skeleton className="h-4 w-14 rounded-full !bg-gray-100" />
            </div>
          ))}
        </div>
      ) : (
        <div className="card overflow-hidden !p-0 divide-y divide-gray-100 min-h-[74px]">
          {/* SPY row — from valuation data */}
          {spyValuation && (() => {
            const spyId = "spy-valuation";
            const currentPe = spyValuation.valuation.value;
            return (
              <div>
                <button
                  onClick={() => toggleExpanded(spyId)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-gray-50 transition-colors"
                >
                  <ChevronRight className={`w-3 h-3 text-gray-400 transition-transform shrink-0 ${expandedIds.has(spyId) ? "rotate-90" : ""}`} />
                  <span className="text-xs font-semibold text-gray-900 flex-1 min-w-0 truncate">S&P 500</span>
                  <span className="text-xs font-bold tabular-nums text-gray-900 shrink-0">
                    {new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(spyValuation.price)}
                  </span>
                  {spyValuation.changePercent != null && (
                    <span className={`text-[10px] tabular-nums shrink-0 ${spyValuation.changePercent >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                      {spyValuation.changePercent >= 0 ? "+" : ""}{spyValuation.changePercent.toFixed(2)}%
                    </span>
                  )}
                  <ValuationZone zone={spyValuation.valuation.zone} />
                  {spyValuation.tactical.bias !== "neutral" && <TacticalBias bias={spyValuation.tactical.bias} />}
                </button>
                {expandedIds.has(spyId) && (
                  <div className="px-3 pb-3 pt-2 bg-gray-50/50 border-t border-gray-100">
                    <div className="flex items-center gap-2 text-[10px] mb-2">
                      <span className="text-gray-500">Trailing PE:</span>
                      <span className="font-bold text-gray-700 font-mono">{currentPe?.toFixed(1) ?? "\u2014"}</span>
                      <span className="text-gray-400">({spyValuation.valuation.percentile}th percentile)</span>
                    </div>
                    <div className="mb-2.5">
                      <h4 className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Interpretation Guide</h4>
                      <div className="space-y-1">
                        {SPY_PE_RANGES.map((range, idx) => {
                          const isActive = currentPe !== null && currentPe !== undefined && currentPe >= range.min && currentPe < range.max;
                          return (
                            <div
                              key={idx}
                              className={`flex flex-wrap items-start gap-1 text-[10px] p-1 rounded ${
                                isActive
                                  ? "bg-blue-50 text-blue-700 ring-1 ring-offset-1 ring-gray-300"
                                  : "bg-gray-50"
                              }`}
                            >
                              <span className="font-medium w-16 shrink-0">{range.label}</span>
                              <span className="text-gray-500 w-20 shrink-0 font-mono">{range.peRange}</span>
                              <span className={`font-bold w-12 shrink-0 ${range.expectedReturn > 0 ? "text-emerald-600" : range.expectedReturn < 0 ? "text-red-600" : "text-gray-500"}`}>
                                {range.expectedReturn > 0 ? "+" : ""}{range.expectedReturn}%
                              </span>
                              <ConfidenceDots level={range.confidence} />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                    <p className="text-[9px] text-gray-400">Based on Shiller CAPE historical backtests. Returns are 10-year annualized real.</p>
                  </div>
                )}
              </div>
            );
          })()}

          {/* ETF rows (TLT, ITA) */}
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
                    <p className="text-[10px] text-gray-500 mb-2">{etf.description}</p>
                    {etf.data && (
                      <div className="mb-2">
                        <div className="flex items-center gap-2 text-[10px] mb-1.5">
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
                      <p className="text-[10px] text-gray-700">{etf.whyItMatters}</p>
                    </div>
                    {etf.interpretation && (
                      <div className="bg-blue-50 rounded-lg p-2.5 mb-2.5">
                        <h4 className="text-[10px] font-semibold text-blue-600 uppercase tracking-wide mb-1">Current Reading</h4>
                        <p className="text-[10px] text-gray-700">{etf.interpretation.meaning}</p>
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
      )}
    </div>
  );
}
