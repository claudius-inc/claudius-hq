"use client";

import { Trophy, TrendingUp, TrendingDown, Minus } from "lucide-react";
import Link from "next/link";

interface TopPerformer {
  name: string;
  jobs: number | null;
  revenue: number | null;
  price: number | null;
  trend?: number;
}

interface AcpTopPerformersProps {
  performers: TopPerformer[];
}

function TrendIcon({ trend }: { trend?: number }) {
  if (!trend || Math.abs(trend) < 1) {
    return <Minus className="w-3.5 h-3.5 text-gray-400" />;
  }
  if (trend > 0) {
    return <TrendingUp className="w-3.5 h-3.5 text-green-500" />;
  }
  return <TrendingDown className="w-3.5 h-3.5 text-red-500" />;
}

export function AcpTopPerformers({ performers }: AcpTopPerformersProps) {
  return (
    <div className="bg-white rounded-lg border border-gray-200">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <Trophy className="w-4 h-4 text-yellow-500" />
          <h3 className="font-semibold text-gray-900">Top Performers</h3>
        </div>
        <Link
          href="/acp/offerings"
          className="text-xs text-blue-600 hover:text-blue-800"
        >
          View All
        </Link>
      </div>

      {performers.length === 0 ? (
        <div className="px-4 py-6 text-center text-gray-400 text-sm">
          No offerings yet
        </div>
      ) : (
        <div className="divide-y divide-gray-50">
          {performers.slice(0, 5).map((p, idx) => (
            <div
              key={p.name}
              className="px-4 py-2.5 flex items-center gap-3 hover:bg-gray-50"
            >
              <span className="text-xs font-medium text-gray-400 w-4">
                {idx + 1}.
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-900 truncate">
                  {p.name}
                </div>
                <div className="text-xs text-gray-500">
                  {p.jobs ?? 0} jobs @ ${(p.price ?? 0).toFixed(2)}
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm font-mono font-medium text-gray-900">
                  ${(p.revenue ?? 0).toFixed(2)}
                </div>
                <div className="flex items-center justify-end gap-0.5">
                  <TrendIcon trend={p.trend} />
                  {p.trend !== undefined && Math.abs(p.trend) >= 1 && (
                    <span
                      className={`text-xs ${
                        p.trend > 0 ? "text-green-600" : "text-red-600"
                      }`}
                    >
                      {p.trend > 0 ? "+" : ""}
                      {p.trend.toFixed(0)}%
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
