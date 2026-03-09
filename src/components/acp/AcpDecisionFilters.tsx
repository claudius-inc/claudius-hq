"use client";

import { useState } from "react";
import { Select } from "../ui/Select";
import { Filter, X, Calendar } from "lucide-react";

type DecisionType = "pricing" | "offering_change" | "strategy_shift" | "experiment" | "";

interface DateRange {
  from: string;
  to: string;
}

interface AcpDecisionFiltersProps {
  onFilterChange: (filters: { type: DecisionType; dateRange: DateRange | null }) => void;
  initialType?: DecisionType;
  initialDateRange?: DateRange | null;
}

const typeOptions = [
  { value: "", label: "All Types" },
  { value: "pricing", label: "Pricing" },
  { value: "offering_change", label: "Offering Change" },
  { value: "strategy_shift", label: "Strategy Shift" },
  { value: "experiment", label: "Experiment" },
];

export function AcpDecisionFilters({
  onFilterChange,
  initialType = "",
  initialDateRange = null,
}: AcpDecisionFiltersProps) {
  const [type, setType] = useState<DecisionType>(initialType);
  const [dateRange, setDateRange] = useState<DateRange | null>(initialDateRange);
  const [showDatePicker, setShowDatePicker] = useState(false);

  const handleTypeChange = (newType: string) => {
    const typedValue = newType as DecisionType;
    setType(typedValue);
    onFilterChange({ type: typedValue, dateRange });
  };

  const handleDateRangeChange = (field: "from" | "to", value: string) => {
    const newRange = {
      from: field === "from" ? value : (dateRange?.from ?? ""),
      to: field === "to" ? value : (dateRange?.to ?? ""),
    };
    setDateRange(newRange);
    onFilterChange({ type, dateRange: newRange });
  };

  const clearDateRange = () => {
    setDateRange(null);
    setShowDatePicker(false);
    onFilterChange({ type, dateRange: null });
  };

  const clearAllFilters = () => {
    setType("");
    setDateRange(null);
    setShowDatePicker(false);
    onFilterChange({ type: "", dateRange: null });
  };

  const hasFilters = type !== "" || dateRange !== null;

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-3">
      <div className="flex flex-wrap items-center gap-3">
        {/* Filter icon */}
        <div className="flex items-center gap-1.5 text-gray-500">
          <Filter className="w-4 h-4" />
          <span className="text-sm font-medium">Filters</span>
        </div>

        {/* Type filter */}
        <Select
          value={type}
          onChange={handleTypeChange}
          options={typeOptions}
          className="min-w-[140px]"
        />

        {/* Date range toggle */}
        <button
          onClick={() => setShowDatePicker(!showDatePicker)}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border transition-colors ${
            dateRange
              ? "border-blue-300 bg-blue-50 text-blue-700"
              : "border-gray-300 text-gray-600 hover:border-gray-400"
          }`}
        >
          <Calendar className="w-3.5 h-3.5" />
          {dateRange ? "Date Range Set" : "Date Range"}
        </button>

        {/* Clear all */}
        {hasFilters && (
          <button
            onClick={clearAllFilters}
            className="flex items-center gap-1 px-2 py-1 text-xs text-gray-500 hover:text-gray-700 transition-colors"
          >
            <X className="w-3 h-3" />
            Clear all
          </button>
        )}
      </div>

      {/* Date range inputs */}
      {showDatePicker && (
        <div className="mt-3 pt-3 border-t border-gray-100">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-500">From</label>
              <input
                type="date"
                value={dateRange?.from ?? ""}
                onChange={(e) => handleDateRangeChange("from", e.target.value)}
                className="px-2 py-1 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-200"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-500">To</label>
              <input
                type="date"
                value={dateRange?.to ?? ""}
                onChange={(e) => handleDateRangeChange("to", e.target.value)}
                className="px-2 py-1 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-200"
              />
            </div>
            {dateRange && (
              <button
                onClick={clearDateRange}
                className="flex items-center gap-1 px-2 py-1 text-xs text-red-600 hover:text-red-700 transition-colors"
              >
                <X className="w-3 h-3" />
                Clear dates
              </button>
            )}
          </div>
        </div>
      )}

      {/* Active filters summary */}
      {hasFilters && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {type && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-gray-100 text-gray-700 rounded-full">
              Type: {typeOptions.find(o => o.value === type)?.label}
              <button onClick={() => handleTypeChange("")} className="hover:text-gray-900">
                <X className="w-3 h-3" />
              </button>
            </span>
          )}
          {dateRange && (dateRange.from || dateRange.to) && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-gray-100 text-gray-700 rounded-full">
              {dateRange.from && dateRange.to
                ? `${dateRange.from} - ${dateRange.to}`
                : dateRange.from
                  ? `From ${dateRange.from}`
                  : `Until ${dateRange.to}`}
              <button onClick={clearDateRange} className="hover:text-gray-900">
                <X className="w-3 h-3" />
              </button>
            </span>
          )}
        </div>
      )}
    </div>
  );
}
