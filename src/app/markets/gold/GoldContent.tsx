"use client";

import { useState, useEffect, useCallback } from "react";
import { marked } from "marked";

interface KeyLevel {
  level: number;
  significance: string;
}

interface Scenario {
  name: string;
  probability: number;
  priceRange: string;
  description: string;
}

interface GoldFlow {
  id: number;
  date: string;
  gldSharesOutstanding: number | null;
  gldNav: number | null;
  estimatedFlowUsd: number | null;
  globalEtfFlowUsd: number | null;
  centralBankTonnes: number | null;
  source: string | null;
}

interface GoldData {
  analysis: {
    id: number;
    currentPrice: number | null;
    ath: number | null;
    athDate: string | null;
    keyLevels: KeyLevel[];
    scenarios: Scenario[];
    thesisNotes: string | null;
    updatedAt: string | null;
  } | null;
  livePrice: number | null;
  gld: {
    price: number | null;
    sharesOutstanding: number | null;
    fiftyTwoWeekHigh: number | null;
    fiftyTwoWeekLow: number | null;
    change: number | null;
    changePercent: number | null;
  } | null;
  flows: GoldFlow[];
}

export function GoldContent() {
  const [data, setData] = useState<GoldData | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);

  // Editable state
  const [keyLevels, setKeyLevels] = useState<KeyLevel[]>([]);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [thesisNotes, setThesisNotes] = useState("");
  const [ath, setAth] = useState<number | null>(null);
  const [athDate, setAthDate] = useState("");

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/gold");
      if (res.ok) {
        const json = await res.json();
        setData(json);
        // Initialize editable fields
        if (json.analysis) {
          setKeyLevels(json.analysis.keyLevels || []);
          setScenarios(json.analysis.scenarios || []);
          setThesisNotes(json.analysis.thesisNotes || "");
          setAth(json.analysis.ath);
          setAthDate(json.analysis.athDate || "");
        }
      }
    } catch (e) {
      console.error("Error fetching gold data:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const syncFlows = async () => {
    setSyncing(true);
    try {
      const res = await fetch("/api/gold/flows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "sync" }),
      });
      if (res.ok) {
        await fetchData();
      }
    } catch (e) {
      console.error("Sync error:", e);
    } finally {
      setSyncing(false);
    }
  };

  const saveAnalysis = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/gold", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          keyLevels,
          scenarios,
          thesisNotes,
          ath,
          athDate,
        }),
      });
      if (res.ok) {
        await fetchData();
        setEditMode(false);
      }
    } catch (e) {
      console.error("Save error:", e);
    } finally {
      setSaving(false);
    }
  };

  const addKeyLevel = () => {
    setKeyLevels([...keyLevels, { level: 0, significance: "" }]);
  };

  const removeKeyLevel = (index: number) => {
    setKeyLevels(keyLevels.filter((_, i) => i !== index));
  };

  const updateKeyLevel = (index: number, field: keyof KeyLevel, value: string | number) => {
    const updated = [...keyLevels];
    updated[index] = { ...updated[index], [field]: value };
    setKeyLevels(updated);
  };

  const updateScenario = (index: number, field: keyof Scenario, value: string | number) => {
    const updated = [...scenarios];
    updated[index] = { ...updated[index], [field]: value };
    setScenarios(updated);
  };

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

  const livePrice = data?.livePrice;
  const storedAth = data?.analysis?.ath || ath;
  const changeFromAth = livePrice && storedAth ? ((livePrice - storedAth) / storedAth) * 100 : null;

  // Calculate cumulative flows for chart
  const flowsForChart = [...(data?.flows || [])].reverse();
  const cumulativeFlows: { date: string; cumulative: number; shares: number | null }[] = [];
  let cumulative = 0;
  for (const flow of flowsForChart) {
    if (flow.estimatedFlowUsd) {
      cumulative += flow.estimatedFlowUsd;
    }
    cumulativeFlows.push({
      date: flow.date,
      cumulative,
      shares: flow.gldSharesOutstanding,
    });
  }

  return (
    <>
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">🥇 Gold Analysis</h1>
            <p className="text-sm text-gray-500 mt-1">
              Track gold prices, ETF flows, and key levels
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={syncFlows}
              disabled={syncing}
              className="px-4 py-2 bg-amber-100 text-amber-700 rounded-lg text-sm font-medium hover:bg-amber-200 disabled:opacity-50"
            >
              {syncing ? "Syncing..." : "🔄 Sync GLD Data"}
            </button>
            <button
              onClick={() => (editMode ? saveAnalysis() : setEditMode(true))}
              disabled={saving}
              className={`px-4 py-2 rounded-lg text-sm font-medium ${
                editMode
                  ? "bg-emerald-600 text-white hover:bg-emerald-700"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              } disabled:opacity-50`}
            >
              {saving ? "Saving..." : editMode ? "✓ Save" : "✏️ Edit"}
            </button>
            {editMode && (
              <button
                onClick={() => setEditMode(false)}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200"
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Price Panel */}
      <div className="card p-6 mb-6 bg-gradient-to-r from-amber-50 to-yellow-50 border-amber-200">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {/* Current Price */}
          <div>
            <h3 className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-1">
              Gold Spot (GC=F)
            </h3>
            <div className="text-3xl font-bold text-amber-900">
              ${livePrice?.toLocaleString(undefined, { minimumFractionDigits: 2 }) || "—"}
            </div>
            {data?.gld?.change !== null && data?.gld?.change !== undefined && (
              <div
                className={`text-sm mt-1 ${data.gld.change >= 0 ? "text-emerald-600" : "text-red-600"}`}
              >
                {data.gld.change >= 0 ? "+" : ""}
                {data.gld.changePercent?.toFixed(2)}% today
              </div>
            )}
          </div>

          {/* ATH */}
          <div>
            <h3 className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-1">
              All-Time High
            </h3>
            {editMode ? (
              <div className="flex gap-2">
                <input
                  type="number"
                  value={ath || ""}
                  onChange={(e) => setAth(parseFloat(e.target.value) || null)}
                  placeholder="ATH Price"
                  className="w-24 px-2 py-1 border rounded text-lg"
                />
                <input
                  type="text"
                  value={athDate}
                  onChange={(e) => setAthDate(e.target.value)}
                  placeholder="Date"
                  className="w-28 px-2 py-1 border rounded text-sm"
                />
              </div>
            ) : (
              <>
                <div className="text-2xl font-bold text-amber-900">
                  ${storedAth?.toLocaleString(undefined, { minimumFractionDigits: 2 }) || "—"}
                </div>
                <div className="text-sm text-amber-600">
                  {data?.analysis?.athDate || athDate || "—"}
                </div>
              </>
            )}
          </div>

          {/* Change from ATH */}
          <div>
            <h3 className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-1">
              From ATH
            </h3>
            <div
              className={`text-2xl font-bold ${
                changeFromAth !== null
                  ? changeFromAth >= 0
                    ? "text-emerald-600"
                    : "text-red-600"
                  : "text-gray-400"
              }`}
            >
              {changeFromAth !== null
                ? `${changeFromAth >= 0 ? "+" : ""}${changeFromAth.toFixed(2)}%`
                : "—"}
            </div>
          </div>

          {/* GLD Stats */}
          <div>
            <h3 className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-1">
              GLD ETF
            </h3>
            <div className="text-2xl font-bold text-amber-900">
              ${data?.gld?.price?.toLocaleString(undefined, { minimumFractionDigits: 2 }) || "—"}
            </div>
            <div className="text-sm text-amber-600">
              52W: ${data?.gld?.fiftyTwoWeekLow?.toFixed(0)} - ${data?.gld?.fiftyTwoWeekHigh?.toFixed(0)}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Key Levels */}
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">📊 Key Levels</h2>
            {editMode && (
              <button
                onClick={addKeyLevel}
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
                          updateKeyLevel(idx, "level", parseFloat(e.target.value) || 0)
                        }
                        className="w-24 px-2 py-1 border rounded font-mono"
                      />
                      <input
                        type="text"
                        value={level.significance}
                        onChange={(e) => updateKeyLevel(idx, "significance", e.target.value)}
                        className="flex-1 px-2 py-1 border rounded text-sm"
                        placeholder="Significance"
                      />
                      <button
                        onClick={() => removeKeyLevel(idx)}
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

        {/* Scenarios */}
        <div className="card p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">🎯 Scenarios</h2>
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
                        onChange={(e) => updateScenario(idx, "name", e.target.value)}
                        className="w-full px-2 py-1 border rounded font-semibold"
                        placeholder="Scenario name"
                      />
                      <div className="flex gap-2">
                        <input
                          type="number"
                          value={scenario.probability}
                          onChange={(e) =>
                            updateScenario(idx, "probability", parseInt(e.target.value) || 0)
                          }
                          className="w-20 px-2 py-1 border rounded"
                          placeholder="%"
                        />
                        <input
                          type="text"
                          value={scenario.priceRange}
                          onChange={(e) => updateScenario(idx, "priceRange", e.target.value)}
                          className="w-32 px-2 py-1 border rounded"
                          placeholder="Price range"
                        />
                      </div>
                      <textarea
                        value={scenario.description}
                        onChange={(e) => updateScenario(idx, "description", e.target.value)}
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
      </div>

      {/* ETF Flow Chart (Simple table representation) */}
      <div className="card p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">📈 GLD ETF Flows</h2>
        {data?.flows && data.flows.length > 0 ? (
          <>
            {/* Quick Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="bg-amber-50 rounded-lg p-4">
                <div className="text-xs text-amber-600 font-medium uppercase">Latest NAV</div>
                <div className="text-xl font-bold text-amber-900">
                  ${data.flows[0]?.gldNav?.toFixed(2) || "—"}
                </div>
              </div>
              <div className="bg-amber-50 rounded-lg p-4">
                <div className="text-xs text-amber-600 font-medium uppercase">Shares Outstanding</div>
                <div className="text-xl font-bold text-amber-900">
                  {data.flows[0]?.gldSharesOutstanding
                    ? (data.flows[0].gldSharesOutstanding / 1e6).toFixed(1) + "M"
                    : "—"}
                </div>
              </div>
              <div className="bg-amber-50 rounded-lg p-4">
                <div className="text-xs text-amber-600 font-medium uppercase">Today&apos;s Flow</div>
                <div
                  className={`text-xl font-bold ${
                    (data.flows[0]?.estimatedFlowUsd || 0) >= 0 ? "text-emerald-600" : "text-red-600"
                  }`}
                >
                  {data.flows[0]?.estimatedFlowUsd
                    ? `${data.flows[0].estimatedFlowUsd >= 0 ? "+" : ""}$${(data.flows[0].estimatedFlowUsd / 1e6).toFixed(1)}M`
                    : "—"}
                </div>
              </div>
              <div className="bg-amber-50 rounded-lg p-4">
                <div className="text-xs text-amber-600 font-medium uppercase">
                  {cumulativeFlows.length}D Cumulative
                </div>
                <div
                  className={`text-xl font-bold ${
                    cumulative >= 0 ? "text-emerald-600" : "text-red-600"
                  }`}
                >
                  {cumulative >= 0 ? "+" : ""}${(cumulative / 1e9).toFixed(2)}B
                </div>
              </div>
            </div>

            {/* Flow Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-2 px-3 font-medium text-gray-600">Date</th>
                    <th className="text-right py-2 px-3 font-medium text-gray-600">NAV</th>
                    <th className="text-right py-2 px-3 font-medium text-gray-600">Shares (M)</th>
                    <th className="text-right py-2 px-3 font-medium text-gray-600">Est. Flow</th>
                    <th className="text-right py-2 px-3 font-medium text-gray-600">Source</th>
                  </tr>
                </thead>
                <tbody>
                  {data.flows.slice(0, 14).map((flow) => (
                    <tr key={flow.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-2 px-3 text-gray-900">{flow.date}</td>
                      <td className="py-2 px-3 text-right text-gray-700">
                        ${flow.gldNav?.toFixed(2) || "—"}
                      </td>
                      <td className="py-2 px-3 text-right text-gray-700">
                        {flow.gldSharesOutstanding
                          ? (flow.gldSharesOutstanding / 1e6).toFixed(2)
                          : "—"}
                      </td>
                      <td
                        className={`py-2 px-3 text-right ${
                          (flow.estimatedFlowUsd || 0) >= 0 ? "text-emerald-600" : "text-red-600"
                        }`}
                      >
                        {flow.estimatedFlowUsd
                          ? `${flow.estimatedFlowUsd >= 0 ? "+" : ""}$${(flow.estimatedFlowUsd / 1e6).toFixed(1)}M`
                          : "—"}
                      </td>
                      <td className="py-2 px-3 text-right text-gray-400 text-xs">
                        {flow.source || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <p className="text-gray-400 text-sm">No flow data. Click &quot;Sync GLD Data&quot; to fetch.</p>
        )}
      </div>

      {/* Thesis Notes */}
      <div className="card p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">📝 Thesis Notes</h2>
        {editMode ? (
          <textarea
            value={thesisNotes}
            onChange={(e) => setThesisNotes(e.target.value)}
            className="w-full px-4 py-3 border rounded-lg font-mono text-sm"
            rows={10}
            placeholder="Your gold thesis in markdown..."
          />
        ) : thesisNotes ? (
          <div 
            className="prose prose-sm max-w-none text-gray-700"
            dangerouslySetInnerHTML={{ __html: marked(thesisNotes) as string }}
          />
        ) : (
          <p className="text-gray-400 text-sm">No thesis notes. Click Edit to add.</p>
        )}
      </div>

      {/* Quick Stats */}
      <div className="card p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">📊 Quick Stats</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="text-xs text-gray-500 font-medium uppercase">GLD AUM (est)</div>
            <div className="text-xl font-bold text-gray-900">
              {data?.gld?.price && data?.gld?.sharesOutstanding
                ? `$${((data.gld.price * data.gld.sharesOutstanding) / 1e9).toFixed(1)}B`
                : "—"}
            </div>
          </div>
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="text-xs text-gray-500 font-medium uppercase">52W Range</div>
            <div className="text-lg font-bold text-gray-900">
              ${data?.gld?.fiftyTwoWeekLow?.toFixed(0) || "—"} - $
              {data?.gld?.fiftyTwoWeekHigh?.toFixed(0) || "—"}
            </div>
          </div>
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="text-xs text-gray-500 font-medium uppercase">Central Bank Buying</div>
            <div className="text-xl font-bold text-gray-900">
              {data?.flows[0]?.centralBankTonnes
                ? `${data.flows[0].centralBankTonnes}t`
                : "—"}
            </div>
            <div className="text-xs text-gray-400">Quarterly</div>
          </div>
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="text-xs text-gray-500 font-medium uppercase">Global ETF Flows</div>
            <div className="text-xl font-bold text-gray-900">
              {data?.flows[0]?.globalEtfFlowUsd
                ? `$${(data.flows[0].globalEtfFlowUsd / 1e9).toFixed(1)}B`
                : "—"}
            </div>
            <div className="text-xs text-gray-400">Monthly</div>
          </div>
        </div>
      </div>

      {/* Last Updated */}
      {data?.analysis?.updatedAt && (
        <div className="text-center text-xs text-gray-400 mt-6">
          Analysis updated: {new Date(data.analysis.updatedAt).toLocaleString()}
        </div>
      )}
    </>
  );
}
