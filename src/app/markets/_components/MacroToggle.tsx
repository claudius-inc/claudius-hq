"use client";

import { useState } from "react";
import { ChevronDown, TrendingUp } from "lucide-react";
import { Indicators } from "./Indicators";
import { RefreshIndicator } from "@/components/ui/RefreshIndicator";
import type { MacroIndicator } from "../_lib/types";

interface MacroToggleProps {
  macroIndicators: MacroIndicator[];
  loading: boolean;
  expandedIds: Set<string>;
  toggleExpanded: (id: string) => void;
  refreshing?: boolean;
}

export function MacroToggle({
  macroIndicators,
  loading,
  expandedIds,
  toggleExpanded,
  refreshing = false,
}: MacroToggleProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="col-span-full">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 text-xs font-semibold text-gray-900 mb-1.5 hover:text-gray-700 transition-colors"
      >
        <span className="flex items-center text-gray-400"><TrendingUp className="w-3.5 h-3.5" /></span>
        Why this regime? — underlying macro
        <RefreshIndicator active={refreshing} />
        <ChevronDown className={`w-3 h-3 text-gray-400 transition-transform ${expanded ? "rotate-180" : ""}`} />
        {!expanded && (
          <span className="text-[10px] font-normal text-gray-400 ml-1">
            Evidence for the Gavekal regime above ({macroIndicators.length} indicators)
          </span>
        )}
      </button>
      {expanded && (
        <Indicators
          macroIndicators={macroIndicators}
          loading={loading}
          expandedIds={expandedIds}
          toggleExpanded={toggleExpanded}
        />
      )}
    </div>
  );
}
