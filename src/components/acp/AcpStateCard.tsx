"use client";

import { AcpPillarBadge } from "./AcpPillarBadge";
import { AcpProgressBar } from "./AcpProgressBar";
import { TrendingUp, Hash, Target, DollarSign } from "lucide-react";

interface AcpStateCardProps {
  state: {
    currentPillar: string;
    currentEpoch?: number | null;
    jobsThisEpoch?: number | null;
    revenueThisEpoch?: number | null;
    targetJobs?: number | null;
    targetRevenue?: number | null;
    targetRank?: number | null;
    lastHeartbeat?: string | null;
  };
  epochStats?: {
    rank?: number | null;
    revenue?: number | null;
    jobsCompleted?: number | null;
  } | null;
}

export function AcpStateCard({ state, epochStats }: AcpStateCardProps) {
  const jobProgress = state.targetJobs && state.jobsThisEpoch
    ? (state.jobsThisEpoch / state.targetJobs) * 100
    : 0;

  const revenueProgress = state.targetRevenue && state.revenueThisEpoch
    ? (state.revenueThisEpoch / state.targetRevenue) * 100
    : 0;

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-gray-900">Current State</h3>
        <AcpPillarBadge pillar={state.currentPillar} size="md" />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Epoch */}
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 text-xs text-gray-500">
            <Hash className="w-3.5 h-3.5" />
            <span>Epoch</span>
          </div>
          <div className="text-lg font-semibold text-gray-900">
            #{state.currentEpoch ?? "—"}
          </div>
        </div>

        {/* Jobs */}
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 text-xs text-gray-500">
            <Target className="w-3.5 h-3.5" />
            <span>Jobs</span>
          </div>
          <div className="text-lg font-semibold text-gray-900">
            {state.jobsThisEpoch ?? 0}
            {state.targetJobs && (
              <span className="text-sm font-normal text-gray-400">
                /{state.targetJobs}
              </span>
            )}
          </div>
        </div>

        {/* Revenue */}
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 text-xs text-gray-500">
            <DollarSign className="w-3.5 h-3.5" />
            <span>Revenue</span>
          </div>
          <div className="text-lg font-semibold text-gray-900">
            ${(state.revenueThisEpoch ?? 0).toFixed(2)}
          </div>
        </div>

        {/* Rank */}
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 text-xs text-gray-500">
            <TrendingUp className="w-3.5 h-3.5" />
            <span>Rank</span>
          </div>
          <div className="text-lg font-semibold text-gray-900">
            #{epochStats?.rank ?? "—"}
            {state.targetRank && (
              <span className="text-sm font-normal text-gray-400">
                {" "}(target: Top {state.targetRank})
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Progress bars */}
      {(state.targetJobs || state.targetRevenue) && (
        <div className="grid md:grid-cols-2 gap-4 pt-2">
          {state.targetJobs && (
            <AcpProgressBar
              value={jobProgress}
              label="Jobs Progress"
              size="sm"
            />
          )}
          {state.targetRevenue && (
            <AcpProgressBar
              value={revenueProgress}
              label="Revenue Progress"
              size="sm"
            />
          )}
        </div>
      )}
    </div>
  );
}
