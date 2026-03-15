"use client";

import { useState } from "react";
import useSWR from "swr";
import { Grid3X3, AlertTriangle } from "lucide-react";
import { Skeleton } from "@/components/Skeleton";
import { Modal } from "@/components/ui/Modal";
import type { CorrelationsResponse, CorrelationAlert } from "@/lib/valuation/correlations";

const fetcher = (url: string) => fetch(url).then((r) => (r.ok ? r.json() : null));

const swrConfig = {
  refreshInterval: 4 * 60 * 60 * 1000, // 4 hours (matches cache)
  revalidateOnFocus: false,
  dedupingInterval: 60000,
};

// Asset display names
const ASSET_LABELS: Record<string, string> = {
  SPY: "S&P",
  GLD: "Gold",
  BTC: "BTC",
  TLT: "Bonds",
  DXY: "USD",
};

// Get cell color based on correlation value
function getCorrelationColor(value: number): string {
  if (value >= 0.6) return "bg-red-500 text-white";
  if (value >= 0.3) return "bg-red-300 text-red-900";
  if (value >= 0.1) return "bg-red-100 text-red-700";
  if (value >= -0.1) return "bg-gray-50 text-gray-600";
  if (value >= -0.3) return "bg-emerald-100 text-emerald-700";
  if (value >= -0.6) return "bg-emerald-300 text-emerald-900";
  return "bg-emerald-500 text-white";
}

// Format correlation value for display
function formatCorrelation(value: number): string {
  return value.toFixed(2);
}

function HeatmapCell({ value, isHeader = false }: { value: number | string; isHeader?: boolean }) {
  if (isHeader) {
    return (
      <div className="text-[10px] font-semibold text-gray-500 text-center py-1.5 px-1">
        {value}
      </div>
    );
  }

  const numValue = typeof value === "number" ? value : 0;
  const isDiagonal = numValue === 1;

  return (
    <div
      className={`text-[10px] font-medium text-center py-1.5 px-0.5 rounded-sm ${
        isDiagonal
          ? "bg-gray-200 text-gray-400"
          : getCorrelationColor(numValue)
      }`}
    >
      {isDiagonal ? "-" : formatCorrelation(numValue)}
    </div>
  );
}

function AlertBadge({ alert }: { alert: CorrelationAlert }) {
  const statusColors = {
    elevated: "bg-red-100 text-red-700 border-red-200",
    depressed: "bg-emerald-100 text-emerald-700 border-emerald-200",
    normal: "bg-gray-100 text-gray-600 border-gray-200",
  };

  const deviation = alert.correlation - alert.historical;
  const deviationStr = deviation >= 0 ? `+${deviation.toFixed(2)}` : deviation.toFixed(2);

  return (
    <div
      className={`flex items-center gap-1.5 px-2 py-1 rounded-md border text-[10px] ${statusColors[alert.status]}`}
    >
      <span className="font-medium">{alert.pair}</span>
      <span className="text-gray-400">|</span>
      <span className="tabular-nums">{formatCorrelation(alert.correlation)}</span>
      <span className="text-gray-400">vs</span>
      <span className="tabular-nums text-gray-500">{formatCorrelation(alert.historical)}</span>
      <span className={`tabular-nums ${deviation >= 0 ? "text-red-600" : "text-emerald-600"}`}>
        ({deviationStr})
      </span>
    </div>
  );
}

function CorrelationLegend() {
  return (
    <div className="flex items-center justify-center gap-1 text-[9px] text-gray-400 mt-2">
      <span className="w-3 h-2 rounded-sm bg-emerald-500"></span>
      <span>-1</span>
      <span className="w-3 h-2 rounded-sm bg-emerald-200"></span>
      <span className="w-3 h-2 rounded-sm bg-gray-100"></span>
      <span>0</span>
      <span className="w-3 h-2 rounded-sm bg-red-200"></span>
      <span className="w-3 h-2 rounded-sm bg-red-500"></span>
      <span>+1</span>
    </div>
  );
}

// Shared hook for correlation data
export function useCorrelationData() {
  return useSWR<CorrelationsResponse>(
    "/api/valuation/correlations",
    fetcher,
    swrConfig
  );
}

