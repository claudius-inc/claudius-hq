"use client";

import { useState, useMemo } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  ReferenceLine,
} from "recharts";
import { RotateCcw } from "lucide-react";
import { DEFAULT_SCENARIO, OIL_CONSTANTS, type ScenarioParams } from "./constants";
import { simulateScenario } from "./helpers";

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  onChange: (value: number) => void;
}

function Slider({ label, value, min, max, step, unit, onChange }: SliderProps) {
  const percentage = ((value - min) / (max - min)) * 100;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-gray-700">{label}</label>
        <span className="text-xs font-semibold text-gray-900 tabular-nums">
          {value}
          {unit}
        </span>
      </div>
      <div className="relative">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer
                     [&::-webkit-slider-thumb]:appearance-none
                     [&::-webkit-slider-thumb]:w-4
                     [&::-webkit-slider-thumb]:h-4
                     [&::-webkit-slider-thumb]:bg-blue-600
                     [&::-webkit-slider-thumb]:rounded-full
                     [&::-webkit-slider-thumb]:cursor-pointer
                     [&::-webkit-slider-thumb]:shadow-md
                     [&::-webkit-slider-thumb]:hover:bg-blue-700
                     [&::-moz-range-thumb]:w-4
                     [&::-moz-range-thumb]:h-4
                     [&::-moz-range-thumb]:bg-blue-600
                     [&::-moz-range-thumb]:rounded-full
                     [&::-moz-range-thumb]:cursor-pointer
                     [&::-moz-range-thumb]:border-0"
          style={{
            background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${percentage}%, #e5e7eb ${percentage}%, #e5e7eb 100%)`,
          }}
        />
      </div>
    </div>
  );
}

