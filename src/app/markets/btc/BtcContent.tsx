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
  BarChart,
  Bar,
  Cell,
  ReferenceLine,
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

interface MayerBacktest {
  date: string;
  price: number;
  mayer: number;
  return6mo: number;
  return12mo: number;
}

interface YearlyPeakMayer {
  year: number;
  peak: number;
}

interface BtcData {
  livePrice: number;
  change24h: number;
  changePercent: number;
  wma200: number;
  distancePercent: number;
  weeklyPrices: WeeklyPrice[];
  backtestTouches: BacktestTouch[];
  sma200d: number;
  mayerMultiple: number;
  yearlyPeakMayer: YearlyPeakMayer[];
  mayerBacktest: MayerBacktest[];
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

  const { livePrice, change24h, changePercent, wma200, distancePercent, weeklyPrices, backtestTouches, sma200d, mayerMultiple, yearlyPeakMayer, mayerBacktest } = data;

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

      {/* 200WMA Backtest Table */}
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

      {/* ═══ MAYER MULTIPLE SECTION ═══ */}
      <div className="mb-6 mt-12 pt-8 border-t-2 border-gray-200">
        <h1 className="text-2xl font-bold text-gray-900">Mayer Multiple</h1>
        <p className="text-sm text-gray-500 mt-1">
          BTC Price ÷ 200-Day Moving Average — measures deviation from long-term mean
        </p>
      </div>

      {/* Mayer Multiple Card */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className={`rounded-xl shadow-sm border p-6 ${
          mayerMultiple < 0.8 ? "bg-emerald-50 border-emerald-200" :
          mayerMultiple > 2.4 ? "bg-red-50 border-red-200" :
          "bg-white"
        }`}>
          <div className="text-sm text-gray-500 mb-1">Mayer Multiple</div>
          <div className={`text-4xl font-bold ${
            mayerMultiple < 0.8 ? "text-emerald-600" :
            mayerMultiple > 2.4 ? "text-red-600" :
            "text-yellow-600"
          }`}>
            {mayerMultiple.toFixed(2)}
          </div>
          <div className={`text-sm mt-2 font-medium ${
            mayerMultiple < 0.8 ? "text-emerald-600" :
            mayerMultiple > 2.4 ? "text-red-600" :
            "text-yellow-600"
          }`}>
            {mayerMultiple < 0.8 ? "🟢 Buy Zone" : mayerMultiple > 2.4 ? "🔴 Sell Zone" : "🟡 Normal Zone"}
          </div>
          <div className="mt-3 pt-3 border-t">
            <div className="text-sm text-gray-500">200-Day SMA</div>
            <div className="text-lg font-semibold text-gray-900">{formatPrice(sma200d)}</div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border p-6 col-span-1 md:col-span-2">
          <div className="text-sm font-medium text-gray-500 mb-3">Zone Guide</div>
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center p-3 bg-emerald-50 rounded-lg">
              <div className="text-2xl font-bold text-emerald-600">&lt; 0.8</div>
              <div className="text-sm text-emerald-700 font-medium">Buy Zone</div>
              <div className="text-xs text-gray-500 mt-1">Historically undervalued</div>
            </div>
            <div className="text-center p-3 bg-yellow-50 rounded-lg">
              <div className="text-2xl font-bold text-yellow-600">0.8 – 2.4</div>
              <div className="text-sm text-yellow-700 font-medium">Normal</div>
              <div className="text-xs text-gray-500 mt-1">Fair value range</div>
            </div>
            <div className="text-center p-3 bg-red-50 rounded-lg">
              <div className="text-2xl font-bold text-red-600">&gt; 2.4</div>
              <div className="text-sm text-red-700 font-medium">Sell Zone</div>
              <div className="text-xs text-gray-500 mt-1">Bubble territory</div>
            </div>
          </div>
        </div>
      </div>

      {/* Mayer Multiple Bar Chart */}
      <div className="bg-gray-900 rounded-xl shadow-sm border border-gray-800 p-6 mb-6">
        <h2 className="text-lg font-bold text-white mb-4">Yearly Peak Mayer Multiple</h2>
        <div className="h-[350px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={yearlyPeakMayer}>
              <XAxis dataKey="year" stroke="#6b7280" tick={{ fontSize: 11 }} />
              <YAxis stroke="#6b7280" tick={{ fontSize: 11 }} domain={[0, "auto"]} />
              <Tooltip
                contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151", borderRadius: 8, fontSize: 13 }}
                labelStyle={{ color: "#9ca3af" }}
                itemStyle={{ color: "#ffffff" }}
<<<<<<< Updated upstream
                formatter={(value: number) => [`${value.toFixed(2)}`, "Peak Mayer"]}
=======
                formatter={(value: string | number) => [`${Number(value).toFixed(2)}`, "Peak Mayer"] as [string, string]}
>>>>>>> Stashed changes
              />
              <ReferenceLine y={2.4} stroke="#ef4444" strokeDasharray="6 3" label={{ value: "SELL >2.4", fill: "#ef4444", fontSize: 11, position: "right" }} />
              <ReferenceLine y={0.8} stroke="#22c55e" strokeDasharray="6 3" label={{ value: "BUY <0.8", fill: "#22c55e", fontSize: 11, position: "right" }} />
              <Bar dataKey="peak" radius={[4, 4, 0, 0]}>
                {yearlyPeakMayer.map((entry, index) => (
                  <Cell
                    key={index}
                    fill={entry.peak > 2.4 ? "#ef4444" : entry.peak < 0.8 ? "#22c55e" : "#eab308"}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Mayer Backtest Table */}
      <div className="bg-white rounded-xl shadow-sm border p-6 mb-6">
        <h2 className="text-lg font-bold text-gray-900 mb-4">Every Time Mayer Multiple ≤ 0.6</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="pb-2 font-medium text-gray-500">Date</th>
                <th className="pb-2 font-medium text-gray-500">Price</th>
                <th className="pb-2 font-medium text-gray-500">Mayer</th>
                <th className="pb-2 font-medium text-gray-500">6mo Return</th>
                <th className="pb-2 font-medium text-gray-500">12mo Return</th>
              </tr>
            </thead>
            <tbody>
              {mayerBacktest.map((t) => (
                <tr key={t.date} className="border-b last:border-0">
                  <td className="py-3 font-medium">{t.date}</td>
                  <td className="py-3">{formatPrice(t.price)}</td>
                  <td className="py-3 text-emerald-600 font-bold">{t.mayer.toFixed(2)}</td>
                  <td className="py-3 text-emerald-600">+{t.return6mo}%</td>
                  <td className="py-3 text-emerald-600 font-bold">+{t.return12mo.toLocaleString()}%</td>
                </tr>
              ))}
              <tr className="bg-gray-50">
                <td className="py-3 font-medium">Current</td>
                <td className="py-3">{formatPrice(livePrice)}</td>
                <td className={`py-3 font-bold ${mayerMultiple <= 0.6 ? "text-emerald-600" : "text-gray-600"}`}>{mayerMultiple.toFixed(2)}</td>
                <td className="py-3 text-gray-400">?</td>
                <td className="py-3 text-gray-400">?</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="mt-4 pt-3 border-t text-xs text-gray-500">
          Buy &lt;0.8 · Normal 0.8–2.4 · Sell &gt;2.4 · Hit rate at ≤0.6: <span className="font-bold text-emerald-600">100%</span>
        </div>
      </div>
    </>
  );
}
