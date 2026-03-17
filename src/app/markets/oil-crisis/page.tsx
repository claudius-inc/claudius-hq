"use client";

import { PageHero } from "@/components/PageHero";
import { StatusMetrics } from "./_components/StatusMetrics";
import { SupplyDemandTable } from "./_components/SupplyDemandTable";
import { PriceForecastTable } from "./_components/PriceForecastTable";
import { ScenarioSimulator } from "./_components/ScenarioSimulator";
import { KeyMetrics } from "./_components/KeyMetrics";
import { getCrisisDay, getCrisisStatus } from "./_components/helpers";
import { CRISIS_START_DATE } from "./_components/constants";

export default function OilCrisisPage() {
  const crisisDay = getCrisisDay();
  const status = getCrisisStatus(crisisDay);

  const statusBadge = (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${
        status === "escalating"
          ? "bg-red-100 text-red-700"
          : status === "de-escalating"
            ? "bg-emerald-100 text-emerald-700"
            : status === "resolved"
              ? "bg-gray-100 text-gray-700"
              : "bg-amber-100 text-amber-700"
      }`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${
          status === "escalating"
            ? "bg-red-500 animate-pulse"
            : status === "de-escalating"
              ? "bg-emerald-500"
              : status === "resolved"
                ? "bg-gray-500"
                : "bg-amber-500 animate-pulse"
        }`}
      />
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );

  const lastUpdate = new Date().toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <>
      <PageHero
        title="🛢️ Oil Crisis Simulator"
        subtitle={`Strait of Hormuz crisis tracking • Started ${CRISIS_START_DATE.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} • Day ${crisisDay}`}
        badge={statusBadge}
        actionSlot={
          <div className="text-xs text-gray-400">
            Last update: {lastUpdate}
          </div>
        }
      />

      <div className="space-y-6">
        {/* Status Metrics */}
        <StatusMetrics />

        {/* Supply/Demand + Forecast Tables */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <SupplyDemandTable />
          <PriceForecastTable />
        </div>

        {/* Scenario Simulator */}
        <ScenarioSimulator />

        {/* Key Metrics */}
        <KeyMetrics />

        {/* Methodology Note */}
        <div className="card p-4 bg-gray-50/50">
          <h4 className="text-xs font-semibold text-gray-700 mb-2">
            Methodology & Disclaimers
          </h4>
          <div className="text-[11px] text-gray-500 space-y-1">
            <p>
              <strong>Price Model:</strong> Based on supply/demand elasticity
              (7% price increase per 1% supply loss) with reserve dampening
              (30% offset from SPR releases). Historical calibration from 1973,
              1979, 1990, and 2022 oil shocks.
            </p>
            <p>
              <strong>Data Sources:</strong> EIA, IEA, OPEC Monthly Reports,
              MarineTraffic (tanker tracking), Yahoo Finance (spot prices).
            </p>
            <p>
              <strong>Limitations:</strong> Model assumes rational markets and
              does not account for speculation, hoarding behavior, or
              geopolitical escalation beyond strait closure. Confidence bands:
              ±15% near-term, ±25% extended scenarios.
            </p>
            <p className="text-gray-400 italic">
              This is a simulation tool for educational purposes. Not investment
              advice.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
