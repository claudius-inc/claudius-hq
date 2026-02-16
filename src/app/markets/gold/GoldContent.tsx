"use client";

import { useState, useEffect, useCallback } from "react";
import { formatDate } from "@/lib/format-date";
import {
  GoldData,
  KeyLevel,
  Scenario,
  GoldPriceCard,
  GoldCorrelations,
  GoldKeyLevels,
  GoldScenarios,
  GoldFlowsChart,
  GoldThesisNotes,
  GoldQuickStats,
} from "@/components/gold";

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
      if (res.ok) await fetchData();
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
        body: JSON.stringify({ keyLevels, scenarios, thesisNotes, ath, athDate }),
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

  return (
    <>
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">🥇 Gold Analysis</h1>
            <p className="text-sm text-gray-500 mt-1">Track gold prices, ETF flows, and key levels</p>
          </div>
          <div className="flex gap-2">
            <button onClick={syncFlows} disabled={syncing} className="px-4 py-2 bg-amber-100 text-amber-700 rounded-lg text-sm font-medium hover:bg-amber-200 disabled:opacity-50">
              {syncing ? "Syncing..." : "🔄 Sync GLD Data"}
            </button>
            <button onClick={() => (editMode ? saveAnalysis() : setEditMode(true))} disabled={saving} className={`px-4 py-2 rounded-lg text-sm font-medium ${editMode ? "bg-emerald-600 text-white hover:bg-emerald-700" : "bg-gray-100 text-gray-700 hover:bg-gray-200"} disabled:opacity-50`}>
              {saving ? "Saving..." : editMode ? "✓ Save" : "✏️ Edit"}
            </button>
            {editMode && (
              <button onClick={() => setEditMode(false)} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200">
                Cancel
              </button>
            )}
          </div>
        </div>
      </div>

      <GoldPriceCard
        livePrice={livePrice}
        storedAth={storedAth}
        athDate={data?.analysis?.athDate || athDate}
        editMode={editMode}
        ath={ath}
        setAth={setAth}
        setAthDate={setAthDate}
        changeFromAth={changeFromAth}
        gld={data?.gld || null}
      />

      <GoldCorrelations dxy={data?.dxy || null} realYields={data?.realYields || null} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <GoldKeyLevels
          keyLevels={keyLevels}
          livePrice={livePrice}
          editMode={editMode}
          onAdd={() => setKeyLevels([...keyLevels, { level: 0, significance: "" }])}
          onRemove={(idx) => setKeyLevels(keyLevels.filter((_, i) => i !== idx))}
          onUpdate={(idx, field, value) => {
            const updated = [...keyLevels];
            updated[idx] = { ...updated[idx], [field]: value };
            setKeyLevels(updated);
          }}
        />
        <GoldScenarios
          scenarios={scenarios}
          editMode={editMode}
          onUpdate={(idx, field, value) => {
            const updated = [...scenarios];
            updated[idx] = { ...updated[idx], [field]: value };
            setScenarios(updated);
          }}
        />
      </div>

      <GoldFlowsChart flows={data?.flows || []} />

      <GoldThesisNotes thesisNotes={thesisNotes} editMode={editMode} onChange={setThesisNotes} />

      <GoldQuickStats gld={data?.gld || null} flows={data?.flows || []} />

      {data?.analysis?.updatedAt && (
        <div className="text-center text-xs text-gray-400 mt-6">
          Analysis updated: {formatDate(data.analysis.updatedAt)}
        </div>
      )}
    </>
  );
}
