"use client";

import { useState, useCallback } from "react";
import { StockReport } from "@/lib/types";
import { ResearchJobs } from "./ResearchJobs";
import { StockFilters } from "./StockFilters";
import type { ResearchJob } from "@/db/schema";

interface ResearchContentProps {
  initialReports: StockReport[];
  initialJobs: ResearchJob[];
}

export function ResearchContent({ initialReports, initialJobs }: ResearchContentProps) {
  const [reports, setReports] = useState<StockReport[]>(initialReports);

  const refreshReports = useCallback(async () => {
    try {
      const res = await fetch("/api/stocks/reports");
      const data = await res.json();
      if (data.reports) {
        setReports(data.reports);
      }
    } catch (error) {
      console.error("Failed to refresh reports:", error);
    }
  }, []);

  return (
    <>
      {/* In Progress Jobs */}
      <ResearchJobs initialJobs={initialJobs} onJobsComplete={refreshReports} />

      {/* Filtered Reports */}
      {reports.length > 0 ? (
        <StockFilters reports={reports} />
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl p-12 text-center">
          <div className="text-4xl mb-3"></div>
          <h3 className="text-lg font-semibold text-gray-900 mb-1">
            No reports yet
          </h3>
          <p className="text-sm text-gray-500">
            Enter a ticker above to queue research, or add reports via the API
          </p>
        </div>
      )}
    </>
  );
}
