"use client";

import { useState, useEffect, useCallback } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceDot,
  Legend,
} from "recharts";

interface WeeklyPrice {
  date: string;
  close: number;
  wma200: number | null;
}

interface BacktestTouch {
  date: string;
  price: number;
  duration: string;
  peakPrice: number;
  returnPct: number;
}

interface BtcData {
  livePrice: number;
  change24h: number;
  changePercent: number;
  wma200: number;
  distancePercent: number;
  weeklyPrices: WeeklyPrice[];
  backtestTouches: BacktestTouch[];
}

const HISTORICAL_TOUCHES = [
  { date: "2015-01-12", label: "Jan 2015" },
  { date: "2018-12-17", label: "Dec 2018" },
  { date: "2020-03-16", label: "Mar 2020" },
  { date: "2022-06-20", label: "Jun 2022" },
];

function formatPrice(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

function AlertZone({ distancePercent }: { distancePercent: number }) {
  let color = "bg-emerald-500";
  let text = "Safe Zone";
  let desc = `${distancePercent.toFixed(1)}% above 200WMA`;
  let pulse = false;

  if (distancePercent < 15) {
    color = "bg-red-500";
    text = "⚠️ Approaching Cycle Floor";
    desc = `Only ${distancePercent.toFixed(1)}% above 200WMA`;
    pulse = true;
  } else if (distancePercent < 30) {
    color = "bg-yellow-500";
    text = "Caution Zone";
    desc = `${distancePercent.toFixed(1)}% above 200WMA`;
  }

  return (
    <div className={`${color} ${pulse ? "animate-pulse" : ""} rounded-xl p-4 text-white`}>
      <div className="font-bold text-lg">{text}</div>
      <div className="text-sm opacity-90">{desc}</div>
    </div>
  );
}

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ color: string; name: string; value: number }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg p-3 text-sm">
      <div className="text-gray-400 mb-1">{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color }}>
          {p.name}: {formatPrice(p.value)}
        </div>
      ))}
    </div>
  );
}

