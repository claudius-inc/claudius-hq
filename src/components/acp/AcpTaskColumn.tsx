"use client";

import { AcpTaskCard } from "./AcpTaskCard";
import { Circle } from "lucide-react";

interface Task {
  id: number;
  pillar: string;
  priority?: number | null;
  title: string;
  description?: string | null;
  status?: string | null;
  completedAt?: string | null;
  createdAt?: string | null;
}

interface AcpTaskColumnProps {
  title: string;
  status: string;
  tasks: Task[];
  count: number;
}

const statusColors: Record<string, string> = {
  pending: "text-yellow-500",
  in_progress: "text-blue-500",
  done: "text-green-500",
};

export function AcpTaskColumn({ title, status, tasks, count }: AcpTaskColumnProps) {
  const colorClass = statusColors[status] ?? "text-gray-400";

  return (
    <div className="bg-gray-50 rounded-lg p-3">
      <div className="flex items-center gap-2 mb-3">
        <Circle className={`w-2.5 h-2.5 fill-current ${colorClass}`} />
        <h3 className="font-semibold text-gray-900">{title}</h3>
        <span className="text-xs bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded-full">
          {count}
        </span>
      </div>

      <div className="space-y-2">
        {tasks.length === 0 ? (
          <div className="text-center py-4 text-sm text-gray-400">
            No tasks
          </div>
        ) : (
          tasks.map((task) => <AcpTaskCard key={task.id} task={task} />)
        )}
      </div>
    </div>
  );
}
