"use client";

import { useState, useEffect } from "react";
import { Loader2, CheckCircle, XCircle, Clock } from "lucide-react";

type ResearchJob = {
  id: string;
  ticker: string;
  status: "pending" | "processing" | "complete" | "failed";
  progress: number;
  error_message: string | null;
  report_id: number | null;
  created_at: string;
  updated_at: string;
};

interface ResearchJobsProps {
  initialJobs: ResearchJob[];
}

export function ResearchJobs({ initialJobs }: ResearchJobsProps) {
  const [jobs, setJobs] = useState<ResearchJob[]>(initialJobs);
  const [polling, setPolling] = useState(false);

  // Filter to only show pending/processing jobs
  const activeJobs = jobs.filter(
    (job) => job.status === "pending" || job.status === "processing"
  );

  useEffect(() => {
    // Poll for updates if there are active jobs
    if (activeJobs.length === 0) {
      setPolling(false);
      return;
    }

    setPolling(true);
    const interval = setInterval(async () => {
      try {
        const res = await fetch("/api/stocks/research");
        const data = await res.json();
        if (data.jobs) {
          setJobs(data.jobs);
          
          // If all jobs are complete, reload the page to show new reports
          const stillActive = data.jobs.filter(
            (j: ResearchJob) => j.status === "pending" || j.status === "processing"
          );
          if (stillActive.length === 0 && activeJobs.length > 0) {
            // Jobs finished, refresh to show new reports
            window.location.reload();
          }
        }
      } catch (error) {
        console.error("Failed to poll jobs:", error);
      }
    }, 5000); // Poll every 5 seconds

    return () => clearInterval(interval);
  }, [activeJobs.length]);

  if (activeJobs.length === 0) {
    return null;
  }

  const getStatusIcon = (status: ResearchJob["status"]) => {
    switch (status) {
      case "pending":
        return <Clock className="w-4 h-4 text-amber-500" />;
      case "processing":
        return <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />;
      case "complete":
        return <CheckCircle className="w-4 h-4 text-emerald-500" />;
      case "failed":
        return <XCircle className="w-4 h-4 text-red-500" />;
    }
  };

  const getStatusLabel = (status: ResearchJob["status"]) => {
    switch (status) {
      case "pending":
        return "Queued";
      case "processing":
        return "Researching...";
      case "complete":
        return "Complete";
      case "failed":
        return "Failed";
    }
  };

  const getTimeAgo = (dateStr: string) => {
    // DB stores UTC without 'Z' suffix - append it for correct parsing
    const utcDateStr = dateStr.endsWith('Z') ? dateStr : dateStr + 'Z';
    const date = new Date(utcDateStr);
    const now = new Date();
    const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
    
    if (seconds < 0) return 'just now'; // Handle clock skew
    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  };

  return (
    <div className="mb-8">
      <div className="flex items-center gap-2 mb-3">
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
          In Progress
        </h2>
        {polling && (
          <span className="flex items-center gap-1 text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
            <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse" />
            Live
          </span>
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {activeJobs.map((job) => (
          <div
            key={job.id}
            className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-lg font-bold text-gray-900">
                {job.ticker}
              </span>
              <div className="flex items-center gap-1.5">
                {getStatusIcon(job.status)}
                <span className="text-sm text-gray-600">
                  {getStatusLabel(job.status)}
                </span>
              </div>
            </div>
            
            {/* Progress bar */}
            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden mb-2">
              <div
                className={`h-full transition-all duration-500 ${
                  job.status === "processing"
                    ? "bg-blue-500"
                    : job.status === "pending"
                    ? "bg-amber-400"
                    : "bg-gray-300"
                }`}
                style={{
                  width: job.status === "pending" 
                    ? "10%" 
                    : job.status === "processing" 
                    ? `${Math.max(20, job.progress)}%`
                    : "100%",
                }}
              />
            </div>
            
            <div className="flex items-center justify-between text-xs text-gray-500">
              <span>Started {getTimeAgo(job.created_at)}</span>
              {job.progress > 0 && (
                <span>{job.progress}%</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
