import { Droplets } from "lucide-react";
import { OilQuote } from "./types";

interface OilPriceCardProps {
  wti: OilQuote | null;
  brent: OilQuote | null;
  spread: number | null;
}

export function OilPriceCard({ wti, brent, spread }: OilPriceCardProps) {
  const formatPrice = (price: number | null | undefined) => {
    if (price === null || price === undefined) return "—";
    return `$${price.toFixed(2)}`;
  };

  const formatChange = (change: number | null | undefined, percent: number | null | undefined) => {
    if (change === null || change === undefined) return null;
    const sign = change >= 0 ? "+" : "";
    const percentStr = percent !== null && percent !== undefined ? ` (${sign}${percent.toFixed(2)}%)` : "";
    return `${sign}${change.toFixed(2)}${percentStr}`;
  };

  const getChangeColor = (change: number | null | undefined) => {
    if (change === null || change === undefined) return "text-gray-400";
    if (change > 0) return "text-emerald-600";
    if (change < 0) return "text-red-600";
    return "text-gray-600";
  };

  return (
    <div className="card p-6 bg-gradient-to-r from-slate-50 to-gray-50 border-slate-200">
      <div className="flex items-center gap-2 mb-4">
        <Droplets className="w-5 h-5 text-slate-700" />
        <h3 className="font-semibold text-gray-900">Crude Oil</h3>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        {/* WTI */}
        <div>
          <h4 className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">
            WTI Crude (CL=F)
          </h4>
          <div className="text-2xl font-bold text-gray-900">{formatPrice(wti?.price)}</div>
          {wti?.change !== null && (
            <div className={`text-sm mt-1 ${getChangeColor(wti?.change)}`}>
              {formatChange(wti?.change, wti?.changePercent)}
            </div>
          )}
          {wti?.fiftyTwoWeekLow && wti?.fiftyTwoWeekHigh && (
            <div className="text-xs text-gray-500 mt-2">
              52W: ${wti.fiftyTwoWeekLow.toFixed(0)} - ${wti.fiftyTwoWeekHigh.toFixed(0)}
            </div>
          )}
        </div>

        {/* Brent */}
        <div>
          <h4 className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">
            Brent Crude (BZ=F)
          </h4>
          <div className="text-2xl font-bold text-gray-900">{formatPrice(brent?.price)}</div>
          {brent?.change !== null && (
            <div className={`text-sm mt-1 ${getChangeColor(brent?.change)}`}>
              {formatChange(brent?.change, brent?.changePercent)}
            </div>
          )}
          {brent?.fiftyTwoWeekLow && brent?.fiftyTwoWeekHigh && (
            <div className="text-xs text-gray-500 mt-2">
              52W: ${brent.fiftyTwoWeekLow.toFixed(0)} - ${brent.fiftyTwoWeekHigh.toFixed(0)}
            </div>
          )}
        </div>

        {/* Spread */}
        <div>
          <h4 className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">
            Brent-WTI Spread
          </h4>
          <div className="text-2xl font-bold text-gray-900">
            {spread !== null ? `$${spread.toFixed(2)}` : "—"}
          </div>
          <div className="text-xs text-gray-500 mt-2">
            {spread !== null && spread > 5
              ? "Wide spread - global supply tightness"
              : spread !== null && spread < 2
              ? "Narrow spread - US oversupply"
              : "Normal range"}
          </div>
        </div>
      </div>

      {/* Moving Averages */}
      {wti && (wti.fiftyDayAvg || wti.twoHundredDayAvg) && (
        <div className="mt-4 pt-4 border-t border-gray-200">
          <div className="flex gap-6 text-sm">
            {wti.fiftyDayAvg && (
              <div>
                <span className="text-gray-500">50D Avg:</span>{" "}
                <span className={wti.price && wti.price > wti.fiftyDayAvg ? "text-emerald-600" : "text-red-600"}>
                  ${wti.fiftyDayAvg.toFixed(2)}
                </span>
              </div>
            )}
            {wti.twoHundredDayAvg && (
              <div>
                <span className="text-gray-500">200D Avg:</span>{" "}
                <span className={wti.price && wti.price > wti.twoHundredDayAvg ? "text-emerald-600" : "text-red-600"}>
                  ${wti.twoHundredDayAvg.toFixed(2)}
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
