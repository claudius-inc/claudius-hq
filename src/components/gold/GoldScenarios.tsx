import { Scenario } from "./types";

interface GoldScenariosProps {
  scenarios: Scenario[];
  editMode: boolean;
  onUpdate: (index: number, field: keyof Scenario, value: string | number) => void;
}

export function GoldScenarios({
  scenarios,
  editMode,
  onUpdate,
}: GoldScenariosProps) {
  return (
    <div className="card p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Scenarios</h2>
      <div className="space-y-4">
        {scenarios.length === 0 ? (
          <p className="text-sm text-gray-400">No scenarios set</p>
        ) : (
          scenarios.map((scenario, idx) => (
            <div key={idx} className="border-l-4 border-amber-400 pl-4">
              {editMode ? (
                <div className="space-y-2">
                  <input
                    type="text"
                    value={scenario.name}
                    onChange={(e) => onUpdate(idx, "name", e.target.value)}
                    className="w-full px-2 py-1 border rounded font-semibold"
                    placeholder="Scenario name"
                  />
                  <div className="flex gap-2">
                    <input
                      type="number"
                      value={scenario.probability}
                      onChange={(e) =>
                        onUpdate(idx, "probability", parseInt(e.target.value) || 0)
                      }
                      className="w-20 px-2 py-1 border rounded"
                      placeholder="%"
                    />
                    <input
                      type="text"
                      value={scenario.priceRange}
                      onChange={(e) => onUpdate(idx, "priceRange", e.target.value)}
                      className="w-32 px-2 py-1 border rounded"
                      placeholder="Price range"
                    />
                  </div>
                  <textarea
                    value={scenario.description}
                    onChange={(e) => onUpdate(idx, "description", e.target.value)}
                    className="w-full px-2 py-1 border rounded text-sm"
                    rows={2}
                    placeholder="Description"
                  />
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between mb-1">
                    <h3 className="font-semibold text-gray-900">{scenario.name}</h3>
                    <span className="text-sm text-amber-600">{scenario.probability}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
                    <div
                      className="bg-amber-500 h-2 rounded-full"
                      style={{ width: `${scenario.probability}%` }}
                    />
                  </div>
                  <div className="text-sm text-gray-600">
                    <span className="font-medium">{scenario.priceRange}</span> —{" "}
                    {scenario.description}
                  </div>
                </>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
