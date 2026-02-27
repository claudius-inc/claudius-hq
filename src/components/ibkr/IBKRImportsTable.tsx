"use client";

import { Trash2 } from "lucide-react";
import { Import } from "./types";
import { formatDate } from "./utils";

interface IBKRImportsTableProps {
  imports: Import[];
  onDelete: (id: number) => void;
}

export function IBKRImportsTable({
  imports,
  onDelete,
}: IBKRImportsTableProps) {
  if (imports.length === 0) {
    return (
      <div className="bg-white rounded-lg border overflow-hidden">
        <div className="p-8 text-center text-gray-500">
          No imports yet. Upload an IBKR statement to get started.
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
              <th className="px-4 py-3 font-medium text-gray-600">File</th>
              <th className="px-4 py-3 font-medium text-gray-600">Period</th>
              <th className="px-4 py-3 font-medium text-gray-600 text-right">
                Trades
              </th>
              <th className="px-4 py-3 font-medium text-gray-600 text-right">
                Dividends
              </th>
              <th className="px-4 py-3 font-medium text-gray-600">Imported</th>
              <th className="px-4 py-3 font-medium text-gray-600"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {imports.map((imp) => (
              <tr key={imp.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium">{imp.filename}</td>
                <td className="px-4 py-3 text-gray-600">
                  {imp.statementStart && imp.statementEnd
                    ? `${formatDate(imp.statementStart)} - ${formatDate(imp.statementEnd)}`
                    : "-"}
                </td>
                <td className="px-4 py-3 text-right">{imp.tradeCount}</td>
                <td className="px-4 py-3 text-right">{imp.dividendCount}</td>
                <td className="px-4 py-3 text-gray-600">
                  {formatDate(imp.createdAt)}
                </td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => onDelete(imp.id)}
                    className="p-1 text-gray-400 hover:text-red-600 transition-colors"
                    title="Delete import"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
