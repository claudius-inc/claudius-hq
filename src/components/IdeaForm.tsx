"use client";

import { useState } from "react";
import { Idea, IdeaStatus, IdeaPotential, EffortEstimate } from "@/lib/types";
import { useRouter } from "next/navigation";

interface IdeaFormProps {
  idea?: Idea;
  onClose?: () => void;
}

export function IdeaForm({ idea, onClose }: IdeaFormProps) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [formData, setFormData] = useState({
    title: idea?.title || "",
    description: idea?.description || "",
    source: idea?.source || "",
    market_notes: idea?.market_notes || "",
    effort_estimate: idea?.effort_estimate || "unknown",
    potential: idea?.potential || "unknown",
    status: idea?.status || "new",
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formData.title.trim()) {
      setError("Title is required");
      return;
    }

    setSaving(true);
    setError("");

    try {
      const res = await fetch("/api/ideas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(idea?.id ? { id: idea.id } : {}),
          ...formData,
        }),
      });

      if (res.ok) {
        router.refresh();
        if (!idea) {
          // Reset form for new ideas
          setFormData({
            title: "",
            description: "",
            source: "",
            market_notes: "",
            effort_estimate: "unknown",
            potential: "unknown",
            status: "new",
          });
        }
        onClose?.();
      } else {
        const data = await res.json();
        setError(data.error || "Failed to save idea");
      }
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Title <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={formData.title}
          onChange={(e) => setFormData({ ...formData, title: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
          placeholder="The idea in a few words"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Description
        </label>
        <textarea
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          rows={3}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
          placeholder="More details about the idea..."
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Status
          </label>
          <select
            value={formData.status}
            onChange={(e) => setFormData({ ...formData, status: e.target.value as IdeaStatus })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
          >
            <option value="new">New</option>
            <option value="researching">Researching</option>
            <option value="validated">Validated</option>
            <option value="promoted">Promoted</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Potential
          </label>
          <select
            value={formData.potential}
            onChange={(e) => setFormData({ ...formData, potential: e.target.value as IdeaPotential })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
          >
            <option value="unknown">Unknown</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="moonshot">Moonshot</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Effort
          </label>
          <select
            value={formData.effort_estimate}
            onChange={(e) => setFormData({ ...formData, effort_estimate: e.target.value as EffortEstimate })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
          >
            <option value="unknown">Unknown</option>
            <option value="tiny">Tiny (hours)</option>
            <option value="small">Small (days)</option>
            <option value="medium">Medium (1-2 weeks)</option>
            <option value="large">Large (weeks)</option>
            <option value="huge">Huge (months)</option>
          </select>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Source
        </label>
        <input
          type="text"
          value={formData.source}
          onChange={(e) => setFormData({ ...formData, source: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
          placeholder="Where did this idea come from?"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Market Notes
        </label>
        <textarea
          value={formData.market_notes}
          onChange={(e) => setFormData({ ...formData, market_notes: e.target.value })}
          rows={2}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
          placeholder="Market research, competition, etc."
        />
      </div>

      {error && (
        <div className="text-sm text-red-600 bg-red-50 p-2 rounded">
          {error}
        </div>
      )}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={saving}
          className="px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors"
        >
          {saving ? "Saving..." : idea ? "Update Idea" : "Add Idea"}
        </button>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-gray-600 text-sm font-medium hover:text-gray-900 transition-colors"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
