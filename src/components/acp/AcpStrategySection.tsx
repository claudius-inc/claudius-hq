"use client";

import { ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";
import { AcpStrategyField } from "./AcpStrategyField";

interface StrategyParam {
  id: string;
  category?: string | null;
  key: string;
  value?: string | null;
  notes?: string | null;
}

interface AcpStrategySectionProps {
  category: string;
  params: StrategyParam[];
}

const categoryLabels: Record<string, string> = {
  pricing: "Pricing Strategy",
  offerings: "Offerings Strategy",
  marketing: "Marketing Strategy",
  experiments: "Experiments Strategy",
  goals: "Goals",
  uncategorized: "Other",
};

const categoryDescriptions: Record<string, string> = {
  pricing: "Control pricing floors, ceilings, and default values",
  offerings: "Manage offering limits and retirement thresholds",
  marketing: "Configure marketing post frequency and targeting",
  experiments: "A/B test parameters and significance thresholds",
  goals: "Current epoch targets",
};

export function AcpStrategySection({ category, params }: AcpStrategySectionProps) {
  const [expanded, setExpanded] = useState(true);

  const label = categoryLabels[category] ?? category;
  const description = categoryDescriptions[category];

  return (
    <div className="bg-white rounded-lg border border-gray-200">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50"
      >
        <div className="flex items-center gap-2">
          {expanded ? (
            <ChevronDown className="w-4 h-4 text-gray-400" />
          ) : (
            <ChevronRight className="w-4 h-4 text-gray-400" />
          )}
          <div className="text-left">
            <div className="font-semibold text-gray-900">{label}</div>
            {description && (
              <div className="text-xs text-gray-500">{description}</div>
            )}
          </div>
        </div>
        <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
          {params.length} params
        </span>
      </button>

      {expanded && (
        <div className="border-t border-gray-100 px-4 py-3 space-y-3">
          {params.length === 0 ? (
            <div className="text-sm text-gray-400 text-center py-4">
              No parameters configured
            </div>
          ) : (
            params.map((param) => (
              <AcpStrategyField key={param.id} param={param} />
            ))
          )}
        </div>
      )}
    </div>
  );
}
