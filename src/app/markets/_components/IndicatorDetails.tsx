import type { MacroIndicator } from "./types";
import { getStatusColor } from "./helpers";

export function IndicatorDetails({ indicator }: { indicator: MacroIndicator }) {
  return (
    <div className="space-y-3">
      {indicator.interpretation && (
        <div className="bg-blue-50 rounded-lg p-3">
          <h4 className="text-xs font-semibold text-blue-600 uppercase tracking-wide mb-1">Current Reading</h4>
          <p className="text-sm text-gray-700 mb-1"><strong>Status:</strong> {indicator.interpretation.meaning}</p>
          <p className="text-sm text-gray-700"><strong>Market Impact:</strong> {indicator.interpretation.marketImpact}</p>
        </div>
      )}
      <div className="bg-gray-50 rounded-lg p-3">
        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Why It Matters</h4>
        <p className="text-sm text-gray-700">{indicator.whyItMatters}</p>
      </div>
      <div>
        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Interpretation Guide</h4>
        <div className="space-y-1">
          {indicator.ranges.map((range, idx) => (
            <div
              key={idx}
              className={`flex flex-wrap items-start gap-1 sm:gap-2 text-xs p-1.5 rounded ${
                indicator.interpretation?.label === range.label
                  ? getStatusColor(range.label) + " ring-1 ring-offset-1 ring-gray-300"
                  : "bg-gray-50"
              }`}
            >
              <span className="font-medium w-28 shrink-0">{range.label}</span>
              <span className="text-gray-500 w-20 shrink-0 tabular-nums">
                {range.min !== null ? range.min : "<"}{range.min !== null && range.max !== null ? " \u2013 " : ""}{range.max !== null ? range.max : "+"}
              </span>
              <span className="text-gray-600 flex-1">{range.meaning}</span>
            </div>
          ))}
        </div>
      </div>
      {indicator.keyLevels && indicator.keyLevels.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Key Levels</h4>
          <div className="flex flex-wrap gap-2">
            {indicator.keyLevels.map((kl, idx) => (
              <div key={idx} className="bg-gray-100 rounded px-2.5 py-1 text-xs">
                <span className="font-mono font-semibold">{kl.level}</span>
                <span className="text-gray-500 ml-1.5">{kl.significance}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      <div>
        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Assets Affected</h4>
        <div className="flex flex-wrap gap-1">
          {indicator.affectedAssets.map((asset, idx) => (
            <span key={idx} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">{asset}</span>
          ))}
        </div>
      </div>
      {indicator.data && (
        <div className="flex items-center gap-4 text-xs text-gray-400 pt-2 border-t border-gray-100">
          <span>5yr Range: {indicator.data.min.toFixed(1)} &ndash; {indicator.data.max.toFixed(1)}</span>
          <span>Avg: {indicator.data.avg.toFixed(1)}</span>
        </div>
      )}
    </div>
  );
}
