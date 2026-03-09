"use client";

import { Target, DollarSign, TrendingUp, CheckCircle, XCircle } from "lucide-react";
import { AcpProgressBar } from "./AcpProgressBar";

interface EpochGoals {
  targetJobs?: number | null;
  targetRevenue?: number | null;
  targetRank?: number | null;
}

interface CurrentProgress {
  jobs: number;
  revenue: number;
  rank?: number | null;
}

interface AcpGoalsCardProps {
  goals: EpochGoals;
  progress: CurrentProgress;
  epochNumber?: number;
}

export function AcpGoalsCard({ goals, progress, epochNumber }: AcpGoalsCardProps) {
  const jobsProgress = goals.targetJobs
    ? Math.min(100, (progress.jobs / goals.targetJobs) * 100)
    : 0;

  const revenueProgress = goals.targetRevenue
    ? Math.min(100, (progress.revenue / goals.targetRevenue) * 100)
    : 0;

  const rankMet = goals.targetRank && progress.rank
    ? progress.rank <= goals.targetRank
    : null;

  const formatCurrency = (value: number) => `$${value.toFixed(2)}`;

  const hasGoals = goals.targetJobs || goals.targetRevenue || goals.targetRank;

  if (!hasGoals) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="flex items-center gap-2 mb-2">
          <Target className="w-4 h-4 text-gray-400" />
          <h4 className="text-sm font-medium text-gray-900">Epoch Goals</h4>
        </div>
        <p className="text-sm text-gray-500">No goals set for this epoch</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Target className="w-4 h-4 text-blue-600" />
          <h4 className="text-sm font-medium text-gray-900">Epoch Goals</h4>
        </div>
        {epochNumber !== undefined && (
          <span className="text-xs text-gray-400">Epoch #{epochNumber}</span>
        )}
      </div>

      <div className="space-y-4">
        {/* Jobs Goal */}
        {goals.targetJobs && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-1 rounded bg-blue-50">
                  <Target className="w-3.5 h-3.5 text-blue-600" />
                </div>
                <span className="text-sm text-gray-700">Jobs Target</span>
              </div>
              <div className="text-right">
                <span className="text-sm font-medium text-gray-900">
                  {progress.jobs}
                </span>
                <span className="text-sm text-gray-400"> / {goals.targetJobs}</span>
              </div>
            </div>
            <AcpProgressBar value={jobsProgress} showPercent={false} size="sm" />
            {jobsProgress >= 100 && (
              <div className="flex items-center gap-1 text-xs text-green-600">
                <CheckCircle className="w-3 h-3" />
                Goal achieved!
              </div>
            )}
          </div>
        )}

        {/* Revenue Goal */}
        {goals.targetRevenue && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-1 rounded bg-green-50">
                  <DollarSign className="w-3.5 h-3.5 text-green-600" />
                </div>
                <span className="text-sm text-gray-700">Revenue Target</span>
              </div>
              <div className="text-right">
                <span className="text-sm font-medium text-gray-900">
                  {formatCurrency(progress.revenue)}
                </span>
                <span className="text-sm text-gray-400">
                  {" "}/ {formatCurrency(goals.targetRevenue)}
                </span>
              </div>
            </div>
            <AcpProgressBar value={revenueProgress} showPercent={false} size="sm" />
            {revenueProgress >= 100 && (
              <div className="flex items-center gap-1 text-xs text-green-600">
                <CheckCircle className="w-3 h-3" />
                Goal achieved!
              </div>
            )}
          </div>
        )}

        {/* Rank Goal */}
        {goals.targetRank && (
          <div className="flex items-center justify-between py-2 border-t border-gray-100 mt-2">
            <div className="flex items-center gap-2">
              <div className="p-1 rounded bg-purple-50">
                <TrendingUp className="w-3.5 h-3.5 text-purple-600" />
              </div>
              <span className="text-sm text-gray-700">Rank Target</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-900">
                #{progress.rank ?? "—"}
              </span>
              <span className="text-sm text-gray-400">
                / Top {goals.targetRank}
              </span>
              {rankMet !== null && (
                rankMet ? (
                  <CheckCircle className="w-4 h-4 text-green-500" />
                ) : (
                  <XCircle className="w-4 h-4 text-red-400" />
                )
              )}
            </div>
          </div>
        )}
      </div>

      {/* Overall status */}
      <div className="mt-4 pt-3 border-t border-gray-100">
        {jobsProgress >= 100 && revenueProgress >= 100 && (rankMet === null || rankMet) ? (
          <div className="flex items-center justify-center gap-2 py-2 bg-green-50 rounded-lg text-green-700 text-sm font-medium">
            <CheckCircle className="w-4 h-4" />
            All goals achieved!
          </div>
        ) : (
          <div className="text-center text-xs text-gray-500">
            {Math.round((jobsProgress + revenueProgress) / 2)}% overall progress
          </div>
        )}
      </div>
    </div>
  );
}
