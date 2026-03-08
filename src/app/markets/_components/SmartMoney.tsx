import { ChevronRight, Users } from "lucide-react";
import type { CongressData, InsiderData } from "./types";
import { formatSentimentLevel } from "./helpers";

interface SmartMoneyProps {
  congressData: CongressData | null;
  insiderData: InsiderData | null;
  expandedIds: Set<string>;
  toggleExpanded: (id: string) => void;
}

export function SmartMoney({ congressData, insiderData, expandedIds, toggleExpanded }: SmartMoneyProps) {
  return (
    <div>
      <h3 className="text-xs font-semibold text-gray-900 mb-1.5 flex items-center gap-1.5">
        <span className="flex items-center text-gray-400"><Users className="w-3.5 h-3.5" /></span>
        Smart Money Signals
      </h3>
      <div className="card overflow-hidden !p-0 divide-y divide-gray-100">
        {/* Congress Row */}
        {congressData ? (
          <div>
            <button
              onClick={() => toggleExpanded("smart-congress")}
              className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-gray-50 transition-colors"
            >
              <ChevronRight className={`w-3 h-3 text-gray-400 transition-transform shrink-0 ${expandedIds.has("smart-congress") ? "rotate-90" : ""}`} />
              <span className="text-xs font-medium text-gray-900 flex-1 min-w-0 truncate">Congress Trading</span>
              <span className="text-xs font-bold tabular-nums text-gray-900 shrink-0">
                {congressData.totalTrades > 0 ? `${congressData.ratio.toFixed(1)}x B/S` : "No data"}
              </span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full shrink-0 ${
                congressData.totalTrades === 0 ? "bg-gray-100 text-gray-700" :
                congressData.level === "bullish" ? "bg-emerald-100 text-emerald-700" :
                congressData.level === "bearish" ? "bg-red-100 text-red-700" :
                "bg-gray-100 text-gray-700"
              }`}>
                {congressData.totalTrades === 0 ? "No Data" : formatSentimentLevel(congressData.level)}
              </span>
            </button>
            {expandedIds.has("smart-congress") && (
              <div className="px-3 pb-3 pt-2 bg-gray-50/50 border-t border-gray-100">
                {congressData.totalTrades > 0 ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-4 text-xs">
                      <div><span className="text-gray-500">Buys: </span><span className="font-medium text-emerald-600">{congressData.buyCount}</span></div>
                      <div><span className="text-gray-500">Sells: </span><span className="font-medium text-red-600">{congressData.sellCount}</span></div>
                      <div><span className="text-gray-500">Ratio: </span><span className="font-medium">{congressData.ratio.toFixed(2)}</span></div>
                    </div>
                    {congressData.topTickers.length > 0 && (
                      <div>
                        <span className="text-[10px] text-gray-500">Most Traded</span>
                        <div className="flex flex-wrap gap-1 mt-0.5">
                          {congressData.topTickers.slice(0, 5).map((t) => (
                            <span key={t.ticker} className="text-[10px] bg-gray-100 px-1.5 py-0.5 rounded">{t.ticker} ({t.count})</span>
                          ))}
                        </div>
                      </div>
                    )}
                    <p className="text-[10px] text-gray-400">STOCK Act filings from House &amp; Senate (last 90 days)</p>
                  </div>
                ) : (
                  <p className="text-xs text-gray-400">No Congress trades found in the last 90 days.</p>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="px-3 py-2.5 text-xs text-gray-400">Loading Congress trading data...</div>
        )}

        {/* Insider Row */}
        {insiderData ? (
          <div>
            <button
              onClick={() => toggleExpanded("smart-insider")}
              className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-gray-50 transition-colors"
            >
              <ChevronRight className={`w-3 h-3 text-gray-400 transition-transform shrink-0 ${expandedIds.has("smart-insider") ? "rotate-90" : ""}`} />
              <span className="text-xs font-medium text-gray-900 flex-1 min-w-0 truncate">Insider Trading</span>
              <span className="text-xs font-bold tabular-nums text-gray-900 shrink-0">
                {insiderData.totalTrades > 0 ? `${insiderData.ratio.toFixed(1)}x B/S` : "No data"}
              </span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full shrink-0 ${
                insiderData.totalTrades === 0 ? "bg-gray-100 text-gray-700" :
                insiderData.level === "bullish" ? "bg-emerald-100 text-emerald-700" :
                insiderData.level === "bearish" ? "bg-red-100 text-red-700" :
                "bg-gray-100 text-gray-700"
              }`}>
                {insiderData.totalTrades === 0 ? "No Data" : formatSentimentLevel(insiderData.level)}
              </span>
            </button>
            {expandedIds.has("smart-insider") && (
              <div className="px-3 pb-3 pt-2 bg-gray-50/50 border-t border-gray-100">
                {insiderData.totalTrades > 0 ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-4 text-xs">
                      <div>
                        <span className="text-gray-500">Buys: </span>
                        <span className="font-medium text-emerald-600">{insiderData.buyCount}</span>
                        <span className="text-[10px] text-gray-400 ml-1">(${(insiderData.buyValue / 1e6).toFixed(1)}M)</span>
                      </div>
                      <div>
                        <span className="text-gray-500">Sells: </span>
                        <span className="font-medium text-red-600">{insiderData.sellCount}</span>
                        <span className="text-[10px] text-gray-400 ml-1">(${(insiderData.sellValue / 1e6).toFixed(1)}M)</span>
                      </div>
                      <div><span className="text-gray-500">Ratio: </span><span className="font-medium">{insiderData.ratio.toFixed(2)}</span></div>
                    </div>
                    {insiderData.clusterBuys.length > 0 && (
                      <div>
                        <span className="text-[10px] text-gray-500">Cluster Buying (multiple insiders)</span>
                        <div className="flex flex-wrap gap-1 mt-0.5">
                          {insiderData.clusterBuys.slice(0, 5).map((t) => (
                            <span key={t.ticker} className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded">{t.ticker} ({t.buys} buys)</span>
                          ))}
                        </div>
                      </div>
                    )}
                    <p className="text-[10px] text-gray-400">SEC Form 4 filings (last 14 days)</p>
                  </div>
                ) : (
                  <p className="text-xs text-gray-400">No insider trades found in the last 14 days.</p>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="px-3 py-2.5 text-xs text-gray-400">Loading insider trading data...</div>
        )}
      </div>
    </div>
  );
}
