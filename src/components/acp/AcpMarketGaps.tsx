"use client";

import { Lightbulb } from "lucide-react";

interface MarketGap {
  category: string;
  description: string;
  competitorCount: number;
  opportunity: "high" | "medium" | "low";
}

interface AcpMarketGapsProps {
  gaps: MarketGap[];
}

export function AcpMarketGaps({ gaps }: AcpMarketGapsProps) {
  if (gaps.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="flex items-center gap-2 mb-3">
          <Lightbulb className="w-4 h-4 text-yellow-500" />
          <h3 className="font-semibold text-gray-900">Market Gaps</h3>
        </div>
        <div className="text-sm text-gray-400 text-center py-4">
          No market gaps identified yet
        </div>
      </div>
    );
  }

  const opportunityColors = {
    high: "bg-green-50 text-green-700 border-green-200",
    medium: "bg-yellow-50 text-yellow-700 border-yellow-200",
    low: "bg-gray-50 text-gray-600 border-gray-200",
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="flex items-center gap-2 mb-3">
        <Lightbulb className="w-4 h-4 text-yellow-500" />
        <h3 className="font-semibold text-gray-900">Market Gaps</h3>
      </div>

      <div className="space-y-2">
        {gaps.map((gap, idx) => (
          <div
            key={idx}
            className={`p-3 rounded-lg border ${opportunityColors[gap.opportunity]}`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="font-medium">{gap.category}</span>
              <span className="text-xs">
                {gap.competitorCount} competitor{gap.competitorCount !== 1 && "s"}
              </span>
            </div>
            <div className="text-sm">{gap.description}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
