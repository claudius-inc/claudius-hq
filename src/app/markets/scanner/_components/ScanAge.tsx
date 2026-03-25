"use client";

function formatCompactAge(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

export function ScanAge({ date }: { date: string | Date }) {
  const d = typeof date === "string" ? new Date(date) : date;
  return (
    <span className="text-xs text-gray-400">
      {formatCompactAge(d)}
    </span>
  );
}
