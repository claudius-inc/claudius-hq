"use client";

interface SparklineProps {
  data: Array<{ date: string; close: number }>;
  width?: number;
  height?: number;
  positive?: boolean | null;
  className?: string;
}

export function Sparkline({ data, width = 100, height = 32, positive, className = "" }: SparklineProps) {
  if (!data || data.length < 2) {
    return (
      <div
        className={`flex items-center justify-center text-xs text-gray-400 ${className}`}
        style={{ width, height }}
      >
        —
      </div>
    );
  }

  const closes = data.map((d) => d.close);
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const range = max - min || 1;

  const padding = 1;
  const chartW = width - padding * 2;
  const chartH = height - padding * 2;

  const points = closes.map((c, i) => {
    const x = padding + (i / (closes.length - 1)) * chartW;
    const y = padding + chartH - ((c - min) / range) * chartH;
    return `${x},${y}`;
  });

  const pathD = `M ${points.join(" L ")}`;

  // Determine color from actual data trend
  const isPositive = positive ?? (closes[closes.length - 1] >= closes[0]);
  const color = isPositive ? "#059669" : "#dc2626"; // emerald-600 / red-600

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      style={{ width, height }}
      fill="none"
    >
      {/* Area fill */}
      <path
        d={`${pathD} L ${padding + chartW},${padding + chartH} L ${padding},${padding + chartH} Z`}
        fill={color}
        opacity={0.06}
      />
      {/* Line */}
      <path d={pathD} stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      {/* End dot */}
      <circle
        cx={padding + chartW}
        cy={padding + chartH - ((closes[closes.length - 1] - min) / range) * chartH}
        r={2}
        fill={color}
      />
    </svg>
  );
}
