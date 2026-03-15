"use client";

import { useState } from "react";
import { Skeleton } from "@/components/Skeleton";
import { Landmark, ArrowRight, HelpCircle } from "lucide-react";
import { RangePopover } from "@/components/ui/RangePopover";
import { Modal } from "@/components/ui/Modal";
import {
  realYieldRanges,
  debtToGdpRanges,
  deficitToGdpRanges,
} from "./constants";
import { CorrelationTrigger, CorrelationModalContent, useCorrelationData } from "./CorrelationMatrix";
import type { RegimeData } from "./types";

interface RegimeStripProps {
  regimeData: RegimeData | null;
  loading: { regime: boolean; sentiment: boolean };
  onOpenDetail?: () => void;
}

export function RegimeStrip({ regimeData, loading, onOpenDetail }: RegimeStripProps) {
  const [correlationOpen, setCorrelationOpen] = useState(false);
  const { data: correlationData, isLoading: correlationLoading } = useCorrelationData();
  const alertCount = correlationData?.alerts?.length ?? 0;

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
                  <span className="opacity-60">RY </span>
                  <Skeleton className="h-3 w-8 inline-block !bg-gray-100" />
                </div>
                <span className="hidden sm:contents">
                  <div className="text-center text-[10px] text-gray-400">
                    <span className="opacity-60">D/G </span>
                    <Skeleton className="h-3 w-8 inline-block !bg-gray-100" />
                  </div>
                  <div className="text-center text-[10px] text-gray-400">
                    <span className="opacity-60">Def </span>
                    <Skeleton className="h-3 w-8 inline-block !bg-gray-100" />
                  </div>
                </span>
              </>
            ) : regimeData ? (
              <>
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

        {/* Correlation Matrix trigger - embedded in regime card */}
        <div className="mt-2 pt-2 border-t border-gray-100 flex items-center justify-end">
          <CorrelationTrigger 
            onClick={() => setCorrelationOpen(true)} 
            alertCount={alertCount}
            loading={correlationLoading}
          />
        </div>
      </div>

      {/* Correlation Modal */}
      <Modal
        open={correlationOpen}
        onClose={() => setCorrelationOpen(false)}
        title="Correlation Matrix"
        size="md"
      >
        {correlationLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-24 w-full" />
          </div>
        ) : (
          <CorrelationModalContent data={correlationData} />
        )}
      </Modal>
    </>
  );
}
