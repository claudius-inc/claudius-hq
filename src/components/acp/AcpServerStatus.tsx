"use client";

import { Circle } from "lucide-react";

interface AcpServerStatusProps {
  isRunning: boolean;
  lastHeartbeat?: string | null;
}

export function AcpServerStatus({ isRunning, lastHeartbeat }: AcpServerStatusProps) {
  const formatRelativeTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);

    if (diffMin < 1) return "just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${Math.floor(diffHours / 24)}d ago`;
  };

  return (
    <div className="flex items-center gap-2 text-sm">
      <Circle
        className={`w-2.5 h-2.5 ${
          isRunning ? "fill-green-500 text-green-500" : "fill-red-500 text-red-500"
        }`}
      />
      <span className={isRunning ? "text-green-700" : "text-red-700"}>
        Server {isRunning ? "OK" : "Down"}
      </span>
      {lastHeartbeat && (
        <span className="text-gray-400 text-xs">
          ({formatRelativeTime(lastHeartbeat)})
        </span>
      )}
    </div>
  );
}
