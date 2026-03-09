import { Skeleton } from "@/components/Skeleton";
import { ChevronRight, Users } from "lucide-react";
import { congressRanges, insiderRanges } from "./constants";
import type { CongressData, InsiderData } from "./types";
import { formatSentimentLevel } from "./helpers";

interface SmartMoneyProps {
  congressData: CongressData | null;
  insiderData: InsiderData | null;
  expandedIds: Set<string>;
  toggleExpanded: (id: string) => void;
}

function getRangeLabel(value: number | null, ranges: typeof congressRanges) {
  if (value === null) return null;
  for (const r of ranges) {
    const above = r.min === null || value >= r.min;
    const below = r.max === null || value < r.max;
    if (above && below) return r.label;
  }
  return null;
}

function getRangeColor(label: string) {
  const map: Record<string, string> = {
    "Strongly Bearish": "bg-red-100 text-red-700",
    "Bearish": "bg-red-100 text-red-700",
    "Heavy Selling": "bg-red-100 text-red-700",
    "Net Selling": "bg-amber-100 text-amber-700",
    "Neutral": "bg-gray-100 text-gray-700",
    "Bullish": "bg-emerald-100 text-emerald-700",
    "Net Buying": "bg-emerald-100 text-emerald-700",
    "Strongly Bullish": "bg-emerald-100 text-emerald-700",
    "Heavy Buying": "bg-emerald-100 text-emerald-700",
  };
  return map[label] || "bg-gray-100 text-gray-700";
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
        <div>
          <button
            disabled={!congressData}
            onClick={() => congressData && toggleExpanded("smart-congress")}
            className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-gray-50 transition-colors disabled:hover:bg-transparent"
          >
            <ChevronRight className={`w-3 h-3 text-gray-400 transition-transform shrink-0 ${expandedIds.has("smart-congress") ? "rotate-90" : ""}`} />
            <span className="text-xs font-medium text-gray-900 flex-1 min-w-0 truncate">Congress Trading</span>
            {congressData ? (
              <>
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
              </>
            ) : (
              <>
                <Skeleton className="h-3 w-14" />
                <Skeleton className="h-4 w-14 rounded-full" />
              </>
            )}
          </button>
          {expandedIds.has("smart-congress") && congressData && (
              <div className="px-3 pb-3 pt-2 bg-gray-50/50 border-t border-gray-100">
                <p className="text-[10px] text-gray-500 mb-2">STOCK Act filings from US House &amp; Senate members. Tracks disclosed stock transactions over the last 90 days.</p>
                {congressData.totalTrades > 0 ? (
                  <div className="space-y-2">
                    <div className="bg-blue-50 rounded-lg p-2.5">
                      <h4 className="text-[10px] font-semibold text-blue-600 uppercase tracking-wide mb-1">Current Reading</h4>
                      <div className="flex items-center gap-3 text-[10px] text-gray-700 mb-0.5">
                        <span><strong>Buys:</strong> <span className="text-emerald-600">{congressData.buyCount}</span></span>
                        <span><strong>Sells:</strong> <span className="text-red-600">{congressData.sellCount}</span></span>
                        <span><strong>Buy/Sell Ratio:</strong> {congressData.ratio.toFixed(2)}</span>
                      </div>
                      {(() => {
                        const currentLabel = getRangeLabel(congressData.ratio, congressRanges);
                        const currentRange = congressRanges.find(r => r.label === currentLabel);
                        return currentRange ? (
                          <p className="text-[10px] text-gray-700"><strong>Market Impact:</strong> {currentRange.marketImpact}</p>
                        ) : null;
                      })()}
                    </div>
                    {congressData.topTickers.length > 0 && (
                      <div>
                        <h4 className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Most Traded</h4>
                        <div className="flex flex-wrap gap-1">
                          {congressData.topTickers.slice(0, 5).map((t) => (
                            <span key={t.ticker} className="text-[10px] bg-gray-100 px-1.5 py-0.5 rounded">{t.ticker} ({t.count})</span>
                          ))}
                        </div>
                      </div>
                    )}
                    <div className="bg-gray-50 rounded-lg p-2.5">
                      <h4 className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Why It Matters</h4>
                      <p className="text-[10px] text-gray-700">Members of Congress have access to non-public information through committee hearings, briefings, and legislation drafts. Studies show congressional trades have historically outperformed the market, making their trading patterns a useful signal.</p>
                    </div>
                    <div>
                      <h4 className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Interpretation Guide</h4>
                      <div className="space-y-1">
                        {congressRanges.map((range, idx) => {
                          const currentLabel = getRangeLabel(congressData.ratio, congressRanges);
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
                        {["Individual stocks (disclosed)", "Sector ETFs", "Defense/Healthcare (committee overlap)", "Policy-sensitive sectors"].map((asset, idx) => (
                          <span key={idx} className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{asset}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-[10px] text-gray-400">No Congress trades found in the last 90 days.</p>
                )}
              </div>
          )}
        </div>

        {/* Insider Row */}
        <div>
          <button
            disabled={!insiderData}
            onClick={() => insiderData && toggleExpanded("smart-insider")}
            className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-gray-50 transition-colors disabled:hover:bg-transparent"
          >
            <ChevronRight className={`w-3 h-3 text-gray-400 transition-transform shrink-0 ${expandedIds.has("smart-insider") ? "rotate-90" : ""}`} />
            <span className="text-xs font-medium text-gray-900 flex-1 min-w-0 truncate">Insider Trading</span>
            {insiderData ? (
              <>
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
              </>
            ) : (
              <>
                <Skeleton className="h-3 w-14" />
                <Skeleton className="h-4 w-14 rounded-full" />
              </>
            )}
          </button>
          {expandedIds.has("smart-insider") && insiderData && (
              <div className="px-3 pb-3 pt-2 bg-gray-50/50 border-t border-gray-100">
                <p className="text-[10px] text-gray-500 mb-2">SEC Form 4 filings from corporate insiders (officers, directors, 10%+ holders). Tracks disclosed stock transactions over the last 14 days.</p>
                {insiderData.totalTrades > 0 ? (
                  <div className="space-y-2">
                    <div className="bg-blue-50 rounded-lg p-2.5">
                      <h4 className="text-[10px] font-semibold text-blue-600 uppercase tracking-wide mb-1">Current Reading</h4>
                      <div className="flex items-center gap-3 text-[10px] text-gray-700 mb-0.5">
                        <span><strong>Buys:</strong> <span className="text-emerald-600">{insiderData.buyCount}</span> <span className="text-gray-400">(${(insiderData.buyValue / 1e6).toFixed(1)}M)</span></span>
                        <span><strong>Sells:</strong> <span className="text-red-600">{insiderData.sellCount}</span> <span className="text-gray-400">(${(insiderData.sellValue / 1e6).toFixed(1)}M)</span></span>
                      </div>
                      <p className="text-[10px] text-gray-700 mb-0.5"><strong>Buy/Sell Ratio:</strong> {insiderData.ratio.toFixed(2)}</p>
                      {(() => {
                        const currentLabel = getRangeLabel(insiderData.ratio, insiderRanges);
                        const currentRange = insiderRanges.find(r => r.label === currentLabel);
                        return currentRange ? (
                          <p className="text-[10px] text-gray-700"><strong>Market Impact:</strong> {currentRange.marketImpact}</p>
                        ) : null;
                      })()}
                    </div>
                    {insiderData.clusterBuys.length > 0 && (
                      <div>
                        <h4 className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Cluster Buying (multiple insiders)</h4>
                        <div className="flex flex-wrap gap-1">
                          {insiderData.clusterBuys.slice(0, 5).map((t) => (
                            <span key={t.ticker} className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded">{t.ticker} ({t.buys} buys)</span>
                          ))}
                        </div>
                      </div>
                    )}
                    <div className="bg-gray-50 rounded-lg p-2.5">
                      <h4 className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Why It Matters</h4>
                      <p className="text-[10px] text-gray-700">Corporate insiders know their companies best. Insider buying — especially &quot;cluster buying&quot; where multiple insiders buy simultaneously — is one of the most reliable bullish signals. Insider selling is weaker (may be tax/diversification), but heavy net selling can warn of trouble.</p>
                    </div>
                    <div>
                      <h4 className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Interpretation Guide</h4>
                      <div className="space-y-1">
                        {insiderRanges.map((range, idx) => {
                          const currentLabel = getRangeLabel(insiderData.ratio, insiderRanges);
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
                        {["Individual stocks (Form 4)", "Small/mid-caps (strongest signal)", "Sector sentiment", "Cluster buy targets"].map((asset, idx) => (
                          <span key={idx} className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{asset}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-[10px] text-gray-400">No insider trades found in the last 14 days.</p>
                )}
              </div>
          )}
        </div>
      </div>
    </div>
  );
}
