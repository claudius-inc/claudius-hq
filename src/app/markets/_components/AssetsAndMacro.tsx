import { useState } from "react";
import { ChevronDown, TrendingUp } from "lucide-react";
import { Barometers } from "./Barometers";
import { HardAssets } from "./HardAssets";
import { Indicators } from "./Indicators";
import type { MarketEtf, MacroIndicator, YieldSpread } from "./types";
import type { ExpectedReturnsResponse } from "@/lib/valuation/types";

interface AssetsAndMacroProps {
  marketEtfs: MarketEtf[];
  loadingEtfs: boolean;
  macroIndicators: MacroIndicator[];
  yieldSpreads: YieldSpread[];
  loadingMacro: boolean;
  expectedReturns: ExpectedReturnsResponse | null;
  expandedIds: Set<string>;
  toggleExpanded: (id: string) => void;
}

export function AssetsAndMacro({
  marketEtfs,
  loadingEtfs,
  macroIndicators,
  yieldSpreads,
  loadingMacro,
  expectedReturns,
  expandedIds,
  toggleExpanded,
}: AssetsAndMacroProps) {
  const [macroExpanded, setMacroExpanded] = useState(false);

  return (
    <div className="col-span-full space-y-4">
      {/* Top strip: Barometers + Commodities side by side */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 items-start">
        <Barometers
          marketEtfs={marketEtfs}
          loading={loadingEtfs}
          expandedIds={expandedIds}
          toggleExpanded={toggleExpanded}
          expectedReturns={expectedReturns}
        />

        <HardAssets expectedReturns={expectedReturns} />
      </div>

      {/* Collapsible macro indicators section */}
      <div>
        <button
          onClick={() => setMacroExpanded(!macroExpanded)}
          className="flex items-center gap-1.5 text-xs font-semibold text-gray-900 mb-1.5 hover:text-gray-700 transition-colors"
        >
          <span className="flex items-center text-gray-400"><TrendingUp className="w-3.5 h-3.5" /></span>
          Macro Indicators
          <ChevronDown className={`w-3 h-3 text-gray-400 transition-transform ${macroExpanded ? "rotate-180" : ""}`} />
          {!macroExpanded && (
            <span className="text-[10px] font-normal text-gray-400 ml-1">
              ({macroIndicators.length} indicators)
            </span>
          )}
        </button>
        {macroExpanded && (
          <Indicators
            macroIndicators={macroIndicators}
            yieldSpreads={yieldSpreads}
            loading={loadingMacro}
            expandedIds={expandedIds}
            toggleExpanded={toggleExpanded}
          />
        )}
      </div>
    </div>
  );
}
