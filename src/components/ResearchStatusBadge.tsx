"use client";

import { useState } from "react";
import Link from "next/link";
import { FileSearch, Loader2 } from "lucide-react";

interface ResearchStatus {
  lastResearchDate: string;
  reportId: number;
}

interface ResearchStatusBadgeProps {
  ticker: string;
  status: ResearchStatus | null;
  compact?: boolean;
  onResearchTriggered?: () => void;
}

export function ResearchStatusBadge({
  ticker,
  status,
  compact = false,
  onResearchTriggered,
}: ResearchStatusBadgeProps) {
  const [triggering, setTriggering] = useState(false);
  const [triggered, setTriggered] = useState(false);

  const formatDate = (dateStr: string) => {
    // DB stores UTC without 'Z' suffix - append it for correct parsing
    const utcTimestamp = dateStr.endsWith("Z") ? dateStr : dateStr + "Z";
    const date = new Date(utcTimestamp);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  };

  const triggerResearch = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (triggering || triggered) return;

    setTriggering(true);
    try {
      const res = await fetch("/api/markets/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker: ticker.toUpperCase() }),
      });

      if (res.ok) {
        setTriggered(true);
        onResearchTriggered?.();
        // Reset after 3s
        setTimeout(() => setTriggered(false), 3000);
      }
    } catch {
      // Ignore errors
    } finally {
      setTriggering(false);
    }
  };

  // Has existing research
  if (status) {
    const daysSinceReport = Math.floor(
      (Date.now() - new Date(status.lastResearchDate + "Z").getTime()) /
        (1000 * 60 * 60 * 24)
    );
    const isStale = daysSinceReport > 90;

    if (compact) {
      return (
        <Link
          href={`/markets/research/${ticker}`}
          className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-xs rounded ${
            isStale
              ? "bg-amber-50 text-amber-600 hover:bg-amber-100"
              : "bg-emerald-50 text-emerald-600 hover:bg-emerald-100"
          } transition-colors`}
          title={`Last research: ${formatDate(status.lastResearchDate)}${isStale ? " (stale)" : ""}`}
          onClick={(e) => e.stopPropagation()}
        >
          <FileSearch className="w-3 h-3" />
          {formatDate(status.lastResearchDate)}
        </Link>
      );
    }

    return (
      <Link
        href={`/markets/research/${ticker}`}
        className={`inline-flex items-center gap-1.5 px-2 py-1 text-xs rounded-full ${
          isStale
            ? "bg-amber-50 text-amber-600 hover:bg-amber-100"
            : "bg-emerald-50 text-emerald-600 hover:bg-emerald-100"
        } transition-colors`}
        onClick={(e) => e.stopPropagation()}
      >
        <FileSearch className="w-3.5 h-3.5" />
        <span>
          {isStale ? "⚠️ " : ""}
          {formatDate(status.lastResearchDate)}
        </span>
      </Link>
    );
  }

  // No research - show trigger button
  if (triggered) {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-xs bg-blue-50 text-blue-600 rounded">
        ✓ Queued
      </span>
    );
  }

  if (compact) {
    return (
      <button
        onClick={triggerResearch}
        disabled={triggering}
        className="inline-flex items-center gap-1 px-1.5 py-0.5 text-xs text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded transition-colors disabled:opacity-50"
        title="Generate research report"
      >
        {triggering ? (
          <Loader2 className="w-3 h-3 animate-spin" />
        ) : (
          <FileSearch className="w-3 h-3" />
        )}
      </button>
    );
  }

  return (
    <button
      onClick={triggerResearch}
      disabled={triggering}
      className="inline-flex items-center gap-1.5 px-2 py-1 text-xs text-gray-500 hover:text-emerald-600 hover:bg-emerald-50 rounded-full transition-colors disabled:opacity-50"
      title="Generate research report"
    >
      {triggering ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
      ) : (
        <>
          <FileSearch className="w-3.5 h-3.5" />
          <span>Research</span>
        </>
      )}
    </button>
  );
}
