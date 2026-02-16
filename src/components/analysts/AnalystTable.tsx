"use client";

import { TrendingUp, TrendingDown, Edit2, Trash2 } from "lucide-react";
import { formatDate } from "@/lib/format-date";
import type { AnalystCall } from "./types";
import {
  formatPrice,
  getActionBadge,
  getOutcomeBadge,
  calculateReturn,
} from "./utils";

interface AnalystTableProps {
  calls: AnalystCall[];
  onEdit: (call: AnalystCall) => void;
  onDelete: (id: number) => void;
}

export function AnalystTable({ calls, onEdit, onDelete }: AnalystTableProps) {
  if (calls.length === 0) {
    return (
      <div className="bg-white rounded-lg border overflow-hidden">
        <div className="p-8 text-center text-gray-500">
          No calls match your filters.
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
              <th className="px-4 py-3 font-medium text-gray-600">Date</th>
              <th className="px-4 py-3 font-medium text-gray-600">Analyst</th>
              <th className="px-4 py-3 font-medium text-gray-600">Ticker</th>
              <th className="px-4 py-3 font-medium text-gray-600 text-center">
                Action
              </th>
              <th className="px-4 py-3 font-medium text-gray-600 text-right">
                Price Target
              </th>
              <th className="px-4 py-3 font-medium text-gray-600 text-right">
                Price @ Call
              </th>
              <th className="px-4 py-3 font-medium text-gray-600 text-right">
                Current
              </th>
              <th className="px-4 py-3 font-medium text-gray-600 text-right">
                Return
              </th>
              <th className="px-4 py-3 font-medium text-gray-600 text-center">
                Status
              </th>
              <th className="px-4 py-3 font-medium text-gray-600 text-center">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {calls.map((call) => {
              const ret = calculateReturn(call);
              return (
                <tr key={call.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-600">
                    {formatDate(call.callDate)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">
                      {call.analystName || "Unknown"}
                    </div>
                    <div className="text-xs text-gray-500">
                      {call.analystFirm}
                    </div>
                  </td>
                  <td className="px-4 py-3 font-medium">{call.ticker}</td>
                  <td className="px-4 py-3 text-center">
                    <span
                      className={`px-2 py-1 rounded text-xs font-medium ${getActionBadge(
                        call.action
                      )}`}
                    >
                      {call.action}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {formatPrice(call.priceTarget)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {formatPrice(call.priceAtCall)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {formatPrice(call.currentPrice)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {ret !== null ? (
                      <span
                        className={`flex items-center justify-end gap-1 ${
                          ret >= 0 ? "text-emerald-600" : "text-red-600"
                        }`}
                      >
                        {ret >= 0 ? (
                          <TrendingUp className="w-3.5 h-3.5" />
                        ) : (
                          <TrendingDown className="w-3.5 h-3.5" />
                        )}
                        {(ret * 100).toFixed(1)}%
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span
                      className={`px-2 py-1 rounded text-xs font-medium ${getOutcomeBadge(
                        call.outcome
                      )}`}
                    >
                      {call.outcome || "pending"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        onClick={() => onEdit(call)}
                        className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                        title="Edit"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => onDelete(call.id)}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
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
