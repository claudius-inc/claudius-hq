import { DxyData, RealYieldsData } from "./types";

interface GoldCorrelationsProps {
  dxy: DxyData | null;
  realYields: RealYieldsData | null;
}

export function GoldCorrelations({ dxy, realYields }: GoldCorrelationsProps) {
  if (!dxy && !realYields) return null;

  return (
    <div className="card p-6 mb-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">📊 Gold Drivers</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* DXY */}
        <div className={`rounded-lg p-4 border-2 ${
          dxy 
            ? (dxy.price < 100 || dxy.changePercent < 0)
              ? "bg-emerald-50 border-emerald-200"
              : "bg-red-50 border-red-200"
            : "bg-gray-50 border-gray-200"
        }`}>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
              DXY (Dollar Index)
            </h3>
            {dxy && (
              <span className={`text-lg ${
                dxy.price < 100 || dxy.changePercent < 0 
                  ? "text-emerald-600" 
                  : "text-red-600"
              }`}>
                {dxy.price < 100 || dxy.changePercent < 0 ? "🟢" : "🔴"}
              </span>
            )}
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-gray-900">
              {dxy?.price?.toFixed(2) || "—"}
            </span>
            {dxy && (
              <span className={`text-sm font-medium ${
                dxy.changePercent >= 0 ? "text-red-600" : "text-emerald-600"
              }`}>
                {dxy.changePercent >= 0 ? "↑" : "↓"} {Math.abs(dxy.changePercent).toFixed(2)}%
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500 mt-2">
            {dxy 
              ? (dxy.price < 100 || dxy.changePercent < 0)
                ? "Supportive — Weaker dollar bullish for gold"
                : "Headwind — Strong dollar pressures gold"
              : "Inverse correlation with gold"
            }
          </p>
        </div>

        {/* Real Yields */}
        <div className={`rounded-lg p-4 border-2 ${
          realYields 
            ? (realYields.value < 1 || realYields.change < 0)
              ? "bg-emerald-50 border-emerald-200"
              : "bg-red-50 border-red-200"
            : "bg-gray-50 border-gray-200"
        }`}>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
              Real Yields (10Y−CPI)
            </h3>
            {realYields && (
              <span className={`text-lg ${
                realYields.value < 1 || realYields.change < 0 
                  ? "text-emerald-600" 
                  : "text-red-600"
              }`}>
                {realYields.value < 1 || realYields.change < 0 ? "🟢" : "🔴"}
              </span>
            )}
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-gray-900">
              {realYields?.value?.toFixed(2) || "—"}%
            </span>
            {realYields && (
              <span className={`text-sm font-medium ${
                realYields.change >= 0 ? "text-red-600" : "text-emerald-600"
              }`}>
                {realYields.change >= 0 ? "↑" : "↓"} {Math.abs(realYields.change * 100).toFixed(0)}bp
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500 mt-2">
            {realYields 
              ? (realYields.value < 1 || realYields.change < 0)
                ? "Supportive — Lower opportunity cost for gold"
                : "Headwind — Higher yields compete with gold"
              : "Gold's valuation anchor"
            }
          </p>
          {realYields && (
            <p className="text-xs text-gray-400 mt-1">
              TNX: {realYields.tnx.toFixed(2)}% − CPI: {realYields.cpi.toFixed(1)}%
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
