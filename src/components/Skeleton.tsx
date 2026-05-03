// Reusable skeleton components for loading states

export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div className={`animate-pulse bg-gray-200 rounded ${className}`} />
  );
}

export function SkeletonText({ lines = 1, className = "" }: { lines?: number; className?: string }) {
  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton 
          key={i} 
          className={`h-4 ${i === lines - 1 && lines > 1 ? "w-3/4" : "w-full"}`} 
        />
      ))}
    </div>
  );
}

export function SkeletonTableRow({ cols = 5 }: { cols?: number }) {
  return (
    <tr>
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-3 py-2.5">
          <Skeleton className="h-4 w-full" />
        </td>
      ))}
    </tr>
  );
}

export function SkeletonTable({ rows = 5, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <table className="min-w-full divide-y divide-gray-100">
        <thead className="bg-gray-50">
          <tr>
            {Array.from({ length: cols }).map((_, i) => (
              <th key={i} className="px-3 py-2.5">
                <Skeleton className="h-3 w-16" />
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-100">
          {Array.from({ length: rows }).map((_, i) => (
            <SkeletonTableRow key={i} cols={cols} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function SkeletonCard({ className = "" }: { className?: string }) {
  return (
    <div className={`card p-6 ${className}`}>
      <div className="space-y-4">
        <Skeleton className="h-6 w-1/3" />
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-4 w-1/2" />
      </div>
    </div>
  );
}

// Specific skeletons for stocks pages

export function ThemesTableSkeleton() {
  const thBase = "px-3 py-2.5 text-xs font-medium text-gray-500";

  return (
    <div className="space-y-6">
      {/* Tag Heatmap Skeleton */}
      <div className="space-y-1">
        {["1W", "1M", "3M"].map((p) => (
          <div key={p} className="flex items-center gap-1.5">
            <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wider w-6 flex-shrink-0">{p}</span>
            <div className="flex gap-1 overflow-hidden flex-1">
              {Array.from({ length: 14 }).map((_, i) => (
                <div key={i} className="h-6 bg-gray-100 rounded animate-pulse flex-1 min-w-0" />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Table matching ThemeLeaderboard structure */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-100">
            <thead className="bg-gray-50">
              <tr>
                <th className={`${thBase} text-left w-8`}></th>
                <th className={`${thBase} text-left`}>Theme</th>
                <th className={`${thBase} text-right`}>1W</th>
                <th className={`${thBase} text-right`}>1M</th>
                <th className={`${thBase} text-right`}>3M</th>
                <th className={`${thBase} text-center`}>Crowd</th>
                <th className={`${thBase} text-right w-12`}></th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}>
                  <td className="px-3 py-2.5">
                    <Skeleton className="h-4 w-4" />
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex flex-col gap-1">
                      <Skeleton className="h-4 w-28" />
                      <div className="flex gap-1">
                        <Skeleton className="h-3 w-10 rounded-full" />
                        <Skeleton className="h-3 w-12 rounded-full" />
                      </div>
                      <Skeleton className="h-3 w-12 mt-0.5" />
                    </div>
                  </td>
                  {["1W", "1M", "3M"].map((period) => (
                    <td key={period} className="px-3 py-2.5">
                      <div className="flex flex-col items-end gap-1">
                        <Skeleton className="h-4 w-12" />
                        <Skeleton className="h-3 w-16" />
                      </div>
                    </td>
                  ))}
                  <td className="px-3 py-2.5 text-center">
                    <Skeleton className="h-5 w-8 mx-auto rounded-full" />
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <Skeleton className="h-4 w-4 ml-auto" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export function SectorMomentumSkeleton() {
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-8 w-32" />
      </div>
      
      {/* Table */}
      <SkeletonTable rows={11} cols={10} />
      
      {/* Legend */}
      <div className="flex gap-4">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-16" />
      </div>
    </div>
  );
}

export function GlobalMarketsSkeleton() {
  const regionLabels = ["All Regions", "USA", "Americas", "Europe", "Asia Pacific", "Global"];
  const thBase = "px-3 py-2.5 text-xs font-medium text-gray-500";

  return (
    <>
      <div className="space-y-4">
        {/* Region filters */}
        <div className="flex gap-2 flex-wrap">
          {regionLabels.map((label, i) => (
            <div
              key={i}
              className={`px-3 py-1 rounded-full text-sm font-medium ${
                i === 0 ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-300"
              }`}
            >
              {label}
            </div>
          ))}
        </div>

        {/* Table matching GlobalMarketsTable structure */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-100">
              <thead className="bg-gray-50">
                <tr>
                  <th className={`${thBase} text-left w-8`}>#</th>
                  <th className={`${thBase} text-left`}>Market</th>
                  <th className={`${thBase} text-left`}>Region</th>
                  <th className={`${thBase} text-right`}>1D</th>
                  <th className={`${thBase} text-right`}>1W</th>
                  <th className={`${thBase} text-right`}>1M</th>
                  <th className={`${thBase} text-right`}>3M</th>
                  <th className={`${thBase} text-right`}>Score</th>
                  <th className={`${thBase} w-10`}></th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {Array.from({ length: 12 }).map((_, i) => (
                  <tr key={i}>
                    <td className="px-3 py-2.5"><Skeleton className="h-4 w-4" /></td>
                    <td className="px-3 py-2.5">
                      <Skeleton className="h-4 w-28 mb-1" />
                      <Skeleton className="h-3 w-10" />
                    </td>
                    <td className="px-3 py-2.5"><Skeleton className="h-5 w-16 rounded-full" /></td>
                    <td className="px-3 py-2.5"><Skeleton className="h-4 w-12 ml-auto" /></td>
                    <td className="px-3 py-2.5"><Skeleton className="h-4 w-14 ml-auto" /></td>
                    <td className="px-3 py-2.5"><Skeleton className="h-4 w-12 ml-auto" /></td>
                    <td className="px-3 py-2.5"><Skeleton className="h-4 w-12 ml-auto" /></td>
                    <td className="px-3 py-2.5"><Skeleton className="h-6 w-12 ml-auto rounded-md" /></td>
                    <td className="px-3 py-2.5"><Skeleton className="h-4 w-4" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-4 text-xs text-gray-500">
          <div className="flex items-center gap-1">
            <Skeleton className="h-3 w-3 rounded" />
            <span className="text-gray-300">Accelerating</span>
          </div>
          <div className="flex items-center gap-1">
            <Skeleton className="h-3 w-3 rounded" />
            <span className="text-gray-300">Decelerating</span>
          </div>
          <div className="flex items-center gap-1">
            <Skeleton className="h-3 w-3 rounded" />
            <span className="text-gray-300">Stable</span>
          </div>
        </div>
      </div>
    </>
  );
}

export function PortfolioSkeleton() {
  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="card p-4">
            <Skeleton className="h-4 w-24 mb-2" />
            <Skeleton className="h-8 w-32" />
          </div>
        ))}
      </div>
      
      {/* Holdings table */}
      <div>
        <Skeleton className="h-5 w-24 mb-3" />
        <SkeletonTable rows={5} cols={6} />
      </div>
    </div>
  );
}
