"use client";

import { Download } from "lucide-react";
import { CRISIS_TIMELINE } from "./constants";
import { getCrisisDay, formatCrisisDate } from "./helpers";

export function PriceForecastTable() {
  const currentDay = getCrisisDay();

  const handleExport = () => {
    const headers = ["Day", "Date", "Brent Low", "Brent Mid", "Brent High", "Event"];
    const rows = CRISIS_TIMELINE.map((row) => [
      row.day,
      formatCrisisDate(row.day),
      `$${row.brentLow}`,
      `$${row.brentMid}`,
      `$${row.brentHigh}`,
      row.event || "",
    ]);

    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `oil-crisis-forecast-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="card overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Price Forecast</h3>
          <p className="text-xs text-gray-500 mt-0.5">Day-by-day Brent projections</p>
        </div>
        <button
          onClick={handleExport}
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
        >
          <Download className="w-3.5 h-3.5" />
          CSV
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-100">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-2 text-left text-[10px] font-medium text-gray-500 uppercase tracking-wider">
                Day
              </th>
              <th className="px-4 py-2 text-left text-[10px] font-medium text-gray-500 uppercase tracking-wider">
                Date
              </th>
              <th className="px-4 py-2 text-right text-[10px] font-medium text-gray-500 uppercase tracking-wider">
                Low
              </th>
              <th className="px-4 py-2 text-right text-[10px] font-medium text-gray-500 uppercase tracking-wider">
                Mid
              </th>
              <th className="px-4 py-2 text-right text-[10px] font-medium text-gray-500 uppercase tracking-wider">
                High
              </th>
              <th className="px-4 py-2 text-left text-[10px] font-medium text-gray-500 uppercase tracking-wider">
                Event
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-50">
            {CRISIS_TIMELINE.map((row, idx) => {
              const isCurrentDay = row.day === currentDay || 
                (idx < CRISIS_TIMELINE.length - 1 && 
                 row.day <= currentDay && 
                 CRISIS_TIMELINE[idx + 1].day > currentDay);
              const isPast = row.day < currentDay;
              const isFuture = row.day > currentDay;

              return (
                <tr
                  key={row.day}
                  className={`${
                    isCurrentDay
                      ? "bg-blue-50 border-l-2 border-l-blue-500"
                      : isPast
                        ? "bg-gray-50/30"
                        : ""
                  }`}
                >
                  <td className="px-4 py-2.5">
                    <span
                      className={`text-xs font-medium ${
                        isCurrentDay
                          ? "text-blue-700"
                          : isPast
                            ? "text-gray-400"
                            : "text-gray-900"
                      }`}
                    >
                      {row.day}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <span
                      className={`text-xs ${
                        isCurrentDay
                          ? "text-blue-600 font-medium"
                          : "text-gray-500"
                      }`}
                    >
                      {formatCrisisDate(row.day)}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <span
                      className={`text-xs tabular-nums ${
                        isFuture ? "text-gray-400" : "text-gray-600"
                      }`}
                    >
                      ${row.brentLow}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <span
                      className={`text-xs font-semibold tabular-nums ${
                        isCurrentDay
                          ? "text-blue-700"
                          : isFuture
                            ? "text-gray-500"
                            : "text-gray-900"
                      }`}
                    >
                      ${row.brentMid}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <span
                      className={`text-xs tabular-nums ${
                        isFuture ? "text-gray-400" : "text-gray-600"
                      }`}
                    >
                      ${row.brentHigh}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    {row.event && (
                      <span
                        className={`text-xs ${
                          isCurrentDay
                            ? "text-blue-600 font-medium"
                            : isFuture
                              ? "text-gray-400"
                              : "text-gray-500"
                        }`}
                      >
                        {row.event}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="px-4 py-2 bg-gray-50/30 border-t border-gray-100">
        <p className="text-[10px] text-gray-400">
          Projections based on supply/demand balance model with price elasticity. Confidence bands: ±15% for near-term, ±25% for extended.
        </p>
      </div>
    </div>
  );
}
