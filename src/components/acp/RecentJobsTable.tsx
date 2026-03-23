"use client";

import { useState, useEffect, useCallback } from "react";
import { Briefcase, RefreshCw, ArrowUpRight, ArrowDownLeft, ExternalLink } from "lucide-react";

interface AcpJob {
  jobId: string;
  name: string;
  price: string;
  client: string;
  provider: string;
  deliverable: string;
  role: "provider" | "client";
}

interface JobsData {
  jobs: AcpJob[];
  stats: {
    total: number;
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
  const [roleFilter, setRoleFilter] = useState<"all" | "provider" | "client">("all");

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      const params = new URLSearchParams({ limit: String(limit) });
      if (roleFilter !== "all") {
        params.set("role", roleFilter);
      }
      
      const res = await fetch(`/api/acp/jobs?${params}`);
      
      if (!res.ok) {
        throw new Error(await res.text());
      }
      
      const json = await res.json();
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch");
    } finally {
      setLoading(false);
    }
  }, [limit, roleFilter]);

  useEffect(() => {
    fetchJobs();
  }, [roleFilter, fetchJobs]);

  const truncateAddress = (addr: string) => {
    if (!addr || addr.length < 12) return addr;
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200">
      <div className="p-4 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Briefcase className="w-5 h-5 text-blue-600" />
            <h3 className="font-semibold text-gray-900">Recent Jobs</h3>
            {data && (
              <span className="text-xs text-gray-500">
                ({data.stats.total} shown)
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value as "all" | "provider" | "client")}
              className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Jobs</option>
              <option value="provider">As Provider</option>
              <option value="client">As Client</option>
            </select>
            <button
              onClick={fetchJobs}
              disabled={loading}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        {data && (
          <div className="flex gap-4 mt-3 text-xs">
            <div className="flex items-center gap-1.5 text-green-700">
              <ArrowDownLeft className="w-3.5 h-3.5" />
              Revenue: ${data.stats.revenueUsdc.toFixed(2)}
            </div>
            <div className="flex items-center gap-1.5 text-red-700">
              <ArrowUpRight className="w-3.5 h-3.5" />
              Spent: ${data.stats.spentUsdc.toFixed(2)}
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="p-4 text-sm text-red-600 bg-red-50">
          {error}
        </div>
      )}

      {loading && !data ? (
        <div className="p-4 space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="animate-pulse flex items-center gap-4">
              <div className="h-4 bg-gray-200 rounded w-20"></div>
              <div className="h-4 bg-gray-200 rounded w-32"></div>
              <div className="h-4 bg-gray-200 rounded w-16"></div>
            </div>
          ))}
        </div>
      ) : data && data.jobs.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Job</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Offering</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Price</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Role</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Counterparty</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {data.jobs.map((job) => (
                <tr key={job.jobId} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5">
                    <a
                      href={`https://app.virtuals.io/acp/jobs/${job.jobId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-xs text-blue-600 hover:underline flex items-center gap-1"
                    >
                      {job.jobId}
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </td>
                  <td className="px-4 py-2.5 font-medium text-gray-900">{job.name}</td>
                  <td className="px-4 py-2.5 font-mono text-gray-700">{job.price}</td>
                  <td className="px-4 py-2.5">
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs ${
                        job.role === "provider"
                          ? "bg-green-50 text-green-700"
                          : "bg-blue-50 text-blue-700"
                      }`}
                    >
                      {job.role === "provider" ? (
                        <>
                          <ArrowDownLeft className="w-3 h-3" />
                          Provider
                        </>
                      ) : (
                        <>
                          <ArrowUpRight className="w-3 h-3" />
                          Client
                        </>
                      )}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-gray-500">
                    {truncateAddress(job.role === "provider" ? job.client : job.provider)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : data ? (
        <div className="p-8 text-center text-gray-400">
          No jobs found
        </div>
      ) : null}
    </div>
  );
}
