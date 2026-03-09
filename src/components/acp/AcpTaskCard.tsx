"use client";

import { AcpPillarBadge } from "./AcpPillarBadge";
import { CheckCircle } from "lucide-react";

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

interface AcpTaskCardProps {
  task: Task;
}

export function AcpTaskCard({ task }: AcpTaskCardProps) {
  const isHighPriority = (task.priority ?? 0) >= 75;
  const isDone = task.status === "done";

  return (
    <div
      className={`bg-white rounded-lg border p-3 ${
        isDone ? "border-gray-100 opacity-75" : "border-gray-200"
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <AcpPillarBadge pillar={task.pillar} size="sm" />
        {isDone && <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />}
      </div>

      <div className={`text-sm ${isDone ? "text-gray-500 line-through" : "text-gray-900"}`}>
        {task.title}
      </div>

      {task.description && !isDone && (
        <div className="text-xs text-gray-500 mt-1 line-clamp-2">
          {task.description}
        </div>
      )}

      <div className="flex items-center justify-between mt-2">
        {isHighPriority && !isDone ? (
          <span className="text-xs text-orange-600 font-medium">High Priority</span>
        ) : (
          <span />
        )}
        {task.completedAt && isDone && (
          <span className="text-xs text-gray-400">
            {new Date(task.completedAt).toLocaleDateString()}
          </span>
        )}
      </div>
    </div>
  );
}
