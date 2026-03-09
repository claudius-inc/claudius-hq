"use client";

import { Calendar, DollarSign, Briefcase, Award, Gift } from "lucide-react";

interface AcpEpochCardProps {
  epochStats: {
    epochNumber?: number | null;
    startDate?: string | null;
    endDate?: string | null;
    rank?: number | null;
    revenue?: number | null;
    jobsCompleted?: number | null;
    agentScore?: number | null;
    estimatedReward?: number | null;
  } | null;
  jobsToday?: number;
}

export function AcpEpochCard({ epochStats, jobsToday = 0 }: AcpEpochCardProps) {
  if (!epochStats) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="flex items-center gap-2 mb-3">
          <Calendar className="w-4 h-4 text-gray-400" />
          <h3 className="font-semibold text-gray-900">Epoch Stats</h3>
        </div>
        <div className="text-gray-400 text-sm">No epoch data</div>
      </div>
    );
  }

  const avgJobValue =
    epochStats.jobsCompleted && epochStats.revenue
      ? epochStats.revenue / epochStats.jobsCompleted
      : 0;

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-gray-400" />
          <h3 className="font-semibold text-gray-900">Epoch Stats</h3>
        </div>
        <span className="text-xs text-gray-400">
          Epoch #{epochStats.epochNumber}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <div className="flex items-center gap-1.5 text-gray-500">
            <Briefcase className="w-3.5 h-3.5" />
            <span>Jobs</span>
          </div>
          <div className="font-semibold text-gray-900">
            {epochStats.jobsCompleted ?? 0}
            {jobsToday > 0 && (
              <span className="text-green-600 text-xs ml-1">(+{jobsToday} today)</span>
            )}
          </div>
        </div>

        <div>
          <div className="flex items-center gap-1.5 text-gray-500">
            <DollarSign className="w-3.5 h-3.5" />
            <span>Revenue</span>
          </div>
          <div className="font-semibold text-gray-900">
            ${(epochStats.revenue ?? 0).toFixed(2)}
          </div>
        </div>

        <div>
          <div className="flex items-center gap-1.5 text-gray-500">
            <Award className="w-3.5 h-3.5" />
            <span>Avg Job</span>
          </div>
          <div className="font-semibold text-gray-900">${avgJobValue.toFixed(2)}</div>
        </div>

        <div>
          <div className="flex items-center gap-1.5 text-gray-500">
            <Gift className="w-3.5 h-3.5" />
            <span>Est Reward</span>
          </div>
          <div className="font-semibold text-gray-900">
            ~${(epochStats.estimatedReward ?? 0).toFixed(0)}
          </div>
        </div>
      </div>
    </div>
  );
}
