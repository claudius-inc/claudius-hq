"use client";

import { Fuel, TrendingDown, Percent, DollarSign } from "lucide-react";
import { getCurrentMetrics } from "./helpers";

interface MetricCardProps {
  icon: React.ReactNode;
  value: string | number;
  label: string;
  subtext?: string;
  color?: "red" | "amber" | "green" | "blue";
}

function MetricCard({ icon, value, label, subtext, color = "blue" }: MetricCardProps) {
  const colorClasses = {
    red: "bg-red-50 text-red-600 border-red-200",
    amber: "bg-amber-50 text-amber-600 border-amber-200",
    green: "bg-emerald-50 text-emerald-600 border-emerald-200",
    blue: "bg-blue-50 text-blue-600 border-blue-200",
  };

  const iconBgClasses = {
    red: "bg-red-100",
    amber: "bg-amber-100",
    green: "bg-emerald-100",
    blue: "bg-blue-100",
  };

  return (
    <div className={`rounded-xl border p-4 ${colorClasses[color]}`}>
      <div className="flex items-start justify-between">
        <div className={`p-2 rounded-lg ${iconBgClasses[color]}`}>
          {icon}
        </div>
      </div>
      <div className="mt-3">
        <div className="text-2xl font-bold tracking-tight">{value}</div>
        <div className="text-xs font-medium mt-0.5 opacity-80">{label}</div>
        {subtext && (
          <div className="text-[10px] mt-1 opacity-60">{subtext}</div>
        )}
      </div>
    </div>
  );
}

export function StatusMetrics() {
  const metrics = getCurrentMetrics();

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <MetricCard
        icon={<Fuel className="w-5 h-5" />}
        value={`Day ${metrics.crisisDays}`}
        label="Days of Crisis"
        subtext="Since Feb 28, 2026"
        color="red"
      />
      <MetricCard
        icon={<TrendingDown className="w-5 h-5" />}
        value={`${metrics.shutInMbd} mbd`}
        label="Shut-in Volume"
        subtext="Middle East supply offline"
        color="amber"
      />
      <MetricCard
        icon={<Percent className="w-5 h-5" />}
        value={`${metrics.supplyOfflinePercent}%`}
        label="Global Supply Offline"
        subtext={`of ${103} mbd global demand`}
        color="amber"
      />
      <MetricCard
        icon={<DollarSign className="w-5 h-5" />}
        value={`$${metrics.brentPrice.toFixed(2)}`}
        label="Brent Crude"
        subtext={`+$${metrics.priceChange.toFixed(2)} (+${metrics.priceChangePercent}%)`}
        color="red"
      />
    </div>
  );
}
