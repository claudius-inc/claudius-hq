"use client";

interface AllocationItem {
  ticker: string;
  allocation: number;
}

interface AllocationBarProps {
  items: AllocationItem[];
  className?: string;
}

// Color palette for allocations
const COLORS = [
  "bg-emerald-500",
  "bg-blue-500",
  "bg-purple-500",
  "bg-amber-500",
  "bg-rose-500",
  "bg-cyan-500",
  "bg-indigo-500",
  "bg-orange-500",
  "bg-teal-500",
  "bg-pink-500",
];

export function AllocationBar({ items, className = "" }: AllocationBarProps) {
  const totalAllocation = items.reduce((sum, item) => sum + item.allocation, 0);
  const unallocated = Math.max(0, 100 - totalAllocation);

  // Sort by allocation descending
  const sortedItems = [...items].sort((a, b) => b.allocation - a.allocation);

  return (
    <div className={className}>
      {/* Bar */}
      <div className="h-8 flex rounded-lg overflow-hidden bg-gray-100">
        {sortedItems.map((item, idx) => {
          const width = `${item.allocation}%`;
          const color = COLORS[idx % COLORS.length];
          
          return (
            <div
              key={item.ticker}
              className={`${color} flex items-center justify-center text-white text-xs font-medium transition-all hover:opacity-90`}
              style={{ width }}
              title={`${item.ticker}: ${item.allocation}%`}
            >
              {item.allocation >= 8 && (
                <span className="truncate px-1">
                  {item.ticker} {item.allocation}%
                </span>
              )}
            </div>
          );
        })}
        {unallocated > 0 && (
          <div
            className="bg-gray-300 flex items-center justify-center text-gray-600 text-xs font-medium"
            style={{ width: `${unallocated}%` }}
            title={`Unallocated: ${unallocated}%`}
          >
            {unallocated >= 5 && (
              <span className="truncate px-1">{unallocated.toFixed(0)}%</span>
            )}
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 mt-3">
        {sortedItems.map((item, idx) => (
          <div key={item.ticker} className="flex items-center gap-1.5 text-xs">
            <div className={`w-3 h-3 rounded ${COLORS[idx % COLORS.length]}`} />
            <span className="font-medium text-gray-700">{item.ticker}</span>
            <span className="text-gray-500">{item.allocation}%</span>
          </div>
        ))}
        {unallocated > 0 && (
          <div className="flex items-center gap-1.5 text-xs">
            <div className="w-3 h-3 rounded bg-gray-300" />
            <span className="font-medium text-gray-700">Unallocated</span>
            <span className="text-gray-500">{unallocated.toFixed(0)}%</span>
          </div>
        )}
      </div>
    </div>
  );
}