export function ScenarioSimulator() {
  const [params, setParams] = useState<ScenarioParams>(DEFAULT_SCENARIO);
  const [showReopening, setShowReopening] = useState(false);

  const updateParam = <K extends keyof ScenarioParams>(key: K, value: ScenarioParams[K]) => {
    setParams((prev) => ({ ...prev, [key]: value }));
  };

  const resetParams = () => {
    setParams(DEFAULT_SCENARIO);
    setShowReopening(false);
  };

  // Simulate trajectory
  const trajectory = useMemo(() => simulateScenario(params), [params]);

  // Find peak and stats
  const peakPrice = Math.max(...trajectory.map((p) => p.price));
  const peakDay = trajectory.find((p) => p.price === peakPrice)?.day || 1;
  const avgPrice = trajectory.reduce((sum, p) => sum + p.price, 0) / trajectory.length;

  return (
    <div className="card overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 bg-gradient-to-r from-gray-50 to-blue-50/30">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Scenario Simulator</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Model price trajectories under different assumptions
            </p>
          </div>
          <button
            onClick={resetParams}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset
          </button>
        </div>
      </div>

      <div className="p-4 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Controls */}
        <div className="space-y-5">
          <Slider
            label="Shut-in Level"
            value={params.shutInMbd}
            min={0}
            max={15}
            step={0.5}
            unit=" mbd"
            onChange={(v) => updateParam("shutInMbd", v)}
          />

          <Slider
            label="SPR Release Rate"
            value={params.sprRelease}
            min={0}
            max={4}
            step={0.25}
            unit=" mbd"
            onChange={(v) => updateParam("sprRelease", v)}
          />

          <Slider
            label="Duration"
            value={params.duration}
            min={1}
            max={90}
            step={1}
            unit=" days"
            onChange={(v) => updateParam("duration", v)}
          />

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-gray-700">Strait Reopens</label>
              <button
                onClick={() => {
                  setShowReopening(!showReopening);
                  if (showReopening) {
                    updateParam("reopeningDay", null);
                  } else {
                    updateParam("reopeningDay", Math.floor(params.duration / 2));
                  }
                }}
                className={`relative w-10 h-5 rounded-full transition-colors ${
                  showReopening ? "bg-blue-600" : "bg-gray-200"
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                    showReopening ? "translate-x-5" : ""
                  }`}
                />
              </button>
            </div>
            {showReopening && (
              <Slider
                label="Reopening Day"
                value={params.reopeningDay || 15}
                min={5}
                max={params.duration - 5}
                step={1}
                unit=""
                onChange={(v) => updateParam("reopeningDay", v)}
              />
            )}
          </div>

          {/* Quick stats */}
          <div className="pt-4 border-t border-gray-100 grid grid-cols-2 gap-3">
            <div className="bg-red-50 rounded-lg p-2.5">
              <div className="text-[10px] text-red-600 font-medium uppercase tracking-wide">
                Peak Price
              </div>
              <div className="text-lg font-bold text-red-700 tabular-nums">
                ${peakPrice.toFixed(0)}
              </div>
              <div className="text-[10px] text-red-500">Day {peakDay}</div>
            </div>
            <div className="bg-blue-50 rounded-lg p-2.5">
              <div className="text-[10px] text-blue-600 font-medium uppercase tracking-wide">
                Avg Price
              </div>
              <div className="text-lg font-bold text-blue-700 tabular-nums">
                ${avgPrice.toFixed(0)}
              </div>
              <div className="text-[10px] text-blue-500">{params.duration} days</div>
            </div>
          </div>
        </div>

        {/* Chart */}
        <div className="lg:col-span-2">
          <div className="h-64 lg:h-80">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trajectory} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
                <defs>
                  <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis
                  dataKey="day"
                  tick={{ fontSize: 11, fill: "#9ca3af" }}
                  axisLine={{ stroke: "#e5e7eb" }}
                  tickLine={false}
                  label={{
                    value: "Day",
                    position: "insideBottomRight",
                    offset: -5,
                    fontSize: 10,
                    fill: "#9ca3af",
                  }}
                />
                <YAxis
                  domain={["dataMin - 10", "dataMax + 10"]}
                  tick={{ fontSize: 11, fill: "#9ca3af" }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => `$${v}`}
                  width={45}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#fff",
                    border: "1px solid #e5e7eb",
                    borderRadius: "8px",
                    fontSize: "12px",
                    boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                  }}
                  formatter={(value, name) => {
                    if (name === "price" && typeof value === "number") {
                      return [`$${value.toFixed(2)}`, "Brent"];
                    }
                    return [value, name];
                  }}
                  labelFormatter={(day) => `Day ${day}`}
                />
                {/* Demand destruction threshold */}
                <ReferenceLine
                  y={OIL_CONSTANTS.DEMAND_DESTRUCTION_PRICE}
                  stroke="#dc2626"
                  strokeDasharray="5 5"
                  label={{
                    value: "Demand destruction",
                    position: "right",
                    fontSize: 10,
                    fill: "#dc2626",
                  }}
                />
                {/* Pre-crisis baseline */}
                <ReferenceLine
                  y={OIL_CONSTANTS.BASE_BRENT_PRICE}
                  stroke="#10b981"
                  strokeDasharray="3 3"
                  label={{
                    value: "Pre-crisis",
                    position: "left",
                    fontSize: 10,
                    fill: "#10b981",
                  }}
                />
                {/* Reopening day */}
                {params.reopeningDay && (
                  <ReferenceLine
                    x={params.reopeningDay}
                    stroke="#8b5cf6"
                    strokeDasharray="5 5"
                    label={{
                      value: "Reopen",
                      position: "top",
                      fontSize: 10,
                      fill: "#8b5cf6",
                    }}
                  />
                )}
                <Area
                  type="monotone"
                  dataKey="price"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  fill="url(#priceGradient)"
                  activeDot={{ r: 5, fill: "#3b82f6", stroke: "#fff", strokeWidth: 2 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Legend */}
          <div className="flex flex-wrap items-center gap-4 mt-3 px-2 text-[10px] text-gray-500">
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-0.5 bg-blue-500 rounded" />
              <span>Price trajectory</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-0.5 bg-emerald-500 rounded" style={{ borderStyle: "dashed" }} />
              <span>Pre-crisis ($75)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-0.5 bg-red-500 rounded" style={{ borderStyle: "dashed" }} />
              <span>Demand destruction ($175)</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
