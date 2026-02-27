"use client";

import { useState, useMemo } from "react";
import {
  ChevronDown,
  ChevronRight,
  TrendingUp,
  TrendingDown,
  Upload,
} from "lucide-react";
import { useResearchStatus } from "@/hooks/useResearchStatus";
import { ResearchStatusBadge } from "@/components/ResearchStatusBadge";
import { Position } from "./types";
import { formatCurrency, formatPct } from "./utils";

interface IBKRPositionsTableProps {
  positions: Position[];
  baseCurrency: string;
  onImportClick: () => void;
}

export function IBKRPositionsTable({
  positions,
  baseCurrency,
  onImportClick,
}: IBKRPositionsTableProps) {
  const [expandedSymbol, setExpandedSymbol] = useState<string | null>(null);

  const positionTickers = useMemo(
    () => positions.map((p) => p.symbol),
    [positions]
  );
  const { statuses: researchStatuses, refetch: refetchResearch } =
    useResearchStatus(positionTickers);

  if (positions.length === 0) {
    return (
      <div className="bg-white rounded-lg border overflow-hidden">
        <div className="p-8 text-center">
          <p className="text-gray-500 mb-4">
            No positions yet. Upload an IBKR statement to get started.
          </p>
          <button
            onClick={onImportClick}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <Upload className="w-4 h-4" />
            Import Statement
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left">
            <tr>
              <th className="px-4 py-3 font-medium text-gray-600">Symbol</th>
              <th className="px-4 py-3 font-medium text-gray-600 text-center">
                Research
              </th>
              <th className="px-4 py-3 font-medium text-gray-600 text-right">
                Qty
              </th>
              <th className="px-4 py-3 font-medium text-gray-600 text-right">
                Avg Cost
              </th>
              <th className="px-4 py-3 font-medium text-gray-600 text-right">
                Price
              </th>
              <th className="px-4 py-3 font-medium text-gray-600 text-right">
                Day
              </th>
              <th className="px-4 py-3 font-medium text-gray-600 text-right">
                Market Value
              </th>
              <th className="px-4 py-3 font-medium text-gray-600 text-right">
                P&L
              </th>
              <th className="px-4 py-3 font-medium text-gray-600 text-right">
                %
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {positions.map((pos) => {
              const displayCurrency = pos.priceCurrency || pos.currency;
              const isNonBase = displayCurrency !== baseCurrency;
              return (
                <tr
                  key={pos.symbol}
                  className="hover:bg-gray-50 cursor-pointer"
                  onClick={() =>
                    setExpandedSymbol(
                      expandedSymbol === pos.symbol ? null : pos.symbol
                    )
                  }
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {expandedSymbol === pos.symbol ? (
                        <ChevronDown className="w-4 h-4 text-gray-400" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-gray-400" />
                      )}
                      <div>
                        <span className="font-medium">{pos.symbol}</span>
                        {isNonBase && (
                          <span className="ml-2 text-xs text-gray-400">
                            {displayCurrency}
                          </span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <ResearchStatusBadge
                      ticker={pos.symbol}
                      status={
                        researchStatuses[pos.symbol.toUpperCase()] ?? null
                      }
                      compact
                      onResearchTriggered={refetchResearch}
                    />
                  </td>
                  <td className="px-4 py-3 text-right">
                    {pos.quantity.toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {formatCurrency(pos.avgCost, displayCurrency)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {formatCurrency(pos.currentPrice, displayCurrency)}
                  </td>
                  <td
                    className={`px-4 py-3 text-right ${
                      pos.dayChangePct >= 0
                        ? "text-emerald-600"
                        : "text-red-600"
                    }`}
                  >
                    <div className="flex items-center justify-end gap-1">
                      {pos.dayChangePct >= 0 ? (
                        <TrendingUp className="w-3 h-3" />
                      ) : (
                        <TrendingDown className="w-3 h-3" />
                      )}
                      {formatPct(pos.dayChangePct)}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {isNonBase && pos.marketValueBase ? (
                      <>
                        <div>
                          {formatCurrency(pos.marketValueBase, baseCurrency)}
                        </div>
                        <div className="text-xs text-gray-400">
                          ({formatCurrency(pos.marketValue, displayCurrency)})
                        </div>
                      </>
                    ) : (
                      <div>
                        {formatCurrency(pos.marketValue, displayCurrency)}
                      </div>
                    )}
                  </td>
                  <td
                    className={`px-4 py-3 text-right font-medium ${
                      pos.unrealizedPnl >= 0
                        ? "text-emerald-600"
                        : "text-red-600"
                    }`}
                  >
                    {isNonBase && pos.unrealizedPnlBase ? (
                      <>
                        <div>
                          {formatCurrency(pos.unrealizedPnlBase, baseCurrency)}
                        </div>
                        <div className="text-xs text-gray-400">
                          ({formatCurrency(pos.unrealizedPnl, displayCurrency)})
                        </div>
                      </>
                    ) : (
                      <div>
                        {formatCurrency(pos.unrealizedPnl, displayCurrency)}
                      </div>
                    )}
                  </td>
                  <td
                    className={`px-4 py-3 text-right ${
                      (isNonBase
                        ? pos.unrealizedPnlBasePct ?? 0
                        : pos.unrealizedPnlPct) >= 0
                        ? "text-emerald-600"
                        : "text-red-600"
                    }`}
                  >
                    {formatPct(
                      isNonBase && pos.unrealizedPnlBasePct !== undefined
                        ? pos.unrealizedPnlBasePct
                        : pos.unrealizedPnlPct
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
