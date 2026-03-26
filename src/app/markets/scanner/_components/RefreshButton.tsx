"use client";

import { useState, useEffect } from "react";
import { RefreshCw, Loader2 } from "lucide-react";
import { useToast } from "@/components/ui/Toast";

interface LastRun {
  id: number;
  status: string;
  conclusion: string | null;
  createdAt: string;
  updatedAt: string;
  htmlUrl: string;
}

export function RefreshButton() {
  const [loading, setLoading] = useState(false);
  const [lastRun, setLastRun] = useState<LastRun | null>(null);
  const { toast } = useToast();

  const fetchStatus = async () => {
    try {
      const res = await fetch("/api/scanner/trigger");
      const data = await res.json();
      if (data.lastRun) {
        setLastRun(data.lastRun);
      }
    } catch (error) {
      console.error("Failed to fetch status:", error);
    }
  };

  useEffect(() => {
    fetchStatus();
    // Poll every 30s if a run is in progress
    const interval = setInterval(() => {
      if (lastRun?.status === "in_progress" || lastRun?.status === "queued") {
        fetchStatus();
      }
    }, 30000);
    return () => clearInterval(interval);
  }, [lastRun?.status]);

  const triggerRefresh = async () => {
    setLoading(true);

    try {
      const res = await fetch("/api/scanner/trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markets: "US,SGX,HK,JP" }),
      });

      const data = await res.json();

      if (data.success) {
        toast("Scanner started! Results in ~15 min.", "success");
        // Refresh status after a short delay
        setTimeout(fetchStatus, 3000);
      } else {
        toast(data.error || "Failed to trigger scanner", "error");
      }
    } catch (error) {
      toast("Failed to trigger scanner", "error");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const isRunning = lastRun?.status === "in_progress" || lastRun?.status === "queued";
  const isDisabled = loading || isRunning;

  return (
    <button
      onClick={triggerRefresh}
      disabled={isDisabled}
      className="flex items-center justify-center gap-1.5 px-2 sm:px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors min-w-[36px]"
      title={isRunning ? "Scanner running..." : loading ? "Starting..." : "Refresh scanner data"}
    >
      {isRunning ? (
        <>
          <RefreshCw size={14} className="animate-spin" />
          <span className="hidden sm:inline">Running</span>
        </>
      ) : loading ? (
        <>
          <Loader2 size={14} className="animate-spin" />
          <span className="hidden sm:inline">Starting...</span>
        </>
      ) : (
        <>
          <RefreshCw size={14} />
          <span className="hidden sm:inline">Refresh</span>
        </>
      )}
    </button>
  );
}
