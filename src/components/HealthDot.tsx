// Single-dot health indicator with 4 states
// Gray: Neutral | Green: Bullish/Healthy | Orange: Caution | Red: Warning/Stressed

export type HealthLevel = "neutral" | "healthy" | "caution" | "warning";

interface HealthDotProps {
  level: HealthLevel;
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
  className?: string;
}

const levelConfig: Record<HealthLevel, { color: string; bg: string; label: string }> = {
  neutral: { color: "bg-gray-400", bg: "bg-gray-100", label: "Neutral" },
  healthy: { color: "bg-emerald-500", bg: "bg-emerald-50", label: "Healthy" },
  caution: { color: "bg-amber-500", bg: "bg-amber-50", label: "Caution" },
  warning: { color: "bg-red-500", bg: "bg-red-50", label: "Warning" },
};

const sizeConfig = {
  sm: "w-2 h-2",
  md: "w-3 h-3",
  lg: "w-4 h-4",
};

export function HealthDot({ level, size = "md", showLabel = false, className = "" }: HealthDotProps) {
  const config = levelConfig[level];
  const dotSize = sizeConfig[size];

  return (
    <div className={`flex items-center gap-1.5 ${className}`} title={config.label}>
      <span className={`${dotSize} rounded-full ${config.color} shadow-sm`} />
      {showLabel && (
        <span className="text-xs text-gray-600">{config.label}</span>
      )}
    </div>
  );
}

// Helper to convert various status labels to health level
export function labelToHealthLevel(label: string | null | undefined): HealthLevel {
  if (!label) return "neutral";
  
  const normalized = label.toLowerCase();
  
  // Healthy/Bullish indicators
  if (
    normalized.includes("target") ||
    normalized.includes("healthy") ||
    normalized.includes("normal") ||
    normalized.includes("full employment") ||
    normalized.includes("expansion") ||
    normalized.includes("balanced") ||
    normalized.includes("accommodative") ||
    normalized.includes("low") ||
    normalized.includes("greedy") // contrarian: extreme greed can be cautionary but often signals bull market
  ) {
    return "healthy";
  }
  
  // Warning/Stressed indicators
  if (
    normalized.includes("crisis") ||
    normalized.includes("very restrictive") ||
    normalized.includes("deeply inverted") ||
    normalized.includes("recession") ||
    normalized.includes("high") ||
    normalized.includes("fear") ||
    normalized.includes("stressed") ||
    normalized.includes("selloff") ||
    normalized.includes("deep contraction")
  ) {
    return "warning";
  }
  
  // Caution indicators
  if (
    normalized.includes("elevated") ||
    normalized.includes("above target") ||
    normalized.includes("softening") ||
    normalized.includes("restrictive") ||
    normalized.includes("inverted") ||
    normalized.includes("contraction") ||
    normalized.includes("concerning") ||
    normalized.includes("pressure") ||
    normalized.includes("fearful")
  ) {
    return "caution";
  }
  
  // Default to neutral
  return "neutral";
}

// Batch version for multiple indicators
export function aggregateHealthLevel(labels: (string | null | undefined)[]): HealthLevel {
  const levels = labels.map(labelToHealthLevel);
  
  // If any warning, overall is warning
  if (levels.includes("warning")) return "warning";
  
  // If majority caution, overall is caution
  const cautionCount = levels.filter(l => l === "caution").length;
  if (cautionCount >= labels.length / 2) return "caution";
  
  // If majority healthy, overall is healthy
  const healthyCount = levels.filter(l => l === "healthy").length;
  if (healthyCount >= labels.length / 2) return "healthy";
  
  return "neutral";
}
