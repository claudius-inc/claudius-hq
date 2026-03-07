import { OilKeyLevel } from "./types";

interface OilKeyLevelsProps {
  keyLevels: OilKeyLevel[];
  currentPrice: number | null;
}

export function OilKeyLevels({ keyLevels, currentPrice }: OilKeyLevelsProps) {
  // Sort levels from high to low
  const sortedLevels = [...keyLevels].sort((a, b) => b.level - a.level);

  // Find nearest support and resistance
  let nearestSupport: OilKeyLevel | null = null;
  let nearestResistance: OilKeyLevel | null = null;

  if (currentPrice !== null) {
    for (const level of sortedLevels) {
      if (level.level < currentPrice && !nearestSupport) {
        nearestSupport = level;
      }
      if (level.level >= currentPrice) {
        nearestResistance = level;
      }
    }
  }

  const getLevelStyle = (level: OilKeyLevel) => {
    if (currentPrice === null) return "bg-gray-50";
    
    if (level === nearestSupport) {
      return "bg-emerald-50 border-l-4 border-emerald-500";
    }
    if (level === nearestResistance) {
      return "bg-amber-50 border-l-4 border-amber-500";
    }
    return "bg-gray-50";
  };

  return (
    <div className="card p-5">
      <h3 className="font-semibold text-gray-900 mb-4">Key Levels (WTI)</h3>
      
      <div className="space-y-2">
        {sortedLevels.map((level) => (
          <div
            key={level.level}
            className={`flex items-center justify-between p-3 rounded-lg ${getLevelStyle(level)}`}
          >
            <div className="flex items-center gap-3">
              <span className="font-mono font-bold text-gray-900 w-16">${level.level}</span>
              <span className="text-sm text-gray-600">{level.significance}</span>
            </div>
            {currentPrice !== null && (
              <span className="text-xs text-gray-500">
                {level.level > currentPrice ? "↑" : "↓"}{" "}
                {Math.abs(((level.level - currentPrice) / currentPrice) * 100).toFixed(1)}%
              </span>
            )}
          </div>
        ))}
      </div>

      {currentPrice !== null && (
        <div className="mt-4 pt-4 border-t border-gray-200 flex items-center justify-between text-sm">
          <div>
            <span className="text-emerald-600 font-medium">Support:</span>{" "}
            ${nearestSupport?.level || "—"}
          </div>
          <div>
            <span className="text-amber-600 font-medium">Resistance:</span>{" "}
            ${nearestResistance?.level || "—"}
          </div>
        </div>
      )}
    </div>
  );
}
