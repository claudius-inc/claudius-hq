"use client";

interface SkeletonProps {
  className?: string;
  style?: React.CSSProperties;
}

function Skeleton({ className = "", style }: SkeletonProps) {
  return (
    <div
      className={`animate-pulse bg-gray-200 rounded ${className}`}
      style={style}
    />
  );
}

interface AcpLoadingSkeletonProps {
  variant: "card" | "table-row" | "chart" | "list-item";
  count?: number;
}

export function AcpLoadingSkeleton({ variant, count = 1 }: AcpLoadingSkeletonProps) {
  const items = Array.from({ length: count }, (_, i) => i);

  if (variant === "card") {
    return (
      <>
        {items.map((i) => (
          <div key={i} className="bg-white rounded-lg border border-gray-200 p-4 space-y-3">
            {/* Header */}
            <div className="flex items-center justify-between">
              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
            {/* Content */}
            <div className="space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
            </div>
            {/* Footer */}
            <div className="flex items-center justify-between pt-2">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-12" />
            </div>
          </div>
        ))}
      </>
    );
  }

  if (variant === "table-row") {
    return (
      <>
        {items.map((i) => (
          <div
            key={i}
            className="flex items-center gap-4 px-4 py-3 border-b border-gray-100"
          >
            <Skeleton className="h-4 w-4 rounded" />
            <Skeleton className="h-4 flex-1 max-w-[200px]" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-6 w-16 rounded-full" />
          </div>
        ))}
      </>
    );
  }

  if (variant === "chart") {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <Skeleton className="h-5 w-32" />
          <div className="flex gap-2">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-16" />
          </div>
        </div>
        {/* Chart area */}
        <div className="h-48 flex items-end gap-1.5">
          {Array.from({ length: 14 }, (_, i) => (
            <Skeleton
              key={i}
              className="flex-1"
              style={{ height: `${20 + Math.random() * 60}%` }}
            />
          ))}
        </div>
        {/* Footer */}
        <div className="grid grid-cols-3 gap-4 mt-4 pt-4 border-t border-gray-100">
          <div className="space-y-1">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-5 w-12" />
          </div>
          <div className="space-y-1">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-5 w-12" />
          </div>
          <div className="space-y-1">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-5 w-12" />
          </div>
        </div>
      </div>
    );
  }

  if (variant === "list-item") {
    return (
      <>
        {items.map((i) => (
          <div key={i} className="flex items-start gap-3 py-3 border-b border-gray-100 last:border-0">
            <Skeleton className="h-8 w-8 rounded-full flex-shrink-0" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
            <Skeleton className="h-4 w-16" />
          </div>
        ))}
      </>
    );
  }

  return null;
}

// Additional standalone skeleton components for flexibility
export function AcpCardSkeleton() {
  return <AcpLoadingSkeleton variant="card" />;
}

export function AcpTableRowSkeleton({ count = 5 }: { count?: number }) {
  return <AcpLoadingSkeleton variant="table-row" count={count} />;
}

export function AcpChartSkeleton() {
  return <AcpLoadingSkeleton variant="chart" />;
}

export function AcpListSkeleton({ count = 3 }: { count?: number }) {
  return <AcpLoadingSkeleton variant="list-item" count={count} />;
}
