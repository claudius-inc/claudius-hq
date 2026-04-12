import { useState } from "react";
import { Skeleton } from "@/components/Skeleton";
import { ChevronRight, Gauge } from "lucide-react";
// Gauge kept for section icon — no composite bar
import { vixRanges, putCallRanges, breadthRanges, termStructureRanges } from "./constants";
import { RefreshIndicator } from "@/components/ui/RefreshIndicator";
import type { SentimentData, BreadthData } from "./types";

interface MarketMoodProps {
  sentimentData: SentimentData | null;
  breadthData: BreadthData | null;
  expandedIds: Set<string>;
  toggleExpanded: (id: string) => void;
  /** True when any underlying SWR source is currently revalidating. */
  refreshing?: boolean;
}

function getRangeLabel(value: number | null, ranges: Array<{ label: string; min: number | null; max: number | null }>) {
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

function getVixBadge(level: string | null) {
  if (!level) return null;
  const text = level.charAt(0).toUpperCase() + level.slice(1);
  const color = level === "low" ? "bg-emerald-100 text-emerald-700"
    : level === "moderate" ? "bg-blue-100 text-blue-700"
    : level === "elevated" ? "bg-amber-100 text-amber-700"
    : "bg-red-100 text-red-700";
  return { text, color };
}

function getPutCallBadge(level: string | null) {
  if (!level) return null;
  const text = level.charAt(0).toUpperCase() + level.slice(1);
  const color = level === "greedy" ? "bg-amber-100 text-amber-700"
    : level === "neutral" ? "bg-gray-100 text-gray-700"
    : "bg-red-100 text-red-700";
  return { text, color };
}

function getBreadthBadge(level: "bullish" | "neutral" | "bearish") {
  const text = level.charAt(0).toUpperCase() + level.slice(1);
  const color = level === "bullish" ? "bg-emerald-100 text-emerald-700"
    : level === "bearish" ? "bg-red-100 text-red-700"
    : "bg-gray-100 text-gray-700";
  return { text, color };
}

export function MarketMood({
  sentimentData,
  breadthData,
  expandedIds,
  toggleExpanded,
  refreshing = false,
}: MarketMoodProps) {
  return (
    <div>
      <h3 className="text-xs font-semibold text-gray-900 mb-1.5 flex items-center gap-1.5">
        <span className="flex items-center text-gray-400"><Gauge className="w-3.5 h-3.5" /></span>
        Market Mood
        <RefreshIndicator active={refreshing} />
      </h3>

      <div className="card overflow-hidden !p-0">
        {/* All sections visible — no tabs, no composite bar */}
        <div className="divide-y divide-gray-100">
          {/* ── VOLATILITY ────────────────────────────── */}
          <div className="px-3 py-1 bg-gray-50/60">
            <span className="text-[9px] font-semibold text-gray-400 uppercase tracking-wider">Volatility</span>
          </div>

          {/* VIX Row */}
          <ExpandableRow
            id="mood-vix"
            label="VIX (Fear Index)"
            value={sentimentData?.vix.value?.toFixed(2) ?? null}
            badge={getVixBadge(sentimentData?.vix.level ?? null)}
            loading={!sentimentData}
            expandedIds={expandedIds}
            toggleExpanded={toggleExpanded}
          >
            {sentimentData && (
              <ExpandedContent
                description="The CBOE Volatility Index measures market expectations for near-term volatility. Higher values indicate greater fear."
                currentReading={
                  sentimentData.vix.value != null ? (
                    <p className="text-[10px] text-gray-700 mb-0.5">
                      <strong>Value:</strong> {sentimentData.vix.value.toFixed(2)}
                      {sentimentData.vix.change != null && (
                        <span className={`ml-2 ${sentimentData.vix.change >= 0 ? "text-red-600" : "text-emerald-600"}`}>
                          ({sentimentData.vix.change >= 0 ? "+" : ""}{sentimentData.vix.change.toFixed(2)})
                        </span>
                      )}
                    </p>
                  ) : null
                }
                marketImpact={(() => {
                  const label = getRangeLabel(sentimentData.vix.value, vixRanges);
                  return vixRanges.find(r => r.label === label)?.marketImpact ?? null;
                })()}
                whyItMatters="VIX spikes during selloffs as demand for put options surges. Persistently low VIX can signal complacency. Mean-reverting by nature."
                ranges={vixRanges}
                currentValue={sentimentData.vix.value}
                assets={["S&P 500 (inverse)", "Options premiums", "Volatility ETFs (VXX, UVXY)", "Hedging costs"]}
              />
            )}
          </ExpandableRow>

          {/* VIX Term Structure Row — always visible under VIX */}
          {sentimentData?.volatilityContext && (
            <ExpandableRow
              id="mood-termstructure"
              label="Term Structure"
              value={`${sentimentData.volatilityContext.termStructure.toFixed(2)}x`}
              badge={{
                text: sentimentData.volatilityContext.contango.charAt(0).toUpperCase() + sentimentData.volatilityContext.contango.slice(1),
                color: sentimentData.volatilityContext.contango === "backwardation" ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700",
              }}
              loading={false}
              expandedIds={expandedIds}
              toggleExpanded={toggleExpanded}
            >
              <ExpandedContent
                description="Ratio of VIX (1-month) to VIX3M (3-month). Normally below 1.0 (contango). Inversion signals acute near-term fear."
                currentReading={
                  <p className="text-[10px] text-gray-700 mb-0.5">
                    <strong>VIX/VIX3M:</strong> {sentimentData.volatilityContext.termStructure.toFixed(2)}x
                    <span className="text-gray-400 ml-2">({sentimentData.volatilityContext.contango})</span>
                  </p>
                }
                marketImpact={(() => {
                  const label = getRangeLabel(sentimentData.volatilityContext!.termStructure, termStructureRanges);
                  return termStructureRanges.find(r => r.label === label)?.marketImpact ?? null;
                })()}
                whyItMatters="Backwardation (VIX > VIX3M) is rare and signals acute stress — but historically marks buying opportunities. Steep contango signals excessive complacency."
                ranges={termStructureRanges}
                currentValue={sentimentData.volatilityContext.termStructure}
                labelWidth="w-28"
                assets={["Volatility ETFs (VXX, SVXY)", "Options strategies", "Risk parity portfolios", "Tail hedges"]}
              />
            </ExpandableRow>
          )}

          {/* ── SENTIMENT ────────────────────────────── */}
          <div className="px-3 py-1 bg-gray-50/60">
            <span className="text-[9px] font-semibold text-gray-400 uppercase tracking-wider">Sentiment</span>
          </div>

          {/* Put/Call Row */}
          <ExpandableRow
            id="mood-putcall"
            label="Put/Call Ratio"
            value={sentimentData?.putCall.value?.toFixed(2) ?? null}
            badge={getPutCallBadge(sentimentData?.putCall.level ?? null)}
            loading={!sentimentData}
            expandedIds={expandedIds}
            toggleExpanded={toggleExpanded}
          >
            {sentimentData && (
              <ExpandedContent
                description="Ratio of put options to call options traded. A contrarian indicator — extreme readings often precede reversals."
                currentReading={
                  sentimentData.putCall.value != null ? (
                    <p className="text-[10px] text-gray-700 mb-0.5">
                      <strong>Value:</strong> {sentimentData.putCall.value.toFixed(2)}
                      <span className="text-gray-400 ml-2">(Source: {sentimentData.putCall.source})</span>
                    </p>
                  ) : null
                }
                marketImpact={(() => {
                  const label = getRangeLabel(sentimentData.putCall.value, putCallRanges);
                  return putCallRanges.find(r => r.label === label)?.marketImpact ?? null;
                })()}
                whyItMatters="When everyone is buying puts (high ratio), fear is maximum — often near bottoms. When everyone is buying calls (low ratio), greed dominates — often near tops."
                ranges={putCallRanges}
                currentValue={sentimentData.putCall.value}
                assets={["Options premiums", "S&P 500 (contrarian)", "Market reversals", "Hedging strategies"]}
              />
            )}
          </ExpandableRow>

          {/* ── BREADTH ────────────────────────────── */}
          <div className="px-3 py-1 bg-gray-50/60">
            <span className="text-[9px] font-semibold text-gray-400 uppercase tracking-wider">Breadth</span>
          </div>

          {/* Market Breadth Row */}
          <ExpandableRow
            id="mood-breadth"
            label="Advance / Decline"
            value={breadthData?.advanceDecline.ratio?.toFixed(2) ?? null}
            badge={breadthData ? getBreadthBadge(breadthData.level) : null}
            loading={!breadthData}
            expandedIds={expandedIds}
            toggleExpanded={toggleExpanded}
          >
            {breadthData && (
              <ExpandedContent
                description="Advance/decline ratio measures how many stocks participate in a move. Healthy rallies are broad-based; narrow rallies are fragile."
                currentReading={
                  <div>
                    <div className="flex items-center gap-3 text-[10px] text-gray-700 mb-0.5">
                      <span><strong>A/D Ratio:</strong> {breadthData.advanceDecline.ratio?.toFixed(2) ?? "\u2014"}</span>
                      <span><strong>Net:</strong> {breadthData.advanceDecline.netAdvances ?? "\u2014"}</span>
                    </div>
                    <div className="flex items-center gap-3 text-[10px] text-gray-700 mb-0.5">
                      <span><strong>Advances:</strong> <span className="text-emerald-600">{breadthData.advanceDecline.advances ?? "\u2014"}</span></span>
                      <span><strong>Declines:</strong> <span className="text-red-600">{breadthData.advanceDecline.declines ?? "\u2014"}</span></span>
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
                  </div>
                }
                marketImpact={(() => {
                  const label = getRangeLabel(breadthData.advanceDecline.ratio, breadthRanges);
                  return breadthRanges.find(r => r.label === label)?.marketImpact ?? null;
                })()}
                whyItMatters="When an index rises but breadth narrows, the rally is likely to fail. Broad participation confirms trend strength. Divergences between price and breadth are powerful warning signals."
                ranges={breadthRanges}
                currentValue={breadthData.advanceDecline.ratio}
                assets={["Small caps (IWM)", "Broad indices (SPY, QQQ)", "Cyclical sectors", "Defensive rotation"]}
              />
            )}
          </ExpandableRow>

          {/* Breadth sub-metrics: Advances/Declines count + New Highs/Lows — always visible */}
          {breadthData && (
            <div className="flex items-center gap-4 px-3 py-1.5 text-[10px] text-gray-500 bg-white">
              {breadthData.advanceDecline.advances != null && breadthData.advanceDecline.declines != null && (
                <span>
                  <span className="text-emerald-600 font-medium">{breadthData.advanceDecline.advances.toLocaleString()}</span>
                  {" / "}
                  <span className="text-red-600 font-medium">{breadthData.advanceDecline.declines.toLocaleString()}</span>
                  <span className="ml-1 text-gray-400">adv/dec</span>
                </span>
              )}
              {breadthData.newHighsLows?.newHighs != null && breadthData.newHighsLows?.newLows != null && (
                <span>
                  <span className="text-emerald-600 font-medium">{breadthData.newHighsLows.newHighs}</span>
                  {" NH / "}
                  <span className="text-red-600 font-medium">{breadthData.newHighsLows.newLows}</span>
                  {" NL"}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// --- Shared sub-components ---

function ExpandableRow({
  id,
  label,
  value,
  badge,
  loading,
  expandedIds,
  toggleExpanded,
  children,
}: {
  id: string;
  label: string;
  value: string | null;
  badge: { text: string; color: string } | null;
  loading: boolean;
  expandedIds: Set<string>;
  toggleExpanded: (id: string) => void;
  children: React.ReactNode;
}) {
  return (
    <div>
      <button
        disabled={loading}
        onClick={() => !loading && toggleExpanded(id)}
        className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-gray-50 transition-colors disabled:hover:bg-transparent"
      >
        <ChevronRight className={`w-3 h-3 text-gray-400 transition-transform shrink-0 ${expandedIds.has(id) ? "rotate-90" : ""}`} />
        <span className="text-xs font-medium text-gray-900 flex-1 min-w-0 truncate">{label}</span>
        {!loading && value != null ? (
          <>
            <span className="text-xs font-bold tabular-nums text-gray-900 shrink-0">{value}</span>
            {badge && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full shrink-0 ${badge.color}`}>
                {badge.text}
              </span>
            )}
          </>
        ) : loading ? (
          <>
            <Skeleton className="h-3 w-10" />
            <Skeleton className="h-4 w-14 rounded-full" />
          </>
        ) : null}
      </button>
      {expandedIds.has(id) && children}
    </div>
  );
}

function ExpandedContent({
  description,
  currentReading,
  marketImpact,
  whyItMatters,
  ranges,
  currentValue,
  labelWidth = "w-24",
  assets,
}: {
  description: string;
  currentReading: React.ReactNode;
  marketImpact: string | null;
  whyItMatters: string;
  ranges: Array<{ label: string; min: number | null; max: number | null; meaning: string; marketImpact?: string }>;
  currentValue: number | null;
  labelWidth?: string;
  assets: string[];
}) {
  const currentLabel = getRangeLabel(currentValue, ranges);

  return (
    <div className="px-3 pb-3 pt-2 bg-gray-50/50 border-t border-gray-100">
      <p className="text-[10px] text-gray-500 mb-2">{description}</p>
      <div className="space-y-2">
        {(currentReading || marketImpact) && (
          <div className="bg-blue-50 rounded-lg p-2.5">
            <h4 className="text-[10px] font-semibold text-blue-600 uppercase tracking-wide mb-1">Current Reading</h4>
            {currentReading}
            {marketImpact && <p className="text-[10px] text-gray-700"><strong>Market Impact:</strong> {marketImpact}</p>}
          </div>
        )}
        <div className="bg-gray-50 rounded-lg p-2.5">
          <h4 className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Why It Matters</h4>
          <p className="text-[10px] text-gray-700">{whyItMatters}</p>
        </div>
        <InterpretationGuide ranges={ranges} currentValue={currentValue} labelWidth={labelWidth} />
        <div>
          <h4 className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Assets Affected</h4>
          <div className="flex flex-wrap gap-1">
            {assets.map((asset, idx) => (
              <span key={idx} className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{asset}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function InterpretationGuide({
  ranges,
  currentValue,
  labelWidth = "w-24",
}: {
  ranges: Array<{ label: string; min: number | null; max: number | null; meaning: string }>;
  currentValue: number | null;
  labelWidth?: string;
}) {
  const currentLabel = getRangeLabel(currentValue, ranges);
  return (
    <div>
      <h4 className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Interpretation Guide</h4>
      <div className="space-y-1">
        {ranges.map((range, idx) => (
          <div
            key={idx}
            className={`flex flex-wrap items-start gap-1 text-[10px] p-1 rounded ${
              currentLabel === range.label
                ? getRangeColor(range.label) + " ring-1 ring-offset-1 ring-gray-300"
                : "bg-gray-50"
            }`}
          >
            <span className={`font-medium ${labelWidth} shrink-0`}>{range.label}</span>
            <span className="text-gray-500 w-16 shrink-0 tabular-nums">
              {range.min !== null ? range.min : "<"}{range.min !== null && range.max !== null ? " \u2013 " : ""}{range.max !== null ? range.max : "+"}
            </span>
            <span className="text-gray-600 flex-1">{range.meaning}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
