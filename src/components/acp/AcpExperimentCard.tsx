"use client";

import { FlaskConical, Play, Square, Trophy, TrendingUp, TrendingDown } from "lucide-react";

interface ExperimentVariant {
  name: string;
  jobs: number;
  revenue: number;
  conversionRate?: number;
}

interface Experiment {
  id: number;
  name: string;
  status: "running" | "paused" | "completed";
  control: ExperimentVariant;
  variant: ExperimentVariant;
  startedAt?: string;
  endedAt?: string;
}

interface AcpExperimentCardProps {
  experiment: Experiment;
  onStop?: (id: number) => void;
  onDeclareWinner?: (id: number, winner: "control" | "variant") => void;
}

export function AcpExperimentCard({ experiment, onStop, onDeclareWinner }: AcpExperimentCardProps) {
  const { control, variant } = experiment;
  const isRunning = experiment.status === "running";

  const controlBetter = control.revenue > variant.revenue;
  const variantBetter = variant.revenue > control.revenue;

  const formatCurrency = (value: number) => `$${value.toFixed(4)}`;
  const formatPercent = (value?: number) => value !== undefined ? `${value.toFixed(1)}%` : "—";

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="p-1.5 rounded bg-orange-50">
            <FlaskConical className="w-4 h-4 text-orange-600" />
          </span>
          <div>
            <h4 className="text-sm font-medium text-gray-900">{experiment.name}</h4>
            <span
              className={`text-xs ${
                isRunning ? "text-green-600" : experiment.status === "completed" ? "text-gray-500" : "text-orange-600"
              }`}
            >
              {experiment.status.charAt(0).toUpperCase() + experiment.status.slice(1)}
            </span>
          </div>
        </div>
        {experiment.startedAt && (
          <span className="text-xs text-gray-400">
            Started {new Date(experiment.startedAt).toLocaleDateString()}
          </span>
        )}
      </div>

      {/* Variants comparison */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        {/* Control */}
        <div
          className={`p-3 rounded-lg border ${
            controlBetter ? "border-green-200 bg-green-50" : "border-gray-100 bg-gray-50"
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-gray-600">Control</span>
            {controlBetter && <TrendingUp className="w-3.5 h-3.5 text-green-600" />}
          </div>
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">Jobs</span>
              <span className="font-medium text-gray-900">{control.jobs}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">Revenue</span>
              <span className="font-medium text-gray-900">{formatCurrency(control.revenue)}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">Conv. Rate</span>
              <span className="font-medium text-gray-900">{formatPercent(control.conversionRate)}</span>
            </div>
          </div>
        </div>

        {/* Variant */}
        <div
          className={`p-3 rounded-lg border ${
            variantBetter ? "border-green-200 bg-green-50" : "border-gray-100 bg-gray-50"
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-gray-600">Variant</span>
            {variantBetter && <TrendingUp className="w-3.5 h-3.5 text-green-600" />}
          </div>
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">Jobs</span>
              <span className="font-medium text-gray-900">{variant.jobs}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">Revenue</span>
              <span className="font-medium text-gray-900">{formatCurrency(variant.revenue)}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">Conv. Rate</span>
              <span className="font-medium text-gray-900">{formatPercent(variant.conversionRate)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Difference indicator */}
      {(controlBetter || variantBetter) && (
        <div className="text-center py-2 mb-3 bg-gray-50 rounded-lg">
          <span className="text-xs text-gray-600">
            {controlBetter ? "Control" : "Variant"} is performing{" "}
            <span className="font-medium text-green-600">
              +{Math.abs(((control.revenue - variant.revenue) / Math.max(control.revenue, variant.revenue)) * 100).toFixed(1)}%
            </span>{" "}
            better
          </span>
        </div>
      )}

      {/* Actions */}
      {isRunning && (onStop || onDeclareWinner) && (
        <div className="flex items-center gap-2 pt-3 border-t border-gray-100">
          {onStop && (
            <button
              onClick={() => onStop(experiment.id)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <Square className="w-3 h-3" />
              Stop
            </button>
          )}
          {onDeclareWinner && (
            <>
              <button
                onClick={() => onDeclareWinner(experiment.id, "control")}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-green-700 bg-green-50 rounded-lg hover:bg-green-100 transition-colors"
              >
                <Trophy className="w-3 h-3" />
                Control Wins
              </button>
              <button
                onClick={() => onDeclareWinner(experiment.id, "variant")}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-green-700 bg-green-50 rounded-lg hover:bg-green-100 transition-colors"
              >
                <Trophy className="w-3 h-3" />
                Variant Wins
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
