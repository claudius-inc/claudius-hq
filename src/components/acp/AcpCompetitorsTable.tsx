"use client";

import { useState } from "react";
import { Search, TrendingUp, TrendingDown, Minus } from "lucide-react";

interface Competitor {
  id: number;
  agentName: string;
  agentWallet?: string | null;
  offeringName: string;
  price: number;
  description?: string | null;
  category?: string | null;
  jobsCount?: number | null;
  totalRevenue?: number | null;
  isActive?: number | null;
  firstSeen?: string | null;
  lastChecked?: string | null;
  notes?: string | null;
}

interface AcpCompetitorsTableProps {
  competitors: Competitor[];
  onSelect?: (competitor: Competitor) => void;
  selectedId?: number | null;
}

export function AcpCompetitorsTable({
  competitors,
  onSelect,
  selectedId,
}: AcpCompetitorsTableProps) {
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState<string>("all");

  const categories = Array.from(
    new Set(competitors.map((c) => c.category).filter(Boolean))
  ) as string[];

  const filtered = competitors.filter((c) => {
    if (
      search &&
      !c.agentName.toLowerCase().includes(search.toLowerCase()) &&
      !c.offeringName.toLowerCase().includes(search.toLowerCase())
    ) {
      return false;
    }
    if (filterCategory !== "all" && c.category !== filterCategory) {
      return false;
    }
    return true;
  });

  return (
    <div className="bg-white rounded-lg border border-gray-200">
      {/* Filters */}
      <div className="p-4 border-b border-gray-100 flex flex-wrap items-center gap-4">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search agents or offerings..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="all">All Categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <span className="text-sm text-gray-500">
          {filtered.length} competitors
        </span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                Agent / Offering
              </th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                Price
              </th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                Jobs
              </th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                Status
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-gray-400">
                  No competitors tracked
                </td>
              </tr>
            ) : (
              filtered.map((c) => (
                <tr
                  key={c.id}
                  className={`hover:bg-gray-50 cursor-pointer ${
                    selectedId === c.id ? "bg-blue-50" : ""
                  }`}
                  onClick={() => onSelect?.(c)}
                >
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">{c.agentName}</div>
                    <div className="text-xs text-gray-500">{c.offeringName}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-mono text-gray-900">
                      ${c.price.toFixed(2)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-700">
                    {c.jobsCount ?? 0}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex px-2 py-0.5 text-xs rounded-full ${
                        c.isActive
                          ? "bg-green-50 text-green-700"
                          : "bg-gray-100 text-gray-500"
                      }`}
                    >
                      {c.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
