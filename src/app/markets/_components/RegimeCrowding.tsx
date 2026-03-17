"use client";

import { useState, useEffect } from "react";
import { Users, TrendingUp, TrendingDown, Minus, ChevronDown, ChevronUp } from "lucide-react";
import { getCrowdingBgColor, type CrowdingLevel } from "@/lib/crowding-utils";

interface RegimeData {
  overall: {
    score: number;
    level: CrowdingLevel;
    description: string;
    components: {
      ownership: number;
      analyst: number;
      positioning: number;
    };
  };
  breakdown: {
    ticker: string;
    name: string;
    score: number;
    level: CrowdingLevel;
  }[];
  sectors: {
    ticker: string;
    name: string;
    score: number;
    level: CrowdingLevel;
  }[];
  timestamp: string;
}

export function RegimeCrowding() {
  const [data, setData] = useState<RegimeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    fetch("/api/markets/regime")
      .then((res) => res.json())
      .then((data) => setData(data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="card p-4">
        <div className="flex items-center gap-2 mb-2">
          <Users className="w-4 h-4 text-gray-400" />
          <span className="text-sm font-medium text-gray-600">Market Crowding</span>
        </div>
        <div className="h-12 bg-gray-100 rounded animate-pulse" />
      </div>
    );
  }

  if (!data) {
    return null;
  }

  const { overall, breakdown, sectors } = data;

  // Traffic light colors
  const getTrafficLight = (score: number) => {
    if (score <= 30) return { bg: "bg-red-500", text: "Crowded" };
    if (score <= 55) return { bg: "bg-yellow-500", text: "Neutral" };
    return { bg: "bg-green-500", text: "Contrarian" };
  };

  const traffic = getTrafficLight(overall.score);

  return (
    <div className="card overflow-hidden">
      {/* Header */}
      <button
        className="w-full p-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3">
          <Users className="w-5 h-5 text-gray-500" />
          <div className="text-left">
            <h3 className="text-sm font-semibold text-gray-900">Market Crowding</h3>
            <p className="text-xs text-gray-500">Aggregate positioning sentiment</p>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          {/* Traffic light indicator */}
          <div className="flex items-center gap-2">
            <div className={`w-3 h-3 rounded-full ${traffic.bg}`} />
            <span className={`text-sm font-medium ${getCrowdingBgColor(overall.score).split(' ')[1]}`}>
              {overall.score}
            </span>
          </div>
          
          {/* Score badge */}
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getCrowdingBgColor(overall.score)}`}>
            {overall.level}
          </span>
          
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-gray-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-gray-400" />
          )}
        </div>
      </button>

      {/* Collapsed interpretation */}
      {!expanded && (
        <div className="px-4 pb-4 -mt-2">
          <p className="text-xs text-gray-600">{overall.description}</p>
        </div>
      )}

      {/* Expanded details */}
      {expanded && (
        <div className="border-t border-gray-100">
          {/* Components breakdown */}
          <div className="p-4 bg-gray-50">
            <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">
              Score Components
            </h4>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <div className="text-xs text-gray-500">Ownership</div>
                <div className="flex items-center gap-1">
                  <ComponentIcon value={overall.components.ownership} />
                  <span className="text-sm font-semibold">{overall.components.ownership}</span>
                </div>
              </div>
              <div>
                <div className="text-xs text-gray-500">Analyst</div>
                <div className="flex items-center gap-1">
                  <ComponentIcon value={overall.components.analyst} />
                  <span className="text-sm font-semibold">{overall.components.analyst}</span>
                </div>
              </div>
              <div>
                <div className="text-xs text-gray-500">Positioning</div>
                <div className="flex items-center gap-1">
                  <ComponentIcon value={overall.components.positioning} />
                  <span className="text-sm font-semibold">{overall.components.positioning}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Market ETFs breakdown */}
          <div className="p-4">
            <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
              Major Markets
            </h4>
            <div className="grid grid-cols-2 gap-2">
              {breakdown.map((item) => (
                <div
                  key={item.ticker}
                  className="flex items-center justify-between py-1 px-2 rounded bg-gray-50"
                >
                  <div>
                    <span className="text-xs font-medium text-gray-900">{item.ticker}</span>
                    <span className="text-xs text-gray-500 ml-1">{item.name}</span>
                  </div>
                  <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${getCrowdingBgColor(item.score)}`}>
                    {item.score}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Sector breakdown */}
          <div className="p-4 border-t border-gray-100">
            <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
              Sectors
            </h4>
            <div className="grid grid-cols-2 gap-2">
              {sectors.map((item) => (
                <div
                  key={item.ticker}
                  className="flex items-center justify-between py-1 px-2 rounded bg-gray-50"
                >
                  <span className="text-xs text-gray-700">{item.name}</span>
                  <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${getCrowdingBgColor(item.score)}`}>
                    {item.score}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Interpretation */}
          <div className="p-4 bg-blue-50 border-t border-blue-100">
            <p className="text-xs text-blue-800">
              <strong>Interpretation:</strong> {overall.description}
              {overall.score <= 30 && (
                <span className="block mt-1">
                  Consider reducing exposure or waiting for sentiment to cool before adding.
                </span>
              )}
              {overall.score >= 70 && (
                <span className="block mt-1">
                  Potential opportunity as positioning is light. Watch for catalysts.
                </span>
              )}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function ComponentIcon({ value }: { value: number }) {
  if (value >= 55) {
    return <TrendingUp className="w-3 h-3 text-green-500" />;
  }
  if (value <= 35) {
    return <TrendingDown className="w-3 h-3 text-red-500" />;
  }
  return <Minus className="w-3 h-3 text-yellow-500" />;
}
