import { Skeleton } from "@/components/Skeleton";
import { Landmark, ArrowRight, HelpCircle } from "lucide-react";
import { RangePopover } from "@/components/ui/RangePopover";
import {
  realYieldRanges,
  debtToGdpRanges,
  deficitToGdpRanges,
} from "./constants";
import { ConditionalLink } from "./ConditionalLink";
import type { RegimeData } from "./types";

interface RegimeStripProps {
  regimeData: RegimeData | null;
  loading: { regime: boolean; sentiment: boolean };
}

export function RegimeStrip({ regimeData, loading }: RegimeStripProps) {
  return (
    <div className="col-span-full">
      <div className="rounded-lg bg-white border border-gray-200 shadow-sm p-3 sm:p-4">
        <ConditionalLink
          href={
            !loading.regime && !loading.sentiment && regimeData
              ? "/markets/regime"
              : undefined
          }
          className="flex items-center justify-between gap-3"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center gap-2 min-w-0">
            {loading.sentiment || loading.regime ? (
              <>
                <Skeleton className="w-6 h-6 rounded-md !bg-gray-100" />
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
                <Skeleton className="h-3 w-14 !bg-gray-100" />
                <Skeleton className="h-3 w-14 !bg-gray-100 hidden sm:block" />
                <Skeleton className="h-3 w-14 !bg-gray-100 hidden sm:block" />
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
        </ConditionalLink>
      </div>
    </div>
  );
}
