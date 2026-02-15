import { KeyLevel } from "./types";

interface GoldKeyLevelsProps {
  keyLevels: KeyLevel[];
  livePrice: number | null | undefined;
  editMode: boolean;
  onAdd: () => void;
  onRemove: (index: number) => void;
  onUpdate: (index: number, field: keyof KeyLevel, value: string | number) => void;
}

export function GoldKeyLevels({
  keyLevels,
  livePrice,
  editMode,
  onAdd,
  onRemove,
  onUpdate,
}: GoldKeyLevelsProps) {
  return (
    <div className="card p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900">📊 Key Levels</h2>
        {editMode && (
          <button
            onClick={onAdd}
            className="text-sm text-amber-600 hover:text-amber-700"
          >
            + Add Level
          </button>
        )}
      </div>
      <div className="space-y-2">
        {keyLevels.length === 0 ? (
          <p className="text-sm text-gray-400">No key levels set</p>
        ) : (
          keyLevels.map((level, idx) => (
            <div
              key={idx}
              className={`flex items-center gap-3 p-3 rounded-lg ${
                livePrice && Math.abs(livePrice - level.level) / level.level < 0.02
                  ? "bg-amber-100 border border-amber-300"
                  : "bg-gray-50"
              }`}
            >
              {editMode ? (
                <>
                  <input
                    type="number"
                    value={level.level}
                    onChange={(e) =>
                      onUpdate(idx, "level", parseFloat(e.target.value) || 0)
                    }
                    className="w-24 px-2 py-1 border rounded font-mono"
                  />
                  <input
                    type="text"
                    value={level.significance}
                    onChange={(e) => onUpdate(idx, "significance", e.target.value)}
                    className="flex-1 px-2 py-1 border rounded text-sm"
                    placeholder="Significance"
                  />
                  <button
                    onClick={() => onRemove(idx)}
                    className="text-red-500 hover:text-red-700"
                  >
                    ✕
                  </button>
                </>
              ) : (
                <>
                  <span className="font-mono font-semibold text-amber-700 w-24">
                    ${level.level.toLocaleString()}
                  </span>
                  <span className="text-gray-600 text-sm flex-1">{level.significance}</span>
                  {livePrice && (
                    <span
                      className={`text-xs ${
                        livePrice > level.level ? "text-emerald-600" : "text-red-600"
                      }`}
                    >
                      {livePrice > level.level ? "Above" : "Below"}
                    </span>
                  )}
                </>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