export function BtcContent() {
  const [data, setData] = useState<BtcData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/btc");
      if (res.ok) {
        setData(await res.json());
      }
    } catch (e) {
      console.error("Error fetching BTC data:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <div className="space-y-6">
        {[1, 2, 3].map((i) => (
          <div key={i} className="card p-6 animate-pulse">
            <div className="h-6 bg-gray-200 rounded w-1/3 mb-4" />
            <div className="h-4 bg-gray-200 rounded w-2/3 mb-2" />
            <div className="h-4 bg-gray-200 rounded w-1/2" />
          </div>
        ))}
      </div>
    );
  }

  if (!data) {
    return <div className="text-center text-gray-500 py-12">Failed to load BTC data</div>;
  }

  const { livePrice, change24h, changePercent, wma200, distancePercent, weeklyPrices, backtestTouches } = data;

  // Find closest data points for reference dots
  const touchPoints = HISTORICAL_TOUCHES.map((t) => {
    const closest = weeklyPrices.reduce((best, wp) =>
      Math.abs(new Date(wp.date).getTime() - new Date(t.date).getTime()) <
      Math.abs(new Date(best.date).getTime() - new Date(t.date).getTime())
        ? wp
        : best
    );
    return { ...t, dataDate: closest.date, price: closest.wma200 || closest.close };
  });

  // Downsample chart data for performance
  const chartData = weeklyPrices.filter((_, i) => i % 2 === 0 || i === weeklyPrices.length - 1);

  return (
    <>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">BTC 200-Week Moving Average</h1>
        <p className="text-sm text-gray-500 mt-1">
          Cycle floor indicator — 4/4 historical touches marked generational bottoms
        </p>
      </div>

      {/* Alert Zone */}
      <div className="mb-6">
        <AlertZone distancePercent={distancePercent} />
      </div>

      {/* Price Card + Key Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {/* Price Card */}
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <div className="text-sm text-gray-500 mb-1">BTC Price</div>
          <div className="text-3xl font-bold text-gray-900">{formatPrice(livePrice)}</div>
          <div className={`text-sm mt-1 ${change24h >= 0 ? "text-emerald-600" : "text-red-600"}`}>
            {change24h >= 0 ? "+" : ""}
            {formatPrice(change24h)} ({changePercent >= 0 ? "+" : ""}
            {changePercent.toFixed(2)}%)
          </div>
          <div className="mt-3 pt-3 border-t">
            <div className="text-sm text-gray-500">200WMA</div>
            <div className="text-lg font-semibold text-cyan-600">{formatPrice(wma200)}</div>
          </div>
          <div className="mt-2">
            <div className="text-sm text-gray-500">Distance from 200WMA</div>
            <div className="text-lg font-semibold text-gray-900">+{distancePercent.toFixed(1)}%</div>
          </div>
        </div>

        {/* Key Stats */}
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <div className="text-sm font-medium text-gray-500 mb-3">Key Stats</div>
          <div className="space-y-4">
            <div>
              <div className="text-sm text-gray-500">Hit Rate</div>
              <div className="text-2xl font-bold text-emerald-600">4/4 (100%)</div>
            </div>
            <div>
              <div className="text-sm text-gray-500">Avg Return from Touch</div>
              <div className="text-2xl font-bold text-emerald-600">+2,976%</div>
            </div>
            <div>
              <div className="text-sm text-gray-500">Signal</div>
              <div className="text-sm text-gray-700">
                Every touch of the 200WMA has marked a generational bottom
              </div>
            </div>
          </div>
        </div>

        {/* Current Status */}
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <div className="text-sm font-medium text-gray-500 mb-3">Current Status</div>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-sm text-gray-500">BTC Price</span>
              <span className="font-medium">{formatPrice(livePrice)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-500">200WMA</span>
              <span className="font-medium text-cyan-600">{formatPrice(wma200)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-500">Gap</span>
              <span className="font-medium">{formatPrice(livePrice - wma200)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-500">% Above</span>
              <span className="font-bold text-lg">+{distancePercent.toFixed(1)}%</span>
            </div>
            <div className="pt-2 border-t">
              <div className="text-xs text-gray-400">
                {distancePercent > 30
                  ? "Well above cycle floor"
                  : distancePercent > 15
                  ? "Getting closer to cycle floor"
                  : "Near cycle floor — watch closely!"}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 200WMA Chart */}
      <div className="bg-gray-900 rounded-xl shadow-sm border border-gray-800 p-6 mb-6">
        <h2 className="text-lg font-bold text-white mb-4">BTC Price vs 200-Week Moving Average</h2>
        <div className="h-[400px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <XAxis
                dataKey="date"
                stroke="#6b7280"
                tick={{ fontSize: 11 }}
                tickFormatter={(v: string) => {
                  const d = new Date(v);
                  return `${d.getFullYear()}`;
                }}
                minTickGap={80}
              />
              <YAxis
                stroke="#6b7280"
                tick={{ fontSize: 11 }}
                scale="log"
                domain={["auto", "auto"]}
                tickFormatter={(v: number) => {
                  if (v >= 1000) return `$${(v / 1000).toFixed(0)}K`;
                  return `$${v}`;
                }}
              />
              <Tooltip content={<ChartTooltip />} />
              <Legend wrapperStyle={{ color: "#9ca3af", fontSize: 12 }} />
              <Line
                type="monotone"
                dataKey="close"
                stroke="#ffffff"
                strokeWidth={1.5}
                dot={false}
                name="BTC Price"
              />
              <Line
                type="monotone"
                dataKey="wma200"
                stroke="#22d3ee"
                strokeWidth={2}
                dot={false}
                name="200WMA"
              />
              {touchPoints.map((tp) => (
                <ReferenceDot
                  key={tp.label}
                  x={tp.dataDate}
                  y={tp.price}
                  r={5}
                  fill="#ef4444"
                  stroke="#ffffff"
                  strokeWidth={2}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="flex flex-wrap gap-4 mt-3 text-xs text-gray-400">
          {HISTORICAL_TOUCHES.map((t) => (
            <div key={t.label} className="flex items-center gap-1">
              <span className="w-2 h-2 bg-red-500 rounded-full inline-block" />
              {t.label}
            </div>
          ))}
        </div>
      </div>

      {/* Backtest Table */}
      <div className="bg-white rounded-xl shadow-sm border p-6 mb-6">
        <h2 className="text-lg font-bold text-gray-900 mb-4">200WMA Touch Backtest</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="pb-2 font-medium text-gray-500">Date</th>
                <th className="pb-2 font-medium text-gray-500">Price at Touch</th>
                <th className="pb-2 font-medium text-gray-500">Duration at MA</th>
                <th className="pb-2 font-medium text-gray-500">Peak After</th>
                <th className="pb-2 font-medium text-gray-500">Return</th>
              </tr>
            </thead>
            <tbody>
              {backtestTouches.map((t) => (
                <tr key={t.date} className="border-b last:border-0">
                  <td className="py-3 font-medium">{t.date}</td>
                  <td className="py-3">{formatPrice(t.price)}</td>
                  <td className="py-3 text-gray-500">{t.duration}</td>
                  <td className="py-3">{formatPrice(t.peakPrice)}</td>
                  <td className="py-3 text-emerald-600 font-bold">+{t.returnPct.toLocaleString()}%</td>
                </tr>
              ))}
              {/* Current row */}
              <tr className="bg-gray-50">
                <td className="py-3 font-medium">Current</td>
                <td className="py-3">{formatPrice(wma200)}</td>
                <td className="py-3 text-gray-500">—</td>
                <td className="py-3 text-gray-400">—</td>
                <td className="py-3 text-gray-500">
                  {distancePercent > 0
                    ? `+${distancePercent.toFixed(1)}% above`
                    : `${distancePercent.toFixed(1)}% — AT 200WMA!`}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
