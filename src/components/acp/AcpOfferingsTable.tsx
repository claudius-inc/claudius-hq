"use client";

import { useState } from "react";
import { AcpOfferingRow } from "./AcpOfferingRow";
import { Search, SlidersHorizontal } from "lucide-react";

interface Offering {
  id: number;
  name: string;
  description?: string | null;
  price: number;
  category?: string | null;
  isActive?: number | null;
  jobCount?: number | null;
  totalRevenue?: number | null;
  lastJobAt?: string | null;
  createdAt?: string | null;
}

interface Experiment {
  id: number;
  offeringId?: number | null;
  name: string;
  status?: string | null;
}

interface AcpOfferingsTableProps {
  offerings: Offering[];
  experiments?: Experiment[];
}

type SortField = "name" | "price" | "jobs" | "revenue";
type SortDir = "asc" | "desc";

export function AcpOfferingsTable({
  offerings,
  experiments = [],
}: AcpOfferingsTableProps) {
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<SortField>("revenue");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [filterCategory, setFilterCategory] = useState<string>("all");

  // Get unique categories
  const categories = Array.from(
    new Set(offerings.map((o) => o.category).filter(Boolean))
  ) as string[];

  // Filter and sort
  const filtered = offerings
    .filter((o) => {
      if (search && !o.name.toLowerCase().includes(search.toLowerCase())) {
        return false;
      }
      if (filterCategory !== "all" && o.category !== filterCategory) {
        return false;
      }
      return true;
    })
    .sort((a, b) => {
      let aVal: number | string = 0;
      let bVal: number | string = 0;

      switch (sortField) {
        case "name":
          aVal = a.name;
          bVal = b.name;
          break;
        case "price":
          aVal = a.price ?? 0;
          bVal = b.price ?? 0;
          break;
        case "jobs":
          aVal = a.jobCount ?? 0;
          bVal = b.jobCount ?? 0;
          break;
        case "revenue":
          aVal = a.totalRevenue ?? 0;
          bVal = b.totalRevenue ?? 0;
          break;
      }

      if (typeof aVal === "string" && typeof bVal === "string") {
        return sortDir === "asc"
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal);
      }

      return sortDir === "asc"
        ? (aVal as number) - (bVal as number)
        : (bVal as number) - (aVal as number);
    });

  const handleSort = (field: SortField) => {
    if (field === sortField) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  };

  const SortHeader = ({
    field,
    children,
  }: {
    field: SortField;
    children: React.ReactNode;
  }) => (
    <th
      className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-700"
      onClick={() => handleSort(field)}
    >
      <span className="inline-flex items-center gap-1">
        {children}
        {sortField === field && (
          <span className="text-blue-600">{sortDir === "asc" ? "↑" : "↓"}</span>
        )}
      </span>
    </th>
  );

  return (
    <div className="bg-white rounded-lg border border-gray-200">
      {/* Filters */}
      <div className="p-4 border-b border-gray-100 space-y-3 md:space-y-0 md:flex md:items-center md:gap-4">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search offerings..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="w-4 h-4 text-gray-400" />
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
        </div>
        <div className="text-sm text-gray-500">
          {filtered.length} of {offerings.length} offerings
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <SortHeader field="name">Offering</SortHeader>
              <SortHeader field="price">Price</SortHeader>
              <SortHeader field="jobs">Jobs</SortHeader>
              <SortHeader field="revenue">Revenue</SortHeader>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                  No offerings found
                </td>
              </tr>
            ) : (
              filtered.map((offering) => {
                const offeringExperiments = experiments.filter(
                  (e) => e.offeringId === offering.id && e.status === "active"
                );
                return (
                  <AcpOfferingRow
                    key={offering.id}
                    offering={offering}
                    experiments={offeringExperiments}
                  />
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