// Inline trigger button for embedding in RegimeStrip
export function CorrelationTrigger({ 
  onClick, 
  alertCount = 0,
  loading = false 
}: { 
  onClick: () => void; 
  alertCount?: number;
  loading?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-gray-50 hover:bg-gray-100 transition-colors text-[10px]"
      title="View Correlation Matrix"
    >
      <Grid3X3 className="w-3 h-3 text-gray-500" />
      <span className="text-gray-600 font-medium">Correlations</span>
      {loading ? (
        <Skeleton className="h-3 w-3 rounded-full" />
      ) : alertCount > 0 && (
        <span className="flex items-center gap-0.5 text-amber-600 bg-amber-50 px-1 py-0.5 rounded-full text-[9px]">
          <AlertTriangle className="w-2.5 h-2.5" />
          {alertCount}
        </span>
      )}
    </button>
  );
}

// Modal content component
export function CorrelationModalContent({ data }: { data: CorrelationsResponse | undefined }) {
  const assets = data?.matrix ? (Object.keys(data.matrix) as string[]) : [];
  const hasAlerts = data?.alerts && data.alerts.length > 0;

  if (!data?.matrix || assets.length === 0) {
    return (
      <div className="text-xs text-gray-400 text-center py-4">
        Unable to load correlation data
      </div>
    );
  }

  return (
    <>
      {/* Matrix Grid */}
      <div className="overflow-x-auto">
        <div
          className="grid gap-0.5 min-w-[200px]"
          style={{
            gridTemplateColumns: `auto repeat(${assets.length}, 1fr)`,
          }}
        >
          {/* Header row */}
          <div />
          {assets.map((asset) => (
            <HeatmapCell key={`header-${asset}`} value={ASSET_LABELS[asset] || asset} isHeader />
          ))}

          {/* Data rows */}
          {assets.map((rowAsset) => (
            <>
              <div
                key={`row-label-${rowAsset}`}
                className="text-[10px] font-semibold text-gray-500 text-right pr-1.5 py-1.5 self-center"
              >
                {ASSET_LABELS[rowAsset] || rowAsset}
              </div>
              {assets.map((colAsset) => (
                <HeatmapCell
                  key={`${rowAsset}-${colAsset}`}
                  value={data.matrix[rowAsset]?.[colAsset] ?? 0}
                />
              ))}
            </>
          ))}
        </div>
      </div>

      <CorrelationLegend />

      {/* Alerts section */}
      {hasAlerts && (
        <div className="mt-4 pt-4 border-t border-gray-100">
          <div className="text-[10px] text-gray-400 mb-2 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" />
            Unusual correlations (vs historical)
          </div>
          <div className="flex flex-wrap gap-1.5">
            {data.alerts.map((alert) => (
              <AlertBadge key={alert.pair} alert={alert} />
            ))}
          </div>
        </div>
      )}

      {/* Metadata */}
      <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between text-[10px] text-gray-400">
        <span>Period: {data.period}</span>
        <span>
          {data.status === "partial" && "(partial data)"}
        </span>
      </div>
    </>
  );
}

// Standalone card version (kept for backwards compatibility)
// Standalone modal component for use in other cards
export function CorrelationMatrixModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data, isLoading } = useCorrelationData();
  
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Correlation Matrix"
      size="md"
    >
      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-24 w-full" />
        </div>
      ) : (
        <CorrelationModalContent data={data} />
      )}
    </Modal>
  );
}

export function CorrelationMatrix() {
  const [isOpen, setIsOpen] = useState(false);
  const { data, isLoading } = useCorrelationData();

  const assets = data?.matrix ? (Object.keys(data.matrix) as string[]) : [];
  const hasAlerts = data?.alerts && data.alerts.length > 0;

  return (
    <>
      {/* Trigger Card */}
      <div className="card !p-3">
        <button
          onClick={() => setIsOpen(true)}
          className="w-full flex items-center justify-between text-left"
        >
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-md bg-gray-50">
              <Grid3X3 className="w-3.5 h-3.5 text-gray-500" />
            </div>
            <div>
              <h3 className="text-xs font-semibold text-gray-900">
                Correlation Matrix
              </h3>
              <p className="text-[10px] text-gray-400">
                {isLoading ? "Loading..." : `${assets.length} assets tracked`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {hasAlerts && (
              <span className="flex items-center gap-0.5 text-amber-600 text-[10px] bg-amber-50 px-1.5 py-0.5 rounded-full">
                <AlertTriangle className="w-3 h-3" />
                {data.alerts.length}
              </span>
            )}
            <span className="text-[10px] text-gray-400">View</span>
          </div>
        </button>
      </div>

      {/* Modal */}
      <Modal
        open={isOpen}
        onClose={() => setIsOpen(false)}
        title="Correlation Matrix"
        size="md"
      >
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-24 w-full" />
          </div>
        ) : (
          <CorrelationModalContent data={data} />
        )}
      </Modal>
    </>
  );
}
