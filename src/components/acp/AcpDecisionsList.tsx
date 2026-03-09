"use client";

import { AcpDecisionCard } from "./AcpDecisionCard";

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

interface AcpDecisionsListProps {
  decisions: Decision[];
}

function groupByDate(decisions: Decision[]): Record<string, Decision[]> {
  const groups: Record<string, Decision[]> = {};

  for (const decision of decisions) {
    const date = decision.createdAt
      ? new Date(decision.createdAt).toLocaleDateString("en-US", {
          year: "numeric",
          month: "long",
          day: "numeric",
        })
      : "Unknown Date";

    if (!groups[date]) groups[date] = [];
    groups[date].push(decision);
  }

  return groups;
}

export function AcpDecisionsList({ decisions }: AcpDecisionsListProps) {
  const grouped = groupByDate(decisions);
  const dates = Object.keys(grouped);

  if (decisions.length === 0) {
    return (
      <div className="text-center py-8 text-gray-400">
        No decisions recorded yet
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {dates.map((date) => (
        <div key={date}>
          <h3 className="text-sm font-medium text-gray-700 mb-3">{date}</h3>
          <div className="space-y-3">
            {grouped[date].map((decision) => (
              <AcpDecisionCard key={decision.id} decision={decision} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
