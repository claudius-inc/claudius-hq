"use client";

import { useState, useEffect, useCallback } from "react";
import { Briefcase, RefreshCw, TrendingUp } from "lucide-react";

interface JobSummary {
  name: string;
  jobCount: number;
  totalRevenue: number;
}

interface JobsData {
  jobs: JobSummary[];
  stats: {
    total: number;
    totalJobs: number;
    asProvider: number;
    asClient: number;
    revenueUsdc: number;
    spentUsdc: number;
  };
}

interface RecentJobsTableProps {
  limit?: number;
}

export function RecentJobsTable({ limit = 15 }: RecentJobsTableProps) {
  const [data, setData] = useState<JobsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      const res = await fetch(`/api/acp/jobs?limit=${limit}`);
      
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${res.status}`);
      }
      
      const json = await res.json();
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch");
    } finally {
      setLoading(false);
    }
  }, [limit]);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  return (
    <div className="bg-white rounded-lg border border-gray-200">
      <div className="p-4 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Briefcase className="w-5 h-5 text-blue-600" />
            <h3 className="font-semibold text-gray-900">Job Stats by Offering</h3>
            {data && (
              <span className="hidden sm:inline text-xs text-gray-500">
                ({data.stats.totalJobs} total jobs)
              </span>
            )}
          </div>
          <button
            onClick={fetchJobs}
            disabled={loading}
            className="p-2.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded min-w-[44px] min-h-[44px] flex items-center justify-center"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
        
        {/* Mobile: Show job count */}
        {data && (
          <div className="sm:hidden text-xs text-gray-500 mt-1">
            {data.stats.totalJobs} total jobs
          </div>
        )}
        
        {data && data.stats.revenueUsdc > 0 && (
          <div className="mt-2 flex items-center gap-1 text-sm text-green-600">
            <TrendingUp className="w-4 h-4" />
            Total Revenue: ${data.stats.revenueUsdc.toFixed(2)} USDC
          </div>
        )}
      </div>

      {error && (
        <div className="p-4 bg-red-50 text-red-600 text-sm">
          {error}
        </div>
      )}

      {loading && !data ? (
        <div className="p-4 space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="animate-pulse flex items-center gap-4">
              <div className="h-4 bg-gray-200 rounded w-32"></div>
              <div className="h-4 bg-gray-200 rounded w-16"></div>
              <div className="h-4 bg-gray-200 rounded w-20"></div>
            </div>
          ))}
        </div>
      ) : data && data.jobs && data.jobs.length > 0 ? (
        <>
          {/* Desktop: Table view */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Offering</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Jobs</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Revenue</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Avg/Job</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {data.jobs.map((job) => (
                  <tr key={job.name} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5 font-medium text-gray-900">{job.name}</td>
                    <td className="px-4 py-2.5 text-right text-gray-700">{job.jobCount}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-green-600">
                      ${job.totalRevenue.toFixed(2)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-gray-500">
                      ${job.jobCount > 0 ? (job.totalRevenue / job.jobCount).toFixed(2) : "0.00"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile: Card view */}
          <div className="md:hidden divide-y divide-gray-100">
            {data.jobs.map((job) => (
              <div key={job.name} className="p-4">
                <div className="flex items-start justify-between mb-1">
                  <span className="font-medium text-gray-900 truncate flex-1 mr-2">{job.name}</span>
                  <span className="font-mono text-green-600 font-medium">
                    ${job.totalRevenue.toFixed(2)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm text-gray-500">
                  <span>{job.jobCount} jobs</span>
                  <span className="font-mono">
                    ${job.jobCount > 0 ? (job.totalRevenue / job.jobCount).toFixed(2) : "0.00"}/job
                  </span>
                </div>
              </div>
            ))}
          </div>
        </>
      ) : data ? (
        <div className="p-8 text-center text-gray-400">
          No jobs completed yet
        </div>
      ) : null}
    </div>
  );
}
