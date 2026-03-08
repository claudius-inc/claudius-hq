import { ChevronRight, Gauge } from "lucide-react";
import { vixRanges, putCallRanges, breadthRanges, termStructureRanges } from "./constants";
import type { SentimentData, BreadthData } from "./types";

interface SentimentProps {
  sentimentData: SentimentData | null;
  breadthData: BreadthData | null;
  expandedIds: Set<string>;
  toggleExpanded: (id: string) => void;
}

function getVixRangeLabel(value: number | null) {
  if (value === null) return null;
  for (const r of vixRanges) {
    const above = r.min === null || value >= r.min;
    const below = r.max === null || value < r.max;
    if (above && below) return r.label;
  }
  return null;
}

function getPutCallRangeLabel(value: number | null) {
  if (value === null) return null;
  for (const r of putCallRanges) {
    const above = r.min === null || value >= r.min;
    const below = r.max === null || value < r.max;
    if (above && below) return r.label;
  }
  return null;
}

function getBreadthRangeLabel(ratio: number | null) {
  if (ratio === null) return null;
  for (const r of breadthRanges) {
    const above = r.min === null || ratio >= r.min;
    const below = r.max === null || ratio < r.max;
    if (above && below) return r.label;
  }
  return null;
}

function getTermStructureLabel(value: number | null) {
  if (value === null) return null;
  for (const r of termStructureRanges) {
    const above = r.min === null || value >= r.min;
    const below = r.max === null || value < r.max;
    if (above && below) return r.label;
  }
  return null;
}

function getRangeColor(label: string) {
  const map: Record<string, string> = {
    "Low": "bg-emerald-100 text-emerald-700",
    "Moderate": "bg-blue-100 text-blue-700",
    "Elevated": "bg-amber-100 text-amber-700",
    "Fear": "bg-red-100 text-red-700",
    "Greedy": "bg-amber-100 text-amber-700",
    "Neutral": "bg-gray-100 text-gray-700",
    "Fearful": "bg-red-100 text-red-700",
    "Bearish": "bg-red-100 text-red-700",
    "Bullish": "bg-emerald-100 text-emerald-700",
    "Steep Contango": "bg-emerald-100 text-emerald-700",
    "Normal Contango": "bg-blue-100 text-blue-700",
    "Flat": "bg-gray-100 text-gray-700",
    "Backwardation": "bg-amber-100 text-amber-700",
    "Deep Backwardation": "bg-red-100 text-red-700",
  };
  return map[label] || "bg-gray-100 text-gray-700";
}

