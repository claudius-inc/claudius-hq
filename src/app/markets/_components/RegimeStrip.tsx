"use client";

import { Skeleton } from "@/components/Skeleton";
import { Landmark, ArrowRight, HelpCircle, ChevronRight, TrendingUp, TrendingDown, Activity } from "lucide-react";
import { RangePopover } from "@/components/ui/RangePopover";
import {
  realYieldRanges,
  debtToGdpRanges,
  deficitToGdpRanges,
  erpRanges,
} from "../_lib/constants";
import type { RegimeData } from "../_lib/types";
import type { ExpectedReturnsResponse, SignalAlignment } from "@/lib/valuation/types";

interface RegimeStripProps {
  regimeData: RegimeData | null;
  loading: { regime: boolean; sentiment: boolean };
  onOpenDetail?: () => void;
  expectedReturns?: ExpectedReturnsResponse | null;
}

const alignmentStyles: Record<SignalAlignment, string> = {
  "strong-buy": "bg-emerald-50 text-emerald-700",
  "buy": "bg-emerald-50/50 text-emerald-600",
  "mixed": "bg-amber-50 text-amber-700",
  "sell": "bg-red-50/50 text-red-600",
  "strong-sell": "bg-red-50 text-red-700",
};

const alignmentLabels: Record<SignalAlignment, string> = {
  "strong-buy": "Strong Buy",
  "buy": "Buy Signal",
  "mixed": "Mixed",
  "sell": "Sell Signal",
  "strong-sell": "Strong Sell",
};

