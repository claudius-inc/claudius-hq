"use client";

import { Trade } from "./types";
import { formatCurrency, formatDate } from "./utils";

interface IBKRTradesTableProps {
  trades: Trade[];
}

export function IBKRTradesTable({ trades }: IBKRTradesTableProps) {
  if (trades.length === 0) {
    return (
      <div className="bg-white rounded-lg border overflow-hidden">
        <div className="p-8 text-center text-gray-500">
          No trades yet. Upload an IBKR statement to import trades.
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
              <th className="px-4 py-3 font-medium text-gray-600">Symbol</th>
              <th className="px-4 py-3 font-medium text-gray-600">Action</th>
              <th className="px-4 py-3 font-medium text-gray-600 text-right">
                Qty
              </th>
              <th className="px-4 py-3 font-medium text-gray-600 text-right">
                Price
              </th>
              <th className="px-4 py-3 font-medium text-gray-600 text-right">
                Commission
              </th>
              <th className="px-4 py-3 font-medium text-gray-600 text-right">
                Total
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {trades.map((trade) => (
              <tr key={trade.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-gray-600">
                  {formatDate(trade.tradeDate)}
                </td>
                <td className="px-4 py-3 font-medium">{trade.symbol}</td>
                <td className="px-4 py-3">
                  <span
                    className={`px-2 py-0.5 rounded text-xs font-medium ${
                      trade.action === "BUY"
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-red-100 text-red-700"
                    }`}
                  >
                    {trade.action}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">{trade.quantity}</td>
                <td className="px-4 py-3 text-right">
                  {formatCurrency(trade.price, trade.currency)}
                </td>
                <td className="px-4 py-3 text-right text-gray-500">
                  {formatCurrency(trade.commission, trade.currency)}
                </td>
                <td className="px-4 py-3 text-right font-medium">
                  {formatCurrency(trade.total, trade.currency)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
