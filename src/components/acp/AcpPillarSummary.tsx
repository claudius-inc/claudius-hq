"use client";

import { AcpPillarBadge, type AcpPillar } from "./AcpPillarBadge";

interface Task {
  pillar: string;
  status?: string | null;
}

interface AcpPillarSummaryProps {
  tasks: Task[];
}

const pillars: AcpPillar[] = ["quality", "replace", "build", "experiment"];

export function AcpPillarSummary({ tasks }: AcpPillarSummaryProps) {
  const summary = pillars.map((pillar) => {
    const pillarTasks = tasks.filter((t) => t.pillar === pillar);
    const pending = pillarTasks.filter((t) => (t.status ?? "pending") === "pending").length;
    const inProgress = pillarTasks.filter((t) => t.status === "in_progress").length;
    const done = pillarTasks.filter((t) => t.status === "done").length;

    return { pillar, pending, inProgress, done, total: pillarTasks.length };
  });

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <h3 className="font-semibold text-gray-900 mb-3">Pillar Summary</h3>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {summary.map(({ pillar, pending, inProgress, done }) => (
          <div key={pillar} className="space-y-2">
            <AcpPillarBadge pillar={pillar} size="sm" />
            <div className="text-xs text-gray-500 space-y-0.5">
              <div>
                {pending} pending
                {inProgress > 0 && <span>, {inProgress} active</span>}
              </div>
              <div className="text-gray-400">{done} done</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
