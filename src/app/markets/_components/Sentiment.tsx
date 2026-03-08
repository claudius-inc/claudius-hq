import { ChevronRight, Gauge } from "lucide-react";
import type { SentimentData, BreadthData } from "./types";

interface SentimentProps {
  sentimentData: SentimentData | null;
  breadthData: BreadthData | null;
  expandedIds: Set<string>;
  toggleExpanded: (id: string) => void;
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
                {sentimentData.vix.change != null && (
                  <div className="flex items-center gap-2 text-xs mb-2">
                    <span className="text-gray-500">Change:</span>
                    <span className={`font-medium ${sentimentData.vix.change >= 0 ? "text-red-600" : "text-emerald-600"}`}>
                      {sentimentData.vix.change >= 0 ? "+" : ""}{sentimentData.vix.change.toFixed(2)}
                    </span>
                  </div>
                )}
                <p className="text-[10px] text-gray-500">The CBOE Volatility Index measures market expectations for near-term volatility. Higher values indicate greater fear in the market.</p>
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
                {sentimentData.putCall.source && <p className="text-[10px] text-gray-400 mb-1">Source: {sentimentData.putCall.source}</p>}
                <p className="text-[10px] text-gray-500">Ratio of put options to call options. Values above 1.0 indicate bearish sentiment (more puts), below 0.7 indicates greed (more calls).</p>
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
                <div className="space-y-2">
                  <div className="flex items-center gap-3 text-xs">
                    <span className="text-gray-500">A/D Ratio:</span>
                    <span className="font-medium">{breadthData.advanceDecline.ratio?.toFixed(2) ?? "\u2014"}</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    <span className="text-gray-500">New Highs / Lows:</span>
                    <span className="font-medium text-emerald-600">{breadthData.newHighsLows?.newHighs ?? "\u2014"}</span>
                    <span className="text-gray-400">/</span>
                    <span className="font-medium text-red-600">{breadthData.newHighsLows?.newLows ?? "\u2014"}</span>
                  </div>
                  {breadthData.mcclellan?.oscillator != null && (
                    <div className="flex items-center gap-3 text-xs">
                      <span className="text-gray-500">McClellan:</span>
                      <span className={`font-medium ${(breadthData.mcclellan?.oscillator ?? 0) > 0 ? "text-emerald-600" : "text-red-600"}`}>
                        {breadthData.mcclellan?.oscillator?.toFixed(1) ?? "\u2014"}
                      </span>
                    </div>
                  )}
                  <p className="text-[10px] text-gray-500">{breadthData.interpretation}</p>
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
                <p className="text-[10px] text-gray-500">{sentimentData.volatilityContext.interpretation}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
