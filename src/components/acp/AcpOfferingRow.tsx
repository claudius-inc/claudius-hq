"use client";

import { AlertTriangle, ChevronDown, ChevronRight, Pencil, Loader2 } from "lucide-react";
import { useState } from "react";
import { OfferingTestPanel, SUPPORTED_OFFERINGS } from "./OfferingTestPanel";
import { EditOfferingModal } from "./EditOfferingModal";

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

interface AcpOfferingRowProps {
  offering: Offering;
  apiKey?: string;
  onToggled?: () => void;
}

export function AcpOfferingRow({ offering, apiKey = "", onToggled }: AcpOfferingRowProps) {
  const [expanded, setExpanded] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [localIsActive, setLocalIsActive] = useState(!!offering.isActive);
  
  const hasTestApi = SUPPORTED_OFFERINGS.includes(offering.name);
  const isLowPerformer = (offering.jobCount ?? 0) < 5 && offering.lastJobAt;

  const noRecentJobs = offering.lastJobAt
    ? new Date(offering.lastJobAt) < new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    : false;

  const handleToggle = async (e: React.MouseEvent) => {
    e.stopPropagation();
    
    if (!apiKey) {
      alert("Please enter API key first");
      return;
    }

    setToggling(true);

    try {
      const endpoint = localIsActive
        ? "/api/acp/offerings/unpublish"
        : "/api/acp/offerings/publish";

      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: offering.name }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to toggle");
      }

      setLocalIsActive(!localIsActive);
      onToggled?.();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to toggle offering");
    } finally {
      setToggling(false);
    }
  };

  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!apiKey) {
      alert("Please enter API key first");
      return;
    }
    setEditModalOpen(true);
  };

  return (
    <>
      <tr
        className={`hover:bg-gray-50 cursor-pointer ${expanded ? "bg-blue-50/50" : ""}`}
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
          <div className="flex items-center gap-2">
            {/* Toggle Switch */}
            <button
              onClick={handleToggle}
              disabled={toggling || !apiKey}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                localIsActive ? "bg-green-500" : "bg-gray-200"
              } ${(!apiKey || toggling) ? "opacity-50 cursor-not-allowed" : ""}`}
            >
              {toggling ? (
                <span className="absolute inset-0 flex items-center justify-center">
                  <Loader2 className="w-3 h-3 animate-spin text-white" />
                </span>
              ) : (
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${
                    localIsActive ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              )}
            </button>

            {/* Edit Button */}
            <button
              onClick={handleEdit}
              disabled={!apiKey}
              className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title="Edit offering"
            >
              <Pencil className="w-4 h-4" />
            </button>
          </div>
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
              {hasTestApi && (
                <OfferingTestPanel offeringName={offering.name} apiKey={apiKey} />
              )}
            </div>
          </td>
        </tr>
      )}

      <EditOfferingModal
        offering={offering}
        apiKey={apiKey}
        isOpen={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        onSaved={() => {
          onToggled?.();
        }}
      />
    </>
  );
}
