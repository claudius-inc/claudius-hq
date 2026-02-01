import { Metric } from "@/lib/types";

interface MetricGroup {
  name: string;
  latest: number;
  previous: number | null;
  history: { value: number; date: string }[];
}

export function MetricsDisplay({ metrics }: { metrics: Metric[] }) {
  if (metrics.length === 0) {
    return (
      <div className="text-sm text-gray-400 text-center py-4">
        No metrics recorded yet
      </div>
    );
  }

  // Group metrics by name
  const groups: Record<string, MetricGroup> = {};
  for (const m of metrics) {
    if (!groups[m.metric_name]) {
      groups[m.metric_name] = {
        name: m.metric_name,
        latest: m.metric_value,
        previous: null,
        history: [],
      };
    }
    groups[m.metric_name].history.push({
      value: m.metric_value,
      date: m.recorded_at,
    });
  }

  // Sort history and compute previous
  for (const g of Object.values(groups)) {
    g.history.sort((a, b) => b.date.localeCompare(a.date));
    g.latest = g.history[0].value;
    g.previous = g.history.length > 1 ? g.history[1].value : null;
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
      {Object.values(groups).map((g) => {
        const delta = g.previous !== null ? g.latest - g.previous : null;
        const pctChange = g.previous !== null && g.previous !== 0
          ? ((delta! / g.previous) * 100).toFixed(1)
          : null;

        return (
          <div key={g.name} className="card">
            <div className="text-xs text-gray-400 uppercase tracking-wider mb-1">
              {g.name.replace(/_/g, " ")}
            </div>
            <div className="text-2xl font-bold text-gray-900">
              {formatValue(g.latest, g.name)}
            </div>
            {delta !== null && (
              <div className={`text-xs mt-1 ${delta >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                {delta >= 0 ? "↑" : "↓"} {Math.abs(delta).toLocaleString()}
                {pctChange && ` (${delta >= 0 ? "+" : ""}${pctChange}%)`}
              </div>
            )}
            {/* Mini sparkline */}
            {g.history.length > 1 && (
              <div className="mt-2 flex items-end gap-px h-6">
                {g.history
                  .slice(0, 10)
                  .reverse()
                  .map((p, i) => {
                    const max = Math.max(...g.history.slice(0, 10).map((h) => h.value));
                    const min = Math.min(...g.history.slice(0, 10).map((h) => h.value));
                    const range = max - min || 1;
                    const height = ((p.value - min) / range) * 100;
                    return (
                      <div
                        key={i}
                        className="flex-1 bg-emerald-200 rounded-sm min-h-[2px]"
                        style={{ height: `${Math.max(height, 8)}%` }}
                      />
                    );
                  })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function formatValue(value: number, name: string): string {
  if (name.includes("revenue") || name.includes("mrr") || name.includes("arr")) {
    return `$${value.toLocaleString()}`;
  }
  if (value >= 1000000) {
    return `${(value / 1000000).toFixed(1)}M`;
  }
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}K`;
  }
  return value.toLocaleString();
}