export function RegimeStrip({ regimeData, loading, onOpenDetail, expectedReturns }: RegimeStripProps) {
  return (
    <>
      <div className="rounded-lg bg-white border border-gray-200 shadow-sm p-3 sm:p-4 h-full flex flex-col">
        {/* Main regime button */}
        <button
          type="button"
          disabled={loading.regime || loading.sentiment || !regimeData}
          className="flex items-center justify-between gap-3 w-full text-left cursor-pointer disabled:cursor-default"
          onClick={onOpenDetail}
        >
          <div className="flex items-center gap-2 min-w-0">
            {loading.sentiment || loading.regime ? (
              <>
                <div className="p-1 rounded-md bg-gray-50">
                  <Landmark className="w-3.5 h-3.5 text-gray-400" />
                </div>
                <div>
                  <Skeleton className="h-4 w-32 !bg-gray-100 mb-1" />
                  <Skeleton className="h-2.5 w-48 !bg-gray-50" />
                </div>
              </>
            ) : regimeData ? (
              <>
                <div
                  className={`p-1 rounded-md ${
                    regimeData.name === "Fiscal Dominance"
                      ? "bg-red-50"
                      : regimeData.name === "Financial Repression"
                        ? "bg-amber-50"
                        : regimeData.name === "Restrictive Policy"
                          ? "bg-blue-50"
                          : "bg-gray-50"
                  }`}
                >
                  <Landmark
                    className={`w-3.5 h-3.5 ${
                      regimeData.name === "Fiscal Dominance"
                        ? "text-red-500"
                        : regimeData.name === "Financial Repression"
                          ? "text-amber-500"
                          : regimeData.name === "Restrictive Policy"
                            ? "text-blue-500"
                            : "text-gray-400"
                    }`}
                  />
                </div>
                <div>
                  <span
                    className={`text-sm font-bold ${
                      regimeData.name === "Fiscal Dominance"
                        ? "text-red-600"
                        : regimeData.name === "Financial Repression"
                          ? "text-amber-600"
                          : regimeData.name === "Restrictive Policy"
                            ? "text-blue-600"
                            : "text-gray-500"
                    }`}
                  >
                    {regimeData.name}
                  </span>
                  <p className="text-[10px] text-gray-400 leading-tight">
                    {regimeData.description}
                  </p>
                </div>
              </>
            ) : (
              <>
                <div className="p-1 rounded-md bg-gray-50">
                  <Landmark className="w-3.5 h-3.5 text-gray-400" />
                </div>
                <div>
                  <span className="text-sm font-bold text-gray-400">
                    {"\u00A0"}
                  </span>
                  <p className="text-[10px] text-gray-400 leading-tight">
                    {"\u00A0"}
                  </p>
                </div>
              </>
            )}
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {loading.sentiment || loading.regime ? (
              <>
                <div className="text-center text-[10px] text-gray-400">
                  <span className="opacity-60">ERP </span>
                  <Skeleton className="h-3 w-10 inline-block !bg-gray-100" />
                </div>
                <div className="text-center text-[10px] text-gray-400">
                  <span className="opacity-60">RY </span>
                  <Skeleton className="h-3 w-12 inline-block !bg-gray-100" />
                </div>
                <span className="hidden sm:contents">
                  <div className="text-center text-[10px] text-gray-400">
                    <span className="opacity-60">D/G </span>
                    <Skeleton className="h-3 w-10 inline-block !bg-gray-100" />
                  </div>
                  <div className="text-center text-[10px] text-gray-400">
                    <span className="opacity-60">Def </span>
                    <Skeleton className="h-3 w-10 inline-block !bg-gray-100" />
                  </div>
                </span>
                <Skeleton className="h-3.5 w-3.5" />
              </>
            ) : regimeData ? (
              <>
                {expectedReturns?.erp && (
                  <RangePopover
                    ranges={erpRanges}
                    currentLabel={
                      expectedReturns.erp.value < 0
                        ? "Negative"
                        : expectedReturns.erp.value < 2
                          ? "Thin"
                          : expectedReturns.erp.value < 4
                            ? "Fair"
                            : expectedReturns.erp.value < 6
                              ? "Attractive"
                              : "Extreme"
                    }
                    unit="%"
                  >
                    <div className="text-center cursor-pointer hover:opacity-80 transition-opacity text-[10px] text-gray-400">
                      <span className="opacity-60">ERP </span>
                      <span
                        className={`font-bold ${
                          expectedReturns.erp.value < 0
                            ? "text-red-600"
                            : expectedReturns.erp.value < 2
                              ? "text-amber-600"
                              : expectedReturns.erp.value >= 4
                                ? "text-emerald-600"
                                : "text-gray-700"
                        }`}
                      >
                        {expectedReturns.erp.value.toFixed(1)}%
                      </span>
                      <HelpCircle className="w-2.5 h-2.5 text-gray-300 hover:text-gray-500 inline-block ml-0.5 -mt-0.5 transition-colors" />
                    </div>
                  </RangePopover>
                )}
                {regimeData.indicators.realYield !== null && (
                  <RangePopover
                    ranges={realYieldRanges}
                    currentLabel={
                      regimeData.indicators.realYield < -1
                        ? "Deeply Negative"
                        : regimeData.indicators.realYield < 0
                          ? "Negative"
                          : regimeData.indicators.realYield < 1
                            ? "Low Positive"
                            : regimeData.indicators.realYield < 2
                              ? "Moderate"
                              : "Restrictive"
                    }
                    unit="%"
                  >
                    <div className="text-center cursor-pointer hover:opacity-80 transition-opacity text-[10px] text-gray-400">
                      <span className="opacity-60">RY </span>
                      <span className="font-bold text-gray-700">
                        {regimeData.indicators.realYield.toFixed(2)}%
                      </span>
                      <HelpCircle className="w-2.5 h-2.5 text-gray-300 hover:text-gray-500 inline-block ml-0.5 -mt-0.5 transition-colors" />
                    </div>
                  </RangePopover>
                )}
                <span className="hidden sm:contents">
                  {regimeData.indicators.debtToGdp !== null && (
                    <RangePopover
                      ranges={debtToGdpRanges}
                      currentLabel={
                        regimeData.indicators.debtToGdp < 60
                          ? "Low"
                          : regimeData.indicators.debtToGdp < 90
                            ? "Moderate"
                            : regimeData.indicators.debtToGdp < 120
                              ? "Elevated"
                              : "Critical"
                      }
                      unit="%"
                    >
                      <div className="text-center cursor-pointer hover:opacity-80 transition-opacity text-[10px] text-gray-400">
                        <span className="opacity-60">D/G </span>
                        <span className="font-bold text-gray-700">
                          {regimeData.indicators.debtToGdp.toFixed(0)}%
                        </span>
                        <HelpCircle className="w-2.5 h-2.5 text-gray-300 hover:text-gray-500 inline-block ml-0.5 -mt-0.5 transition-colors" />
                      </div>
                    </RangePopover>
                  )}
                  {regimeData.indicators.deficitToGdp !== null && (
                    <RangePopover
                      ranges={deficitToGdpRanges}
                      currentLabel={
                        regimeData.indicators.deficitToGdp < 0
                          ? "Surplus"
                          : regimeData.indicators.deficitToGdp < 3
                            ? "Low"
                            : regimeData.indicators.deficitToGdp < 6
                              ? "Elevated"
                              : "High"
                      }
                      unit="%"
                    >
                      <div className="text-center cursor-pointer hover:opacity-80 transition-opacity text-[10px] text-gray-400">
                        <span className="opacity-60">Def </span>
                        <span className="font-bold text-gray-700">
                          {regimeData.indicators.deficitToGdp.toFixed(1)}%
                        </span>
                        <HelpCircle className="w-2.5 h-2.5 text-gray-300 hover:text-gray-500 inline-block ml-0.5 -mt-0.5 transition-colors" />
                      </div>
                    </RangePopover>
                  )}
                </span>
                <ArrowRight className="w-3.5 h-3.5 text-gray-300" />
              </>
            ) : (
              <span className="h-3 w-14">{"\u00A0"}</span>
            )}
          </div>
        </button>

        {/* Expected returns ranking + tactical summary */}
        {(!expectedReturns || loading.sentiment || loading.regime) && (
          <div className="mt-2 pt-2 border-t border-gray-100 space-y-1.5">
            {/* Ranking strip */}
            <div className="flex items-center gap-1">
              <Skeleton className="h-2.5 w-8" />
              {Array.from({ length: 5 }).map((_, i) => (
                <span key={i} className="flex items-center">
                  <Skeleton className="h-2.5 w-8" />
                  {i < 4 && <Skeleton className="h-2.5 w-2.5 mx-0.5" />}
                </span>
              ))}
              <Skeleton className="h-2.5 w-24 ml-1" />
            </div>
            {/* Tactical summary */}
            <div className="flex items-center gap-1 px-2 py-1 rounded bg-gray-50">
              <Skeleton className="h-2.5 w-2.5" />
              <Skeleton className="h-2.5 w-16" />
              <Skeleton className="h-2.5 w-40" />
            </div>
          </div>
        )}
        {expectedReturns && expectedReturns.assets.length > 0 && (
          <div className="mt-2 pt-2 border-t border-gray-100 space-y-1.5">
            {/* Ranking strip */}
            <div className="flex items-center gap-1">
              <span className="text-[9px] text-gray-400">Rank:</span>
              {expectedReturns.relativeRanking.map((symbol, i) => (
                <span key={symbol} className="flex items-center">
                  <span className="text-[9px] font-medium text-gray-600">{symbol}</span>
                  {i < expectedReturns.relativeRanking.length - 1 && (
                    <ChevronRight className="w-2.5 h-2.5 text-gray-300" />
                  )}
                </span>
              ))}
              <span className="text-[9px] text-gray-300 ml-1">(10Y expected return)</span>
            </div>

            {/* Tactical summary */}
            {expectedReturns.tacticalSummary && (
              <div className={`flex items-center gap-1 px-2 py-1 rounded ${alignmentStyles[expectedReturns.tacticalSummary.alignment]}`}>
                {expectedReturns.tacticalSummary.alignment.includes("buy") ? (
                  <TrendingUp className="w-2.5 h-2.5" />
                ) : expectedReturns.tacticalSummary.alignment.includes("sell") ? (
                  <TrendingDown className="w-2.5 h-2.5" />
                ) : (
                  <Activity className="w-2.5 h-2.5" />
                )}
                <span className="text-[9px] font-semibold">
                  {alignmentLabels[expectedReturns.tacticalSummary.alignment]}
                </span>
                <span className="text-[9px] opacity-70 truncate">
                  &mdash; {expectedReturns.tacticalSummary.message}
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
