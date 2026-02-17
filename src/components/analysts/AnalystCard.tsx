"use client";

import {
  ChevronDown,
  ChevronUp,
  Building,
  Target,
  Trash2,
} from "lucide-react";
import { formatDate } from "@/lib/format-date";
import type { Analyst } from "./types";
import {
  getSuccessRateBg,
  getSuccessRateColor,
  getActionBadge,
  getOutcomeBadge,
} from "./utils";

interface AnalystCardProps {
  analyst: Analyst;
  isExpanded: boolean;
  onToggle: () => void;
  onDelete: (id: number) => void;
}

export function AnalystCard({
  analyst,
  isExpanded,
  onToggle,
  onDelete,
}: AnalystCardProps) {
  return (
    <div className="bg-white rounded-lg border border-amber-200 shadow-sm overflow-hidden min-w-0">
      <div
        className="p-4 cursor-pointer hover:bg-amber-50/50 transition-colors"
        onClick={onToggle}
      >
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-gray-900">{analyst.name}</h3>
              {analyst.successRate !== null && (
                <span
                  className={`px-2 py-0.5 rounded-full text-xs font-medium ${getSuccessRateBg(
                    analyst.successRate
                  )} ${getSuccessRateColor(analyst.successRate)}`}
                >
                  {(analyst.successRate * 100).toFixed(0)}%
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-500 mt-1">
              <Building className="w-3.5 h-3.5" />
              {analyst.firm}
            </div>
            {analyst.specialty && (
              <div className="flex items-center gap-2 text-sm text-gray-500 mt-1">
                <Target className="w-3.5 h-3.5" />
                {analyst.specialty}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500">
              {analyst.callCount} calls
            </span>
            {isExpanded ? (
              <ChevronUp className="w-4 h-4 text-gray-400" />
            ) : (
              <ChevronDown className="w-4 h-4 text-gray-400" />
            )}
          </div>
        </div>
        {analyst.notes && (
          <p className="text-xs text-gray-500 mt-2 line-clamp-2">
            {analyst.notes}
          </p>
        )}
      </div>

      {/* Expanded: Recent Calls */}
      {isExpanded && (
        <div className="border-t bg-gray-50 p-3 space-y-2">
          {analyst.recentCalls.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-2">
              No calls logged yet
            </p>
          ) : (
            analyst.recentCalls.map((call) => (
              <div
                key={call.id}
                className="flex items-center justify-between bg-white rounded px-3 py-2 text-sm"
              >
                <div className="flex items-center gap-2">
                  <span className="font-medium">{call.ticker}</span>
                  <span
                    className={`px-1.5 py-0.5 rounded text-xs ${getActionBadge(
                      call.action
                    )}`}
                  >
                    {call.action}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-gray-500">
                  <span>{formatDate(call.callDate)}</span>
                  <span
                    className={`px-1.5 py-0.5 rounded text-xs ${getOutcomeBadge(
                      call.outcome
                    )}`}
                  >
                    {call.outcome || "pending"}
                  </span>
                </div>
              </div>
            ))
          )}
          <div className="flex justify-end pt-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete(analyst.id);
              }}
              className="text-xs text-red-500 hover:text-red-700 flex items-center gap-1"
            >
              <Trash2 className="w-3 h-3" />
              Remove Analyst
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
