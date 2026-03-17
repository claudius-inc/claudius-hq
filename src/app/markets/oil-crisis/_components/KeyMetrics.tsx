"use client";

import { Shield, TrendingUp, AlertTriangle, Clock, Fuel } from "lucide-react";
import { OIL_CONSTANTS } from "./constants";
import { getCurrentMetrics, calculateKeyMetrics } from "./helpers";

interface MetricPillProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  color?: "blue" | "amber" | "red" | "green" | "purple";
}

function MetricPill({ icon, label, value, color = "blue" }: MetricPillProps) {
  const colorClasses = {
    blue: "bg-blue-50 text-blue-700 border-blue-200",
    amber: "bg-amber-50 text-amber-700 border-amber-200",
    red: "bg-red-50 text-red-700 border-red-200",
    green: "bg-emerald-50 text-emerald-700 border-emerald-200",
    purple: "bg-purple-50 text-purple-700 border-purple-200",
  };

  const iconClasses = {
    blue: "text-blue-500",
    amber: "text-amber-500",
    red: "text-red-500",
    green: "text-emerald-500",
    purple: "text-purple-500",
  };

  return (
    <div
      className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${colorClasses[color]}`}
    >
      <span className={iconClasses[color]}>{icon}</span>
      <div className="min-w-0">
        <div className="text-[10px] font-medium uppercase tracking-wide opacity-70">
          {label}
        </div>
        <div className="text-sm font-bold tabular-nums truncate">{value}</div>
      </div>
    </div>
  );
}

export function KeyMetrics() {
  const metrics = getCurrentMetrics();
  const keyMetrics = calculateKeyMetrics(
    metrics.shutInMbd,
    metrics.sprRelease,
    30
  );

  return (
    <div className="card overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/50">
        <h3 className="text-sm font-semibold text-gray-900">Key Metrics</h3>
        <p className="text-xs text-gray-500 mt-0.5">
          Derived calculations from current crisis state
        </p>
      </div>

      <div className="p-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <MetricPill
            icon={<Shield className="w-4 h-4" />}
            label="SPR Coverage"
            value={`${keyMetrics.sprCoverageDays} days`}
            color="blue"
          />
          <MetricPill
            icon={<TrendingUp className="w-4 h-4" />}
            label="Peak Estimate"
            value={`$${keyMetrics.peakPriceEstimate}`}
            color="red"
          />
          <MetricPill
            icon={<AlertTriangle className="w-4 h-4" />}
            label="Demand Destruction"
            value={`$${keyMetrics.demandDestructionPrice}`}
            color="amber"
          />
          <MetricPill
            icon={<Clock className="w-4 h-4" />}
            label="US SPR"
            value={`${keyMetrics.usSprCoverageDays} days`}
            color="purple"
          />
          <MetricPill
            icon={<Fuel className="w-4 h-4" />}
            label="US Gas Price"
            value={`$${keyMetrics.gasolinePrice.toFixed(2)}/gal`}
            color="green"
          />
        </div>

        <div className="mt-4 p-3 bg-gray-50 rounded-lg">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div>
              <div className="font-medium text-gray-700 mb-1">SPR Reserves</div>
              <div className="space-y-1">
                <div className="flex justify-between text-gray-500">
                  <span>US SPR</span>
                  <span className="font-medium text-gray-700">
                    {OIL_CONSTANTS.US_SPR_BARRELS_M}M bbl
                  </span>
                </div>
                <div className="flex justify-between text-gray-500">
                  <span>Global IEA</span>
                  <span className="font-medium text-gray-700">
                    {OIL_CONSTANTS.GLOBAL_SPR_BARRELS_M}M bbl
                  </span>
                </div>
                <div className="flex justify-between text-gray-500">
                  <span>OPEC+ Spare</span>
                  <span className="font-medium text-gray-700">
                    {OIL_CONSTANTS.OPEC_SPARE_CAPACITY_MBD} mbd
                  </span>
                </div>
              </div>
            </div>
            <div>
              <div className="font-medium text-gray-700 mb-1">Model Assumptions</div>
              <div className="space-y-1">
                <div className="flex justify-between text-gray-500">
                  <span>Global Demand</span>
                  <span className="font-medium text-gray-700">
                    {OIL_CONSTANTS.GLOBAL_DEMAND_MBD} mbd
                  </span>
                </div>
                <div className="flex justify-between text-gray-500">
                  <span>ME Production</span>
                  <span className="font-medium text-gray-700">
                    {OIL_CONSTANTS.ME_PRODUCTION_MBD} mbd
                  </span>
                </div>
                <div className="flex justify-between text-gray-500">
                  <span>Strait Flow</span>
                  <span className="font-medium text-gray-700">
                    {OIL_CONSTANTS.STRAIT_FLOW_MBD} mbd
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
