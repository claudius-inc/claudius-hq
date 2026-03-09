"use client";

import { DollarSign, Package, Target, FlaskConical, ArrowRight } from "lucide-react";

interface Decision {
  id: number;
  decisionType?: string | null;
  offering?: string | null;
  oldValue?: string | null;
  newValue?: string | null;
  reasoning?: string | null;
  outcome?: string | null;
  createdAt?: string | null;
}

interface AcpDecisionCardProps {
  decision: Decision;
}

const typeConfig: Record<string, { icon: typeof DollarSign; label: string; color: string }> = {
  pricing: {
    icon: DollarSign,
    label: "Pricing",
    color: "text-green-600 bg-green-50",
  },
  offering_change: {
    icon: Package,
    label: "Offering Change",
    color: "text-blue-600 bg-blue-50",
  },
  strategy_shift: {
    icon: Target,
    label: "Strategy Shift",
    color: "text-purple-600 bg-purple-50",
  },
  experiment: {
    icon: FlaskConical,
    label: "Experiment",
    color: "text-orange-600 bg-orange-50",
  },
};

export function AcpDecisionCard({ decision }: AcpDecisionCardProps) {
  const type = typeConfig[decision.decisionType ?? ""] ?? {
    icon: Target,
    label: decision.decisionType ?? "Decision",
    color: "text-gray-600 bg-gray-50",
  };
  const Icon = type.icon;

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      {/* Header */}
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className={`p-1.5 rounded ${type.color}`}>
            <Icon className="w-4 h-4" />
          </span>
          <div>
            <span className="font-medium text-gray-900">{type.label}</span>
            {decision.offering && (
              <span className="text-gray-500 ml-1">- {decision.offering}</span>
            )}
          </div>
        </div>
        {decision.outcome && (
          <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
            {decision.outcome}
          </span>
        )}
      </div>

      {/* Change */}
      {(decision.oldValue || decision.newValue) && (
        <div className="flex items-center gap-2 text-sm mb-2">
          <span className="text-gray-500">{decision.oldValue ?? "—"}</span>
          <ArrowRight className="w-3.5 h-3.5 text-gray-400" />
          <span className="font-medium text-gray-900">
            {decision.newValue ?? "—"}
          </span>
        </div>
      )}

      {/* Reasoning */}
      {decision.reasoning && (
        <div className="text-sm text-gray-600 italic">
          &ldquo;{decision.reasoning}&rdquo;
        </div>
      )}
    </div>
  );
}
