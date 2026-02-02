import { Metric } from "@/lib/types";

interface MetricGroup {
  name: string;
  latest: number;
  previous: number | null;
  history: { value: number; date: string }[];
}

function Sparkline({ data }: { data: { value: number; date: string }[] }) {
  if (data.length < 2) return null;

  const points = data.slice(0, 14).reverse();
  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const width = 120;
  const height = 32;
  const padding = 2;

  const coords = values.map((v, i) => ({
    x: padding + (i / (values.length - 1)) * (width - padding * 2),
    y: padding + (1 - (v - min) / range) * (height - padding * 2),
  }));

  const pathD = coords
    .map((c, i) => `${i === 0 ? "M" : "L"} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`)
    .join(" ");

  // Fill area under the line
  const fillD = `${pathD} L ${coords[coords.length - 1].x.toFixed(1)} ${height} L ${coords[0].x.toFixed(1)} ${height} Z`;

  const isUp = values[values.length - 1] >= values[0];

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="mt-2"
      aria-label="Sparkline chart"
    >
      <defs>
        <linearGradient id={`grad-${isUp ? "up" : "down"}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={isUp ? "#10b981" : "#ef4444"} stopOpacity="0.3" />
          <stop offset="100%" stopColor={isUp ? "#10b981" : "#ef4444"} stopOpacity="0.05" />
        </linearGradient>
      </defs>
      <path
        d={fillD}
        fill={`url(#grad-${isUp ? "up" : "down"})`}
      />
      <path
        d={pathD}
        fill="none"
        stroke={isUp ? "#10b981" : "#ef4444"}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Endpoint dot */}
      <circle
        cx={coords[coords.length - 1].x}
        cy={coords[coords.length - 1].y}
        r="2"
        fill={isUp ? "#10b981" : "#ef4444"}
      />
    </svg>
  );
}

function TrendIndicator({ delta, pctChange }: { delta: number; pctChange: string | null }) {
  const arrow = delta > 0 ? "↑" : delta < 0 ? "↓" : "→";
  const color = delta > 0 ? "text-emerald-600" : delta < 0 ? "text-red-500" : "text-gray-400";

  return (
    <div className={`text-xs mt-1 flex items-center gap-1 ${color}`}>
      <span className="font-medium">{arrow}</span>
      <span>{Math.abs(delta).toLocaleString()}</span>
      {pctChange && (
        <span className="text-gray-400">
          ({delta >= 0 ? "+" : ""}{pctChange}%)
        </span>
      )}
    </div>
  );
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
        const pctChange =
          g.previous !== null && g.previous !== 0
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
              <TrendIndicator delta={delta} pctChange={pctChange} />
            )}
            {g.history.length > 1 && <Sparkline data={g.history} />}
          </div>
        );
      })}
    </div>
  );
}

function formatValue(value: number, name: string): string {
  if (
    name.includes("revenue") ||
    name.includes("mrr") ||
    name.includes("arr")
  ) {
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
