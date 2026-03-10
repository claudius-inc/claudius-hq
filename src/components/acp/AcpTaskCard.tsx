"use client";

import { AcpPillarBadge } from "./AcpPillarBadge";
import { CheckCircle } from "lucide-react";
import type { AcpTask } from "@/db/schema";

interface AcpTaskCardProps {
  task: AcpTask;
  onClick?: (task: AcpTask) => void;
}

export function AcpTaskCard({ task, onClick }: AcpTaskCardProps) {
  const isHighPriority = (task.priority ?? 0) >= 75;
  const isDone = task.status === "done";

  const handleClick = () => {
    onClick?.(task);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onClick?.(task);
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className={`bg-white rounded-lg border p-3 cursor-pointer transition-all hover:shadow-md hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 ${
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
