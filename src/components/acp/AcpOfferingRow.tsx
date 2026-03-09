"use client";

import { FlaskConical, AlertTriangle, ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";

interface Offering {
  id: number;
  name: string;
  description?: string | null;
  price: number;
  category?: string | null;
  isActive?: number | null;
  jobCount?: number | null;
  totalRevenue?: number | null;
  lastJobAt?: string | null;
  createdAt?: string | null;
}

interface Experiment {
  id: number;
  name: string;
  status?: string | null;
}

interface AcpOfferingRowProps {
  offering: Offering;
  experiments?: Experiment[];
}

export function AcpOfferingRow({ offering, experiments = [] }: AcpOfferingRowProps) {
  const [expanded, setExpanded] = useState(false);
  const hasExperiments = experiments.length > 0;
  const isLowPerformer = (offering.jobCount ?? 0) < 5 && offering.lastJobAt;

  // Check if no jobs in last 7 days
  const noRecentJobs = offering.lastJobAt
    ? new Date(offering.lastJobAt) < new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    : false;

  return (
    <>
      <tr
        className={`hover:bg-gray-50 cursor-pointer ${
          expanded ? "bg-blue-50/50" : ""
        }`}
        onClick={() => setExpanded(!expanded)}
      >
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-gray-400">
              {expanded ? (
                <ChevronDown className="w-4 h-4" />
              ) : (
                <ChevronRight className="w-4 h-4" />
              )}
            </span>
            <div>
              <div className="font-medium text-gray-900">{offering.name}</div>
              <div className="text-xs text-gray-500">
                {offering.category ?? "uncategorized"}
              </div>
            </div>
            {hasExperiments && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-xs bg-green-50 text-green-700 rounded">
                <FlaskConical className="w-3 h-3" />
                A/B
              </span>
            )}
            {isLowPerformer && noRecentJobs && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-xs bg-orange-50 text-orange-700 rounded">
                <AlertTriangle className="w-3 h-3" />
                Low
              </span>
            )}
          </div>
        </td>
        <td className="px-4 py-3">
          <span className="font-mono text-gray-900">
            ${(offering.price ?? 0).toFixed(2)}
          </span>
        </td>
        <td className="px-4 py-3">
          <span className="text-gray-900">{offering.jobCount ?? 0}</span>
        </td>
        <td className="px-4 py-3">
          <span className="font-mono text-gray-900">
            ${(offering.totalRevenue ?? 0).toFixed(2)}
          </span>
        </td>
        <td className="px-4 py-3">
          <span
            className={`inline-flex px-2 py-0.5 text-xs rounded-full ${
              offering.isActive
                ? "bg-green-50 text-green-700"
                : "bg-gray-100 text-gray-500"
            }`}
          >
            {offering.isActive ? "Active" : "Inactive"}
          </span>
        </td>
      </tr>
      {expanded && (
        <tr className="bg-gray-50/50">
          <td colSpan={5} className="px-4 py-4">
            <div className="space-y-3">
              {offering.description && (
                <div className="text-sm text-gray-600">{offering.description}</div>
              )}
              <div className="flex flex-wrap gap-4 text-xs text-gray-500">
                <div>
                  <span className="font-medium">Created:</span>{" "}
                  {offering.createdAt
                    ? new Date(offering.createdAt).toLocaleDateString()
                    : "Unknown"}
                </div>
                <div>
                  <span className="font-medium">Last Job:</span>{" "}
                  {offering.lastJobAt
                    ? new Date(offering.lastJobAt).toLocaleDateString()
                    : "Never"}
                </div>
                <div>
                  <span className="font-medium">RPJ:</span>{" "}
                  $
                  {offering.jobCount && offering.totalRevenue
                    ? (offering.totalRevenue / offering.jobCount).toFixed(2)
                    : "0.00"}
                </div>
              </div>
              {hasExperiments && (
                <div className="border-t border-gray-200 pt-3 mt-3">
                  <div className="text-xs font-medium text-gray-700 mb-2">
                    Active Experiments
                  </div>
                  {experiments.map((exp) => (
                    <div
                      key={exp.id}
                      className="flex items-center gap-2 text-sm text-gray-600"
                    >
                      <FlaskConical className="w-3.5 h-3.5 text-green-600" />
                      <span>{exp.name}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
