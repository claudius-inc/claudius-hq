"use client";

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import { TrendingUp } from "lucide-react";

interface AttributionDataPoint {
  date: string;
  posts: number;
  jobs: number;
}

interface AcpAttributionChartProps {
  data: AttributionDataPoint[];
}

export function AcpAttributionChart({ data }: AcpAttributionChartProps) {
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  const totalPosts = data.reduce((sum, d) => sum + d.posts, 0);
  const totalJobs = data.reduce((sum, d) => sum + d.jobs, 0);
  const conversionRate = totalPosts > 0 ? (totalJobs / totalPosts) * 100 : 0;

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h4 className="text-sm font-medium text-gray-900">Posts vs Jobs Attribution</h4>
          <p className="text-xs text-gray-500 mt-0.5">Correlation over time</p>
        </div>
        <div className="flex items-center gap-1 text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded-full">
          <TrendingUp className="w-3 h-3" />
          {conversionRate.toFixed(1)}% conversion
        </div>
      </div>

      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={formatDate}
              tick={{ fontSize: 10, fill: "#9ca3af" }}
              axisLine={{ stroke: "#e5e7eb" }}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 10, fill: "#9ca3af" }}
              axisLine={false}
              tickLine={false}
              width={25}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "#fff",
                border: "1px solid #e5e7eb",
                borderRadius: "8px",
                fontSize: "12px",
              }}
              labelFormatter={(label) => formatDate(String(label))}
            />
            <Legend
              wrapperStyle={{ fontSize: "11px", paddingTop: "8px" }}
              iconType="circle"
              iconSize={8}
            />
            <Bar
              dataKey="posts"
              name="Posts"
              fill="#a855f7"
              radius={[4, 4, 0, 0]}
              maxBarSize={20}
            />
            <Bar
              dataKey="jobs"
              name="Jobs"
              fill="#22c55e"
              radius={[4, 4, 0, 0]}
              maxBarSize={20}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4 mt-4 pt-4 border-t border-gray-100">
        <div className="text-center">
          <div className="text-xs text-gray-500">Total Posts</div>
          <div className="text-lg font-semibold text-purple-600">{totalPosts}</div>
        </div>
        <div className="text-center">
          <div className="text-xs text-gray-500">Attributed Jobs</div>
          <div className="text-lg font-semibold text-green-600">{totalJobs}</div>
        </div>
        <div className="text-center">
          <div className="text-xs text-gray-500">Avg Jobs/Post</div>
          <div className="text-lg font-semibold text-gray-900">
            {totalPosts > 0 ? (totalJobs / totalPosts).toFixed(2) : "0"}
          </div>
        </div>
      </div>
    </div>
  );
}
