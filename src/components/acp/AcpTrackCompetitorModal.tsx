"use client";

import { useState, useEffect } from "react";
import { Modal } from "../ui/Modal";
import { UserPlus, AlertCircle } from "lucide-react";

interface AcpTrackCompetitorModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (competitor: { agentName: string; offering: string; price: number }) => void;
  isLoading?: boolean;
}

export function AcpTrackCompetitorModal({ open, onClose, onSubmit, isLoading }: AcpTrackCompetitorModalProps) {
  const [agentName, setAgentName] = useState("");
  const [offering, setOffering] = useState("");
  const [price, setPrice] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setAgentName("");
      setOffering("");
      setPrice("");
      setError(null);
    }
  }, [open]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!agentName.trim()) {
      setError("Agent name is required");
      return;
    }

    if (!offering.trim()) {
      setError("Offering name is required");
      return;
    }

    const priceNum = parseFloat(price);
    if (isNaN(priceNum) || priceNum < 0) {
      setError("Please enter a valid price");
      return;
    }

    onSubmit({
      agentName: agentName.trim(),
      offering: offering.trim(),
      price: priceNum,
    });
  };

  return (
    <Modal open={open} onClose={onClose} title="Track Competitor">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="flex items-center gap-2 p-3 bg-red-50 rounded-lg text-red-700 text-sm">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {error}
          </div>
        )}

        {/* Agent Name */}
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-gray-700">Agent Name</label>
          <input
            type="text"
            value={agentName}
            onChange={(e) => setAgentName(e.target.value)}
            placeholder="e.g., CompetitorBot"
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-200 focus:border-gray-400"
          />
          <p className="text-xs text-gray-500">The agent&apos;s name on the marketplace</p>
        </div>

        {/* Offering */}
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-gray-700">Offering</label>
          <input
            type="text"
            value={offering}
            onChange={(e) => setOffering(e.target.value)}
            placeholder="e.g., Image Generation"
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-200 focus:border-gray-400"
          />
          <p className="text-xs text-gray-500">The specific service they offer</p>
        </div>

        {/* Price */}
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-gray-700">Current Price (VIRTUAL)</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
            <input
              type="number"
              step="0.0001"
              min="0"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="0.0050"
              className="w-full pl-7 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-200 focus:border-gray-400"
            />
          </div>
          <p className="text-xs text-gray-500">Their current price per job</p>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isLoading}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-gray-900 rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <UserPlus className="w-4 h-4" />
            {isLoading ? "Adding..." : "Track Competitor"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
