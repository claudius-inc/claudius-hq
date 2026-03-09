"use client";

import { X, ExternalLink } from "lucide-react";

interface Competitor {
  id: number;
  agentName: string;
  agentWallet?: string | null;
  offeringName: string;
  price: number;
  description?: string | null;
  category?: string | null;
  jobsCount?: number | null;
  totalRevenue?: number | null;
  isActive?: number | null;
  firstSeen?: string | null;
  lastChecked?: string | null;
  notes?: string | null;
}

interface AcpCompetitorDetailProps {
  competitor: Competitor;
  onClose?: () => void;
}

export function AcpCompetitorDetail({
  competitor,
  onClose,
}: AcpCompetitorDetailProps) {
  const estimatedRevenue = (competitor.jobsCount ?? 0) * competitor.price;

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="font-semibold text-gray-900">{competitor.agentName}</h3>
          <div className="text-sm text-gray-500">{competitor.offeringName}</div>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <div className="text-xs text-gray-500">Price</div>
          <div className="font-mono text-lg text-gray-900">
            ${competitor.price.toFixed(2)}
          </div>
        </div>
        <div>
          <div className="text-xs text-gray-500">Jobs</div>
          <div className="text-lg text-gray-900">{competitor.jobsCount ?? 0}</div>
        </div>
        <div>
          <div className="text-xs text-gray-500">Est. Revenue</div>
          <div className="font-mono text-gray-900">${estimatedRevenue.toFixed(2)}</div>
        </div>
        <div>
          <div className="text-xs text-gray-500">Category</div>
          <div className="text-gray-900">{competitor.category ?? "—"}</div>
        </div>
      </div>

      {competitor.description && (
        <div className="mb-4">
          <div className="text-xs text-gray-500 mb-1">Description</div>
          <div className="text-sm text-gray-700">{competitor.description}</div>
        </div>
      )}

      <div className="flex flex-wrap gap-4 text-xs text-gray-500 border-t border-gray-100 pt-3">
        <div>
          <span className="font-medium">First Seen:</span>{" "}
          {competitor.firstSeen
            ? new Date(competitor.firstSeen).toLocaleDateString()
            : "Unknown"}
        </div>
        <div>
          <span className="font-medium">Last Checked:</span>{" "}
          {competitor.lastChecked
            ? new Date(competitor.lastChecked).toLocaleDateString()
            : "Never"}
        </div>
      </div>

      {competitor.notes && (
        <div className="mt-3 p-2 bg-yellow-50 rounded text-sm text-yellow-800">
          {competitor.notes}
        </div>
      )}

      {competitor.agentWallet && (
        <div className="mt-3">
          <a
            href={`https://basescan.org/address/${competitor.agentWallet}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800"
          >
            View on BaseScan
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      )}
    </div>
  );
}
