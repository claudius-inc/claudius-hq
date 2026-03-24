"use client";

import { useState, useEffect } from "react";
import { RefreshCw, ExternalLink, Clock, CheckCircle, XCircle, Loader2 } from "lucide-react";

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
  const [message, setMessage] = useState<string | null>(null);

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
    setMessage(null);

    try {
      const res = await fetch("/api/scanner/trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markets: "US,SGX,HK" }),
      });

      const data = await res.json();

      if (data.success) {
        setMessage("Scanner triggered! Results in ~15 min.");
        // Refresh status after a short delay
        setTimeout(fetchStatus, 3000);
      } else {
        setMessage(data.error || "Failed to trigger");
      }
    } catch (error) {
      setMessage("Failed to trigger scanner");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return "just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return date.toLocaleDateString();
  };

  const getStatusIcon = () => {
    if (!lastRun) return null;
    
    if (lastRun.status === "in_progress" || lastRun.status === "queued") {
      return <Loader2 size={14} className="animate-spin text-yellow-500" />;
    }
    if (lastRun.conclusion === "success") {
      return <CheckCircle size={14} className="text-green-500" />;
    }
    if (lastRun.conclusion === "failure") {
      return <XCircle size={14} className="text-red-500" />;
    }
    return <Clock size={14} className="text-gray-400" />;
  };

  const isRunning = lastRun?.status === "in_progress" || lastRun?.status === "queued";

  return (
    <div className="flex items-center gap-3">
      {/* Last run status */}
      {lastRun && (
        <a
          href={lastRun.htmlUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700"
        >
          {getStatusIcon()}
          <span>
            {isRunning ? "Running..." : `Updated ${formatTime(lastRun.updatedAt)}`}
          </span>
          <ExternalLink size={12} />
        </a>
      )}

      {/* Refresh button */}
      <button
        onClick={triggerRefresh}
        disabled={loading || isRunning}
        className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
        {loading ? "Triggering..." : isRunning ? "Running..." : "Refresh Now"}
      </button>

      {/* Message */}
      {message && (
        <span className="text-xs text-gray-600">{message}</span>
      )}
    </div>
  );
}
