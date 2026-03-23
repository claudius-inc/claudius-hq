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
  onToggled?: () => void;
  layout?: "table" | "card";
}

export function AcpOfferingRow({ offering, onToggled, layout = "table" }: AcpOfferingRowProps) {
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
    setToggling(true);

    try {
      const endpoint = localIsActive
        ? "/api/acp/offerings/unpublish"
        : "/api/acp/offerings/publish";

      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
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
    setEditModalOpen(true);
  };

  // Toggle Switch Component (reusable)
  const ToggleSwitch = () => (
    <button
      onClick={handleToggle}
      disabled={toggling}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 min-w-[44px] min-h-[44px] ${
        localIsActive ? "bg-green-500" : "bg-gray-200"
      } ${toggling ? "opacity-50 cursor-not-allowed" : ""}`}
      style={{ padding: "9px" }}
    >
      <span className="sr-only">{localIsActive ? "Disable" : "Enable"} offering</span>
      <span className="relative inline-flex h-6 w-11 items-center">
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
      </span>
    </button>
  );

  // Edit Button Component (reusable)
  const EditButton = () => (
    <button
      onClick={handleEdit}
      className="p-2.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
      title="Edit offering"
    >
      <Pencil className="w-4 h-4" />
    </button>
  );

  // Expanded Details Component (reusable)
  const ExpandedDetails = () => (
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
        <OfferingTestPanel offeringName={offering.name} />
      )}
    </div>
  );

  // Low Performer Badge
  const LowPerformerBadge = () =>
    isLowPerformer && noRecentJobs ? (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-xs bg-orange-50 text-orange-700 rounded">
        <AlertTriangle className="w-3 h-3" />
        Low
      </span>
    ) : null;

  // Card Layout for Mobile
  if (layout === "card") {
    return (
      <>
        <div
          className={`p-4 active:bg-gray-50 cursor-pointer ${expanded ? "bg-blue-50/50" : ""}`}
          onClick={() => setExpanded(!expanded)}
        >
          {/* Top row: Name + Actions */}
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <span className="text-gray-400 flex-shrink-0">
                {expanded ? (
                  <ChevronDown className="w-4 h-4" />
                ) : (
                  <ChevronRight className="w-4 h-4" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <div className="font-medium text-gray-900 truncate">{offering.name}</div>
                <div className="text-xs text-gray-500 flex items-center gap-2 mt-0.5">
                  <span>{offering.category ?? "uncategorized"}</span>
                  <LowPerformerBadge />
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <ToggleSwitch />
              <EditButton />
            </div>
          </div>

          {/* Bottom row: Price + Stats */}
          <div className="flex items-center justify-between pl-6 text-sm">
            <span className="font-mono text-gray-900">
              ${(offering.price ?? 0).toFixed(2)}
            </span>
            <div className="text-gray-500">
              <span>{offering.jobCount ?? 0} jobs</span>
              <span className="mx-1.5">•</span>
              <span className="font-mono text-green-600">
                ${(offering.totalRevenue ?? 0).toFixed(2)}
              </span>
            </div>
          </div>

          {/* Expanded Details */}
          {expanded && (
            <div className="mt-4 pt-4 border-t border-gray-100 pl-6">
              <ExpandedDetails />
            </div>
          )}
        </div>

        <EditOfferingModal
          offering={offering}
          isOpen={editModalOpen}
          onClose={() => setEditModalOpen(false)}
          onSaved={() => {
            onToggled?.();
          }}
        />
      </>
    );
  }

  // Table Layout for Desktop
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
            <LowPerformerBadge />
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
          <div className="flex items-center gap-1">
            <ToggleSwitch />
            <EditButton />
          </div>
        </td>
      </tr>
      {expanded && (
        <tr className="bg-gray-50/50">
          <td colSpan={5} className="px-4 py-4">
            <ExpandedDetails />
          </td>
        </tr>
      )}

      <EditOfferingModal
        offering={offering}
        isOpen={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        onSaved={() => {
          onToggled?.();
        }}
      />
    </>
  );
}
