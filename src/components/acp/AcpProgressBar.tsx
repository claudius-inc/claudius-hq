"use client";

interface AcpProgressBarProps {
  value: number; // 0-100
  label?: string;
  size?: "sm" | "md";
  showPercent?: boolean;
}

export function AcpProgressBar({ value, label, size = "sm", showPercent = true }: AcpProgressBarProps) {
  const clampedValue = Math.min(100, Math.max(0, value));
  const heightClass = size === "sm" ? "h-2" : "h-3";

  // Color based on progress
  let barColor = "bg-blue-500";
  if (clampedValue >= 80) barColor = "bg-green-500";
  else if (clampedValue >= 50) barColor = "bg-blue-500";
  else if (clampedValue >= 25) barColor = "bg-yellow-500";
  else barColor = "bg-red-400";

  return (
    <div className="space-y-1">
      {(label || showPercent) && (
        <div className="flex items-center justify-between text-xs text-gray-500">
          {label && <span>{label}</span>}
          {showPercent && <span className="font-mono">{clampedValue.toFixed(0)}%</span>}
        </div>
      )}
      <div className={`w-full bg-gray-100 rounded-full overflow-hidden ${heightClass}`}>
        <div
          className={`${heightClass} ${barColor} rounded-full transition-all duration-300`}
          style={{ width: `${clampedValue}%` }}
        />
      </div>
    </div>
  );
}
