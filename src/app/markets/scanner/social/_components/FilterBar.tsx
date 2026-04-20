"use client";

interface FilterBarProps {
  period: string | null;
  tickerFilter: string;
  onPeriodChange: (period: string | null) => void;
  onTickerFilterChange: (value: string) => void;
}

const periods = [
  { value: null, label: "All" },
  { value: "today", label: "Today" },
  { value: "week", label: "This Week" },
  { value: "month", label: "This Month" },
];

export function FilterBar({ period, tickerFilter, onPeriodChange, onTickerFilterChange }: FilterBarProps) {
  return (
    <div className="flex items-center gap-3 overflow-x-auto scrollbar-hide -mx-1 px-1">
      {/* Period pills */}
      <div className="flex items-center gap-1 bg-gray-100/80 rounded-full px-1 py-1 shrink-0">
        {periods.map((p) => (
          <button
            key={p.label}
            onClick={() => onPeriodChange(period === p.value ? null : p.value)}
            className={`min-h-[28px] px-3 text-xs rounded-full transition-all whitespace-nowrap ${
              period === p.value
                ? "bg-white text-gray-900 font-medium shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Ticker search */}
      <div className="relative flex-1 min-w-[140px]">
        <input
          type="text"
          value={tickerFilter}
          onChange={(e) => onTickerFilterChange(e.target.value.toUpperCase())}
          placeholder="Filter by ticker..."
          className="w-full px-3 py-1.5 text-xs bg-gray-100 border-0 rounded-full focus:outline-none focus:ring-2 focus:ring-emerald-500/30 placeholder:text-gray-400"
        />
        {tickerFilter && (
          <button
            onClick={() => onTickerFilterChange("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs"
          >
            Clear
          </button>
        )}
      </div>
    </div>
  );
}
