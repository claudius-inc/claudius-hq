"use client";

import { useState } from "react";
import { Sparkles, Loader2, CheckCircle, ExternalLink } from "lucide-react";

interface GenerateReportButtonProps {
  ticker: string;
}

type Status = "idle" | "loading" | "queued" | "error";

export function GenerateReportButton({ ticker }: GenerateReportButtonProps) {
  const [status, setStatus] = useState<Status>("idle");
  const [jobId, setJobId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    setStatus("loading");
    setError(null);

    try {
      const res = await fetch("/api/stocks/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker: ticker.toUpperCase() }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to queue research");
      }

      setJobId(data.jobId);
      setStatus("queued");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setStatus("error");
    }
  };

  if (status === "queued") {
    return (
      <div className="flex flex-col items-center gap-3">
        <div className="flex items-center gap-2 text-emerald-600">
          <CheckCircle className="w-5 h-5" />
          <span className="font-medium">Research queued!</span>
        </div>
        <p className="text-sm text-gray-500 text-center max-w-xs">
          Report generation typically takes 3-5 minutes. This page will show the report once ready.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="text-sm text-emerald-600 hover:text-emerald-700 underline"
        >
          Refresh page
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <button
        onClick={handleGenerate}
        disabled={status === "loading"}
        className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {status === "loading" ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Queueing...
          </>
        ) : (
          <>
            <Sparkles className="w-4 h-4" />
            Generate Report for ${ticker}
          </>
        )}
      </button>

      {error && (
        <p className="text-sm text-red-600">{error}</p>
      )}

      <p className="text-xs text-gray-400 text-center max-w-xs">
        AI-generated Sun Tzu-style investment research. Takes 3-5 minutes.
      </p>
    </div>
  );
}
