"use client";

import { CheckSquare } from "lucide-react";
import Link from "next/link";
import { AcpPillarBadge } from "./AcpPillarBadge";

interface Task {
  id: number;
  pillar: string;
  title: string;
  priority?: number | null;
  status?: string | null;
}

interface AcpPendingTasksProps {
  tasks: Task[];
}

export function AcpPendingTasks({ tasks }: AcpPendingTasksProps) {
  const pendingTasks = tasks.filter((t) => (t.status ?? "pending") === "pending").slice(0, 5);

  return (
    <div className="bg-white rounded-lg border border-gray-200">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <CheckSquare className="w-4 h-4 text-blue-500" />
          <h3 className="font-semibold text-gray-900">Pending Tasks</h3>
          {pendingTasks.length > 0 && (
            <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">
              {pendingTasks.length}
            </span>
          )}
        </div>
        <Link
          href="/acp/tasks"
          className="text-xs text-blue-600 hover:text-blue-800"
        >
          View All
        </Link>
      </div>

      {pendingTasks.length === 0 ? (
        <div className="px-4 py-6 text-center text-gray-400 text-sm">
          No pending tasks
        </div>
      ) : (
        <div className="divide-y divide-gray-50">
          {pendingTasks.map((task) => (
            <div key={task.id} className="px-4 py-2.5 hover:bg-gray-50">
              <div className="flex items-start gap-2">
                <AcpPillarBadge pillar={task.pillar} showLabel={false} size="sm" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-gray-900 truncate">
                    {task.title}
                  </div>
                  {task.priority !== null && task.priority !== undefined && task.priority >= 75 && (
                    <span className="text-xs text-orange-600">High Priority</span>
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
