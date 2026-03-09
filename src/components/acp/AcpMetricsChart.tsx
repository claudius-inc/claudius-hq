"use client";

import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { TrendingUp, DollarSign } from "lucide-react";

interface DailyMetric {
  date: string;
  jobs: number;
  revenue: number;
}

interface AcpMetricsChartProps {
  data: DailyMetric[];
  showJobs?: boolean;
  showRevenue?: boolean;
}

export function AcpMetricsChart({ data, showJobs = true, showRevenue = true }: AcpMetricsChartProps) {
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  const formatCurrency = (value: number) => `$${value.toFixed(2)}`;

  const totalJobs = data.reduce((sum, d) => sum + d.jobs, 0);
  const totalRevenue = data.reduce((sum, d) => sum + d.revenue, 0);

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-4">
        <h4 className="text-sm font-medium text-gray-900">14-Day Performance</h4>
        <div className="flex items-center gap-4 text-xs text-gray-500">
          {showJobs && (
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-blue-500" />
              Jobs: {totalJobs}
            </span>
          )}
          {showRevenue && (
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-green-500" />
              Revenue: {formatCurrency(totalRevenue)}
            </span>
          )}
        </div>
      </div>

      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
            <XAxis
              dataKey="date"
              tickFormatter={formatDate}
              tick={{ fontSize: 11, fill: "#9ca3af" }}
              axisLine={{ stroke: "#e5e7eb" }}
              tickLine={false}
            />
            <YAxis
              yAxisId="left"
              tick={{ fontSize: 11, fill: "#9ca3af" }}
              axisLine={false}
              tickLine={false}
              width={30}
            />
            {showRevenue && (
              <YAxis
                yAxisId="right"
                orientation="right"
                tick={{ fontSize: 11, fill: "#9ca3af" }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => `$${v}`}
                width={40}
              />
            )}
            <Tooltip
              contentStyle={{
                backgroundColor: "#fff",
                border: "1px solid #e5e7eb",
                borderRadius: "8px",
                fontSize: "12px",
              }}
              formatter={(value, name) => [
                name === "revenue" ? formatCurrency(value as number) : value,
                name === "revenue" ? "Revenue" : "Jobs",
              ]}
              labelFormatter={(label) => formatDate(String(label))}
            />
            {showJobs && (
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="jobs"
                stroke="#3b82f6"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, fill: "#3b82f6" }}
              />
            )}
            {showRevenue && (
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="revenue"
                stroke="#22c55e"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, fill: "#22c55e" }}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-gray-100">
        {showJobs && (
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded bg-blue-50">
              <TrendingUp className="w-4 h-4 text-blue-600" />
            </div>
            <div>
              <div className="text-xs text-gray-500">Avg Jobs/Day</div>
              <div className="text-sm font-medium text-gray-900">
                {(totalJobs / Math.max(data.length, 1)).toFixed(1)}
              </div>
            </div>
          </div>
        )}
        {showRevenue && (
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded bg-green-50">
              <DollarSign className="w-4 h-4 text-green-600" />
            </div>
            <div>
              <div className="text-xs text-gray-500">Avg Revenue/Day</div>
              <div className="text-sm font-medium text-gray-900">
                {formatCurrency(totalRevenue / Math.max(data.length, 1))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
