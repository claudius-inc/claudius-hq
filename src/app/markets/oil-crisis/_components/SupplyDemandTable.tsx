"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { SUPPLY_ROWS, OIL_CONSTANTS } from "./constants";
import { getCrisisDay } from "./helpers";

export function SupplyDemandTable() {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const day = getCrisisDay();

  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Calculate net balance
  const totalPreCrisis = SUPPLY_ROWS.reduce((sum, row) => sum + row.preCrisis, 0);
  const totalCurrent = SUPPLY_ROWS.reduce((sum, row) => sum + row.getCurrent(day), 0);
  const netChange = totalCurrent - totalPreCrisis;

  // Calculate net supply
  const netSupply = OIL_CONSTANTS.GLOBAL_DEMAND_MBD + netChange;
  const deficit = netSupply - OIL_CONSTANTS.GLOBAL_DEMAND_MBD;

  return (
    <div className="card overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/50">
        <h3 className="text-sm font-semibold text-gray-900">Supply/Demand Balance</h3>
        <p className="text-xs text-gray-500 mt-0.5">Live supply changes during crisis</p>
      </div>

      <div className="divide-y divide-gray-100">
        {/* Header row */}
        <div className="grid grid-cols-4 gap-2 px-4 py-2 text-[10px] font-medium text-gray-500 uppercase tracking-wider bg-gray-50">
          <div className="col-span-1">Source</div>
          <div className="text-right">Pre-Crisis</div>
          <div className="text-right">Current</div>
          <div className="text-right">Change</div>
        </div>

        {/* Data rows */}
        {SUPPLY_ROWS.map((row) => {
          const current = row.getCurrent(day);
          const change = current - row.preCrisis;
          const isExpanded = expandedIds.has(row.id);
          const hasBreakdown = row.breakdown && row.breakdown.length > 0;

          return (
            <div key={row.id}>
              <button
                onClick={() => hasBreakdown && toggleExpanded(row.id)}
                className={`w-full grid grid-cols-4 gap-2 px-4 py-2.5 text-left transition-colors ${
                  hasBreakdown ? "hover:bg-gray-50 cursor-pointer" : ""
                }`}
                disabled={!hasBreakdown}
              >
                <div className="col-span-1 flex items-center gap-2">
                  {hasBreakdown && (
                    <ChevronRight
                      className={`w-3 h-3 text-gray-400 transition-transform shrink-0 ${
                        isExpanded ? "rotate-90" : ""
                      }`}
                    />
                  )}
                  {!hasBreakdown && <span className="w-3" />}
                  <span className="text-xs font-medium text-gray-900 truncate">
                    {row.source}
                  </span>
                </div>
                <div className="text-right text-xs tabular-nums text-gray-600">
                  {row.preCrisis.toFixed(1)}
                </div>
                <div className="text-right text-xs tabular-nums font-medium text-gray-900">
                  {current.toFixed(1)}
                </div>
                <div
                  className={`text-right text-xs tabular-nums font-medium ${
                    change > 0
                      ? "text-emerald-600"
                      : change < 0
                        ? "text-red-600"
                        : "text-gray-400"
                  }`}
                >
                  {change > 0 ? "+" : ""}
                  {change.toFixed(1)}
                </div>
              </button>

              {/* Expanded breakdown */}
              {isExpanded && row.breakdown && (
                <div className="bg-gray-50/70 border-t border-gray-100">
                  {row.breakdown.map((item, idx) => (
                    <div
                      key={idx}
                      className="grid grid-cols-4 gap-2 px-4 py-1.5 text-[11px]"
                    >
                      <div className="col-span-1 pl-5 text-gray-500">
                        {item.country}
                      </div>
                      <div className="text-right tabular-nums text-gray-400">
                        {item.preCrisis.toFixed(1)}
                      </div>
                      <div className="text-right tabular-nums text-gray-500">
                        {item.current.toFixed(1)}
                      </div>
                      <div
                        className={`text-right tabular-nums ${
                          item.current - item.preCrisis > 0
                            ? "text-emerald-500"
                            : item.current - item.preCrisis < 0
                              ? "text-red-500"
                              : "text-gray-400"
                        }`}
                      >
                        {item.current - item.preCrisis > 0 ? "+" : ""}
                        {(item.current - item.preCrisis).toFixed(1)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {/* Net Balance row */}
        <div className="grid grid-cols-4 gap-2 px-4 py-3 bg-gray-100/50 font-medium">
          <div className="col-span-1 text-xs text-gray-900 flex items-center gap-2">
            <span className="w-3" />
            Net Balance
          </div>
          <div className="text-right text-xs tabular-nums text-gray-700">
            {OIL_CONSTANTS.GLOBAL_DEMAND_MBD.toFixed(1)}
          </div>
          <div className="text-right text-xs tabular-nums text-gray-900">
            {netSupply.toFixed(1)}
          </div>
          <div
            className={`text-right text-xs tabular-nums ${
              deficit >= 0 ? "text-emerald-600" : "text-red-600"
            }`}
          >
            {deficit >= 0 ? "+" : ""}
            {deficit.toFixed(1)}
          </div>
        </div>
      </div>

      <div className="px-4 py-2 bg-gray-50/30 border-t border-gray-100">
        <p className="text-[10px] text-gray-400">
          All values in mbd (million barrels per day). Global demand baseline: {OIL_CONSTANTS.GLOBAL_DEMAND_MBD} mbd.
        </p>
      </div>
    </div>
  );
}
