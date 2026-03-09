"use client";

import { Target, RefreshCw, Hammer, FlaskConical } from "lucide-react";
import type { ReactNode } from "react";

export type AcpPillar = "quality" | "replace" | "build" | "experiment";

interface AcpPillarBadgeProps {
  pillar: AcpPillar | string;
  size?: "sm" | "md";
  showLabel?: boolean;
}

const pillarConfig: Record<AcpPillar, { icon: ReactNode; label: string; color: string; bgColor: string }> = {
  quality: {
    icon: <Target className="w-3.5 h-3.5" />,
    label: "Quality",
    color: "text-blue-600",
    bgColor: "bg-blue-50",
  },
  replace: {
    icon: <RefreshCw className="w-3.5 h-3.5" />,
    label: "Replace",
    color: "text-orange-600",
    bgColor: "bg-orange-50",
  },
  build: {
    icon: <Hammer className="w-3.5 h-3.5" />,
    label: "Build",
    color: "text-purple-600",
    bgColor: "bg-purple-50",
  },
  experiment: {
    icon: <FlaskConical className="w-3.5 h-3.5" />,
    label: "Experiment",
    color: "text-green-600",
    bgColor: "bg-green-50",
  },
};

export function AcpPillarBadge({ pillar, size = "sm", showLabel = true }: AcpPillarBadgeProps) {
  const config = pillarConfig[pillar as AcpPillar] ?? pillarConfig.quality;
  const sizeClasses = size === "sm" ? "px-2 py-0.5 text-xs" : "px-3 py-1 text-sm";

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-medium ${config.color} ${config.bgColor} ${sizeClasses}`}
    >
      {config.icon}
      {showLabel && <span>{config.label}</span>}
    </span>
  );
}
