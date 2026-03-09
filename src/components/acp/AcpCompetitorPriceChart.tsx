"use client";

import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from "recharts";
import { TrendingDown, TrendingUp } from "lucide-react";

interface PricePoint {
  date: string;
  price: number;
}

interface AcpCompetitorPriceChartProps {
  data: PricePoint[];
  competitorName?: string;
  ourPrice?: number;
}

export function AcpCompetitorPriceChart({ data, competitorName, ourPrice }: AcpCompetitorPriceChartProps) {
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  const formatPrice = (value: number) => `$${value.toFixed(4)}`;

  const latestPrice = data.length > 0 ? data[data.length - 1].price : 0;
  const oldestPrice = data.length > 0 ? data[0].price : 0;
  const priceChange = latestPrice - oldestPrice;
  const priceChangePercent = oldestPrice > 0 ? (priceChange / oldestPrice) * 100 : 0;

  const minPrice = Math.min(...data.map(d => d.price));
  const maxPrice = Math.max(...data.map(d => d.price));

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h4 className="text-sm font-medium text-gray-900">
            {competitorName ?? "Competitor"} Price History
          </h4>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-lg font-semibold text-gray-900">
              {formatPrice(latestPrice)}
            </span>
            <span
              className={`flex items-center gap-0.5 text-xs ${
                priceChange >= 0 ? "text-red-600" : "text-green-600"
              }`}
            >
              {priceChange >= 0 ? (
                <TrendingUp className="w-3 h-3" />
              ) : (
                <TrendingDown className="w-3 h-3" />
              )}
              {Math.abs(priceChangePercent).toFixed(1)}%
            </span>
          </div>
        </div>
        {ourPrice !== undefined && (
          <div className="text-right">
            <div className="text-xs text-gray-500">Our Price</div>
            <div className="text-sm font-medium text-blue-600">{formatPrice(ourPrice)}</div>
          </div>
        )}
      </div>

      <div className="h-40">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
            <XAxis
              dataKey="date"
              tickFormatter={formatDate}
              tick={{ fontSize: 10, fill: "#9ca3af" }}
              axisLine={{ stroke: "#e5e7eb" }}
              tickLine={false}
            />
            <YAxis
              domain={[minPrice * 0.9, maxPrice * 1.1]}
              tick={{ fontSize: 10, fill: "#9ca3af" }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => `$${v.toFixed(2)}`}
              width={50}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "#fff",
                border: "1px solid #e5e7eb",
                borderRadius: "8px",
                fontSize: "12px",
              }}
              formatter={(value) => [formatPrice(value as number), "Price"]}
              labelFormatter={(label) => formatDate(String(label))}
            />
            {ourPrice !== undefined && (
              <ReferenceLine
                y={ourPrice}
                stroke="#3b82f6"
                strokeDasharray="5 5"
                strokeWidth={1}
              />
            )}
            <Line
              type="monotone"
              dataKey="price"
              stroke="#f97316"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: "#f97316" }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {ourPrice !== undefined && (
        <div className="mt-3 pt-3 border-t border-gray-100">
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-500">Price Difference</span>
            <span
              className={`font-medium ${
                latestPrice > ourPrice ? "text-green-600" : "text-red-600"
              }`}
            >
              {latestPrice > ourPrice ? "+" : ""}
              {formatPrice(latestPrice - ourPrice)} ({latestPrice > ourPrice ? "higher" : "lower"})
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