export function Sentiment({ sentimentData, breadthData, expandedIds, toggleExpanded }: SentimentProps) {
  return (
    <div>
      <h3 className="text-xs font-semibold text-gray-900 mb-1.5 flex items-center gap-1.5">
        <span className="flex items-center text-gray-400"><Gauge className="w-3.5 h-3.5" /></span>
        Market Sentiment
      </h3>
      <div className="card overflow-hidden !p-0 divide-y divide-gray-100">
        {/* VIX Row */}
        {sentimentData ? (
          <div>
            <button
              onClick={() => toggleExpanded("sentiment-vix")}
              className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-gray-50 transition-colors"
            >
              <ChevronRight className={`w-3 h-3 text-gray-400 transition-transform shrink-0 ${expandedIds.has("sentiment-vix") ? "rotate-90" : ""}`} />
              <span className="text-xs font-medium text-gray-900 flex-1 min-w-0 truncate">VIX (Fear Index)</span>
              <span className="text-xs font-bold tabular-nums text-gray-900 shrink-0">{sentimentData.vix.value?.toFixed(2) ?? "\u2014"}</span>
              {sentimentData.vix.level && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full shrink-0 ${
                  sentimentData.vix.level === "low" ? "bg-emerald-100 text-emerald-700" :
                  sentimentData.vix.level === "moderate" ? "bg-blue-100 text-blue-700" :
                  sentimentData.vix.level === "elevated" ? "bg-amber-100 text-amber-700" :
                  "bg-red-100 text-red-700"
                }`}>
                  {sentimentData.vix.level.charAt(0).toUpperCase() + sentimentData.vix.level.slice(1)}
                </span>
              )}
            </button>
            {expandedIds.has("sentiment-vix") && (
              <div className="px-3 pb-3 pt-2 bg-gray-50/50 border-t border-gray-100">
                <p className="text-[10px] text-gray-500 mb-2">The CBOE Volatility Index measures market expectations for near-term volatility. Higher values indicate greater fear in the market.</p>
                <div className="space-y-2">
                  {sentimentData.vix.value != null && (
                    <div className="bg-blue-50 rounded-lg p-2.5">
                      <h4 className="text-[10px] font-semibold text-blue-600 uppercase tracking-wide mb-1">Current Reading</h4>
                      <p className="text-[10px] text-gray-700 mb-0.5">
                        <strong>Value:</strong> {sentimentData.vix.value.toFixed(2)}
                        {sentimentData.vix.change != null && (
                          <span className={`ml-2 ${sentimentData.vix.change >= 0 ? "text-red-600" : "text-emerald-600"}`}>
                            ({sentimentData.vix.change >= 0 ? "+" : ""}{sentimentData.vix.change.toFixed(2)})
                          </span>
                        )}
                      </p>
                      {(() => {
                        const currentLabel = getVixRangeLabel(sentimentData.vix.value);
                        const currentRange = vixRanges.find(r => r.label === currentLabel);
                        return currentRange ? (
                          <p className="text-[10px] text-gray-700"><strong>Market Impact:</strong> {currentRange.marketImpact}</p>
                        ) : null;
                      })()}
                    </div>
                  )}
                  <div className="bg-gray-50 rounded-lg p-2.5">
                    <h4 className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Why It Matters</h4>
                    <p className="text-[10px] text-gray-700">VIX spikes during selloffs as demand for put options surges. Persistently low VIX can signal complacency. Mean-reverting by nature — extreme readings tend to reverse. Often called the &quot;fear gauge&quot; of Wall Street.</p>
                  </div>
                  <div>
                    <h4 className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Interpretation Guide</h4>
                    <div className="space-y-1">
                      {vixRanges.map((range, idx) => {
                        const currentLabel = getVixRangeLabel(sentimentData.vix.value);
                        return (
                          <div
                            key={idx}
                            className={`flex flex-wrap items-start gap-1 text-[10px] p-1 rounded ${
                              currentLabel === range.label
                                ? getRangeColor(range.label) + " ring-1 ring-offset-1 ring-gray-300"
                                : "bg-gray-50"
                            }`}
                          >
                            <span className="font-medium w-24 shrink-0">{range.label}</span>
                            <span className="text-gray-500 w-16 shrink-0 tabular-nums">
                              {range.min !== null ? range.min : "<"}{range.min !== null && range.max !== null ? " \u2013 " : ""}{range.max !== null ? range.max : "+"}
                            </span>
                            <span className="text-gray-600 flex-1">{range.meaning}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <div>
                    <h4 className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Assets Affected</h4>
                    <div className="flex flex-wrap gap-1">
                      {["S&P 500 (inverse)", "Options premiums", "Volatility ETFs (VXX, UVXY)", "Hedging costs"].map((asset, idx) => (
                        <span key={idx} className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{asset}</span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="px-3 py-2.5 text-xs text-gray-400">Loading VIX data...</div>
        )}

        {/* Put/Call Row */}
        {sentimentData ? (
          <div>
            <button
              onClick={() => toggleExpanded("sentiment-putcall")}
              className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-gray-50 transition-colors"
            >
              <ChevronRight className={`w-3 h-3 text-gray-400 transition-transform shrink-0 ${expandedIds.has("sentiment-putcall") ? "rotate-90" : ""}`} />
              <span className="text-xs font-medium text-gray-900 flex-1 min-w-0 truncate">Put/Call Ratio</span>
              <span className="text-xs font-bold tabular-nums text-gray-900 shrink-0">{sentimentData.putCall.value?.toFixed(2) ?? "\u2014"}</span>
              {sentimentData.putCall.level && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full shrink-0 ${
                  sentimentData.putCall.level === "greedy" ? "bg-amber-100 text-amber-700" :
                  sentimentData.putCall.level === "neutral" ? "bg-emerald-100 text-emerald-700" :
                  "bg-red-100 text-red-700"
                }`}>
                  {sentimentData.putCall.level.charAt(0).toUpperCase() + sentimentData.putCall.level.slice(1)}
                </span>
              )}
            </button>
            {expandedIds.has("sentiment-putcall") && (
              <div className="px-3 pb-3 pt-2 bg-gray-50/50 border-t border-gray-100">
                <p className="text-[10px] text-gray-500 mb-2">Ratio of put options to call options traded. A contrarian indicator — extreme readings often precede reversals.</p>
                <div className="space-y-2">
                  {sentimentData.putCall.value != null && (
                    <div className="bg-blue-50 rounded-lg p-2.5">
                      <h4 className="text-[10px] font-semibold text-blue-600 uppercase tracking-wide mb-1">Current Reading</h4>
                      <p className="text-[10px] text-gray-700 mb-0.5">
                        <strong>Value:</strong> {sentimentData.putCall.value.toFixed(2)}
                        <span className="text-gray-400 ml-2">(Source: {sentimentData.putCall.source})</span>
                      </p>
                      {(() => {
                        const currentLabel = getPutCallRangeLabel(sentimentData.putCall.value);
                        const currentRange = putCallRanges.find(r => r.label === currentLabel);
                        return currentRange ? (
                          <p className="text-[10px] text-gray-700"><strong>Market Impact:</strong> {currentRange.marketImpact}</p>
                        ) : null;
                      })()}
                    </div>
                  )}
                  <div className="bg-gray-50 rounded-lg p-2.5">
                    <h4 className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Why It Matters</h4>
                    <p className="text-[10px] text-gray-700">When everyone is buying puts (high ratio), fear is maximum — often near bottoms. When everyone is buying calls (low ratio), greed dominates — often near tops. Best used as a contrarian indicator at extremes.</p>
                  </div>
                  <div>
                    <h4 className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Interpretation Guide</h4>
                    <div className="space-y-1">
                      {putCallRanges.map((range, idx) => {
                        const currentLabel = getPutCallRangeLabel(sentimentData.putCall.value);
                        return (
                          <div
                            key={idx}
                            className={`flex flex-wrap items-start gap-1 text-[10px] p-1 rounded ${
                              currentLabel === range.label
                                ? getRangeColor(range.label) + " ring-1 ring-offset-1 ring-gray-300"
                                : "bg-gray-50"
                            }`}
                          >
                            <span className="font-medium w-24 shrink-0">{range.label}</span>
                            <span className="text-gray-500 w-16 shrink-0 tabular-nums">
                              {range.min !== null ? range.min : "<"}{range.min !== null && range.max !== null ? " \u2013 " : ""}{range.max !== null ? range.max : "+"}
                            </span>
                            <span className="text-gray-600 flex-1">{range.meaning}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <div>
                    <h4 className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Assets Affected</h4>
                    <div className="flex flex-wrap gap-1">
                      {["Options premiums", "S&P 500 (contrarian)", "Market reversals", "Hedging strategies"].map((asset, idx) => (
                        <span key={idx} className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{asset}</span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="px-3 py-2.5 text-xs text-gray-400">Loading put/call data...</div>
        )}

        {/* Breadth Row */}
        {breadthData ? (
          <div>
            <button
              onClick={() => toggleExpanded("sentiment-breadth")}
              className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-gray-50 transition-colors"
            >
              <ChevronRight className={`w-3 h-3 text-gray-400 transition-transform shrink-0 ${expandedIds.has("sentiment-breadth") ? "rotate-90" : ""}`} />
              <span className="text-xs font-medium text-gray-900 flex-1 min-w-0 truncate">Market Breadth</span>
              <span className="text-xs font-bold tabular-nums text-gray-900 shrink-0">
                {breadthData.advanceDecline.advances ?? "\u2014"} / {breadthData.advanceDecline.declines ?? "\u2014"}
              </span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full shrink-0 ${
                breadthData.level === "bullish" ? "bg-emerald-100 text-emerald-700" :
                breadthData.level === "bearish" ? "bg-red-100 text-red-700" :
                "bg-gray-100 text-gray-700"
              }`}>
                {breadthData.level.charAt(0).toUpperCase() + breadthData.level.slice(1)}
              </span>
            </button>
            {expandedIds.has("sentiment-breadth") && (
              <div className="px-3 pb-3 pt-2 bg-gray-50/50 border-t border-gray-100">
                <p className="text-[10px] text-gray-500 mb-2">Advance/decline ratio measures how many stocks are participating in a move. Healthy rallies are broad-based; narrow rallies are fragile.</p>
                <div className="space-y-2">
                  <div className="bg-blue-50 rounded-lg p-2.5">
                    <h4 className="text-[10px] font-semibold text-blue-600 uppercase tracking-wide mb-1">Current Reading</h4>
                    <div className="flex items-center gap-3 text-[10px] text-gray-700 mb-0.5">
                      <span><strong>A/D Ratio:</strong> {breadthData.advanceDecline.ratio?.toFixed(2) ?? "\u2014"}</span>
                      <span><strong>Net:</strong> {breadthData.advanceDecline.netAdvances ?? "\u2014"}</span>
                    </div>
                    <div className="flex items-center gap-3 text-[10px] text-gray-700 mb-0.5">
                      <span><strong>New Highs:</strong> <span className="text-emerald-600">{breadthData.newHighsLows?.newHighs ?? "\u2014"}</span></span>
                      <span><strong>New Lows:</strong> <span className="text-red-600">{breadthData.newHighsLows?.newLows ?? "\u2014"}</span></span>
                    </div>
                    {breadthData.mcclellan?.oscillator != null && (
                      <p className="text-[10px] text-gray-700">
                        <strong>McClellan Oscillator:</strong>{" "}
                        <span className={breadthData.mcclellan.oscillator > 0 ? "text-emerald-600" : "text-red-600"}>
                          {breadthData.mcclellan.oscillator.toFixed(1)}
                        </span>
                      </p>
                    )}
                    {(() => {
                      const currentLabel = getBreadthRangeLabel(breadthData.advanceDecline.ratio);
                      const currentRange = breadthRanges.find(r => r.label === currentLabel);
                      return currentRange ? (
                        <p className="text-[10px] text-gray-700 mt-0.5"><strong>Market Impact:</strong> {currentRange.marketImpact}</p>
                      ) : null;
                    })()}
                  </div>
                  <div className="bg-gray-50 rounded-lg p-2.5">
                    <h4 className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Why It Matters</h4>
                    <p className="text-[10px] text-gray-700">When an index rises but breadth narrows (fewer stocks participating), the rally is likely to fail. Broad participation confirms trend strength. Divergences between price and breadth are powerful warning signals.</p>
                  </div>
                  <div>
                    <h4 className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Interpretation Guide</h4>
                    <div className="space-y-1">
                      {breadthRanges.map((range, idx) => {
                        const currentLabel = getBreadthRangeLabel(breadthData.advanceDecline.ratio);
                        return (
                          <div
                            key={idx}
                            className={`flex flex-wrap items-start gap-1 text-[10px] p-1 rounded ${
                              currentLabel === range.label
                                ? getRangeColor(range.label) + " ring-1 ring-offset-1 ring-gray-300"
                                : "bg-gray-50"
                            }`}
                          >
                            <span className="font-medium w-24 shrink-0">{range.label}</span>
                            <span className="text-gray-500 w-16 shrink-0 tabular-nums">
                              {range.min !== null ? range.min : "<"}{range.min !== null && range.max !== null ? " \u2013 " : ""}{range.max !== null ? range.max : "+"}
                            </span>
                            <span className="text-gray-600 flex-1">{range.meaning}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <div>
                    <h4 className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Assets Affected</h4>
                    <div className="flex flex-wrap gap-1">
                      {["Small caps (IWM)", "Broad indices (SPY, QQQ)", "Cyclical sectors", "Defensive rotation"].map((asset, idx) => (
                        <span key={idx} className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{asset}</span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="px-3 py-2.5 text-xs text-gray-400">Loading breadth data...</div>
        )}

        {/* VIX Term Structure Row */}
        {sentimentData?.volatilityContext && (
          <div>
            <button
              onClick={() => toggleExpanded("sentiment-termstructure")}
              className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-gray-50 transition-colors"
            >
              <ChevronRight className={`w-3 h-3 text-gray-400 transition-transform shrink-0 ${expandedIds.has("sentiment-termstructure") ? "rotate-90" : ""}`} />
              <span className="text-xs font-medium text-gray-900 flex-1 min-w-0 truncate">VIX Term Structure</span>
              <span className="text-xs font-bold tabular-nums text-gray-900 shrink-0">{sentimentData.volatilityContext.termStructure.toFixed(2)}x</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full shrink-0 ${
                sentimentData.volatilityContext.contango === "backwardation" ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"
              }`}>
                {sentimentData.volatilityContext.contango.charAt(0).toUpperCase() + sentimentData.volatilityContext.contango.slice(1)}
              </span>
            </button>
            {expandedIds.has("sentiment-termstructure") && (
              <div className="px-3 pb-3 pt-2 bg-gray-50/50 border-t border-gray-100">
                <p className="text-[10px] text-gray-500 mb-2">Ratio of VIX (1-month) to VIX3M (3-month). Normally below 1.0 (contango). Inversion signals acute near-term fear.</p>
                <div className="space-y-2">
                  <div className="bg-blue-50 rounded-lg p-2.5">
                    <h4 className="text-[10px] font-semibold text-blue-600 uppercase tracking-wide mb-1">Current Reading</h4>
                    <p className="text-[10px] text-gray-700 mb-0.5">
                      <strong>VIX/VIX3M:</strong> {sentimentData.volatilityContext.termStructure.toFixed(2)}x
                      <span className="text-gray-400 ml-2">({sentimentData.volatilityContext.contango})</span>
                    </p>
                    {(() => {
                      const currentLabel = getTermStructureLabel(sentimentData.volatilityContext.termStructure);
                      const currentRange = termStructureRanges.find(r => r.label === currentLabel);
                      return currentRange ? (
                        <p className="text-[10px] text-gray-700"><strong>Market Impact:</strong> {currentRange.marketImpact}</p>
                      ) : null;
                    })()}
                  </div>
                  <div className="bg-gray-50 rounded-lg p-2.5">
                    <h4 className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Why It Matters</h4>
                    <p className="text-[10px] text-gray-700">The VIX term structure reveals whether fear is concentrated in the short term or spread across time. Backwardation (VIX &gt; VIX3M) is rare and signals acute stress — but historically marks buying opportunities. Steep contango signals excessive complacency.</p>
                  </div>
                  <div>
                    <h4 className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Interpretation Guide</h4>
                    <div className="space-y-1">
                      {termStructureRanges.map((range, idx) => {
                        const currentLabel = getTermStructureLabel(sentimentData.volatilityContext!.termStructure);
                        return (
                          <div
                            key={idx}
                            className={`flex flex-wrap items-start gap-1 text-[10px] p-1 rounded ${
                              currentLabel === range.label
                                ? getRangeColor(range.label) + " ring-1 ring-offset-1 ring-gray-300"
                                : "bg-gray-50"
                            }`}
                          >
                            <span className="font-medium w-28 shrink-0">{range.label}</span>
                            <span className="text-gray-500 w-16 shrink-0 tabular-nums">
                              {range.min !== null ? range.min : "<"}{range.min !== null && range.max !== null ? " \u2013 " : ""}{range.max !== null ? range.max : "+"}
                            </span>
                            <span className="text-gray-600 flex-1">{range.meaning}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <div>
                    <h4 className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Assets Affected</h4>
                    <div className="flex flex-wrap gap-1">
                      {["Volatility ETFs (VXX, SVXY)", "Options strategies", "Risk parity portfolios", "Tail hedges"].map((asset, idx) => (
                        <span key={idx} className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{asset}</span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
