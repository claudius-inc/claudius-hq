"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface PromoteButtonProps {
  ideaId: number;
  ideaTitle: string;
}

export function PromoteButton({ ideaId, ideaTitle }: PromoteButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handlePromote() {
    if (!confirm(`Promote "${ideaTitle}" to a new project?`)) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/ideas/promote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idea_id: ideaId }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to promote");
        return;
      }

      const projectId = data.project?.id;
      if (projectId) {
        router.push(`/projects/${projectId}`);
      } else {
        router.refresh();
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-2">
      <button
        onClick={handlePromote}
        disabled={loading}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-purple-100 text-purple-700 hover:bg-purple-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? (
          <>
            <span className="animate-spin">⏳</span>
            Promoting…
          </>
        ) : (
          <>
            🚀 Promote to Project
          </>
        )}
      </button>
      {error && (
        <p className="text-xs text-red-500 mt-1">{error}</p>
      )}
    </div>
  );
}
