"use client";

import { formatDistanceToNow } from "date-fns";

export function ScanAge({ date }: { date: string | Date }) {
  const d = typeof date === "string" ? new Date(date) : date;
  return (
    <span className="text-xs text-gray-400">
      {formatDistanceToNow(d, { addSuffix: true })}
    </span>
  );
}
