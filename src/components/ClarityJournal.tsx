"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, Trash2, Save, ChevronDown, ChevronRight } from "lucide-react";

interface JournalEntry {
  id: number;
  asset: string;
  decision: string | null;
  data: string;
  created_at: string | null;
  updated_at: string | null;
}

interface JournalData {
  // Section 1: Asset & Context
  assetTicker: string;
  assetName: string;
  currentPrice: string;
  priceDate: string;
  
  // Section 2: Thesis Clarity
  bullThesis: string;
  bearThesis: string;
  personalConviction: string;
  thesisOneYear: string;
  
  // Section 3: Entry Analysis
  targetEntry: string;
  currentVsTarget: string;
  waitingFor: string;
  rushPressure: string;
  
  // Section 4: Position Sizing
  maxPositionSize: string;
  currentExposure: string;
  proposedSize: string;
  sizeRationale: string;
  
  // Section 5: Risk Assessment
  invalidators: string;
  stopLoss: string;
  maxLoss: string;
  opportunityCost: string;
  
  // Section 6: Emotional Audit
  emotionalState: string;
  fomo: string;
  recentNews: string;
  worstCase: string;
  
  // Section 7: Decision
  finalDecision: string;
  decisionRationale: string;
  reviewDate: string;
}

const emptyData: JournalData = {
  assetTicker: "",
  assetName: "",
  currentPrice: "",
  priceDate: "",
  bullThesis: "",
  bearThesis: "",
  personalConviction: "",
  thesisOneYear: "",
  targetEntry: "",
  currentVsTarget: "",
  waitingFor: "",
  rushPressure: "",
  maxPositionSize: "",
  currentExposure: "",
  proposedSize: "",
  sizeRationale: "",
  invalidators: "",
  stopLoss: "",
  maxLoss: "",
  opportunityCost: "",
  emotionalState: "",
  fomo: "",
  recentNews: "",
  worstCase: "",
  finalDecision: "",
  decisionRationale: "",
  reviewDate: "",
};

const DECISION_COLORS: Record<string, string> = {
  buy: "bg-[#2d6a4f] text-white",
  sell: "bg-[#9d0208] text-white",
  hold: "bg-[#b08d15] text-white",
  wait: "bg-[#4a5568] text-white",
};

const DECISION_OPTIONS = [
  { value: "", label: "Select decision..." },
  { value: "buy", label: "🟢 BUY — Execute the trade" },
  { value: "sell", label: "🔴 SELL — Exit the position" },
  { value: "hold", label: "🟡 HOLD — Maintain current position" },
  { value: "wait", label: "⚪ WAIT — Not yet, review later" },
];

export function ClarityJournal() {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [formData, setFormData] = useState<JournalData>(emptyData);
  const [decision, setDecision] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    context: true,
    thesis: true,
    entry: true,
    sizing: true,
    risk: true,
    emotional: true,
    decision: true,
  });

  const fetchEntries = useCallback(async () => {
    try {
      const res = await fetch("/api/clarity-journal");
      const data = await res.json();
      setEntries(data.entries || []);
    } catch (e) {
      console.error("Failed to fetch clarity journal entries:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  const selectEntry = (entry: JournalEntry) => {
    setSelectedId(entry.id);
    try {
      const parsed = JSON.parse(entry.data || "{}");
      setFormData({ ...emptyData, ...parsed });
    } catch {
      setFormData(emptyData);
    }
    setDecision(entry.decision || "");
  };

  const handleNew = () => {
    setSelectedId(null);
    setFormData(emptyData);
    setDecision("");
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = {
        id: selectedId,
        asset: formData.assetTicker || formData.assetName || "Untitled",
        decision: decision || null,
        data: formData,
      };

      if (selectedId) {
        // Update existing
        const res = await fetch("/api/clarity-journal", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (data.entry) {
          setEntries(entries.map((e) => (e.id === selectedId ? data.entry : e)));
        }
      } else {
        // Create new
        const res = await fetch("/api/clarity-journal", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (data.entry) {
          setEntries([data.entry, ...entries]);
          setSelectedId(data.entry.id);
        }
      }
    } catch (e) {
      console.error("Failed to save:", e);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedId) return;
    if (!confirm("Delete this journal entry?")) return;

    try {
      await fetch(`/api/clarity-journal?id=${selectedId}`, { method: "DELETE" });
      setEntries(entries.filter((e) => e.id !== selectedId));
      handleNew();
    } catch (e) {
      console.error("Failed to delete:", e);
    }
  };

  const updateField = (field: keyof JournalData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const SectionHeader = ({
    id,
    title,
    icon,
  }: {
    id: string;
    title: string;
    icon: string;
  }) => (
    <button
      onClick={() => toggleSection(id)}
      className="w-full flex items-center gap-2 py-2 text-left font-medium text-gray-900 hover:text-emerald-700 transition-colors"
    >
      {expandedSections[id] ? (
        <ChevronDown className="w-4 h-4 text-gray-400" />
      ) : (
        <ChevronRight className="w-4 h-4 text-gray-400" />
      )}
      <span className="text-lg">{icon}</span>
      <span>{title}</span>
    </button>
  );

  const Field = ({
    label,
    value,
    onChange,
    multiline = false,
    placeholder = "",
  }: {
    label: string;
    value: string;
    onChange: (v: string) => void;
    multiline?: boolean;
    placeholder?: string;
  }) => (
    <div className="space-y-1">
      <label className="text-sm font-medium text-gray-700">{label}</label>
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={3}
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent resize-none"
        />
      ) : (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
        />
      )}
    </div>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-6 w-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-2xl">静</span>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              Investment Clarity Journal
            </h2>
            <p className="text-sm text-gray-500">
              観 — Observe before acting
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleNew}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-white border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-700"
          >
            <Plus className="w-4 h-4" />
            New
          </button>
          {selectedId && (
            <button
              onClick={handleDelete}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-white border border-red-200 text-red-600 rounded-lg hover:bg-red-50"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Entry List */}
        <div className="lg:col-span-1">
          <div className="bg-white border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-[70vh] overflow-y-auto">
            {entries.length === 0 ? (
              <div className="p-4 text-center text-sm text-gray-500">
                No entries yet. Start a new one!
              </div>
            ) : (
              entries.map((entry) => {
                const entryData = JSON.parse(entry.data || "{}");
                const title = entry.asset || entryData.assetTicker || entryData.assetName || "Untitled";
                const isSelected = entry.id === selectedId;

                return (
                  <button
                    key={entry.id}
                    onClick={() => selectEntry(entry)}
                    className={`w-full p-3 text-left hover:bg-gray-50 transition-colors ${
                      isSelected ? "bg-emerald-50 border-l-2 border-emerald-500" : ""
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900 truncate flex-1">
                        {title}
                      </span>
                      {entry.decision && (
                        <span
                          className={`px-1.5 py-0.5 text-xs rounded ${
                            DECISION_COLORS[entry.decision] || "bg-gray-100 text-gray-600"
                          }`}
                        >
                          {entry.decision.toUpperCase()}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-400 mt-1">
                      {entry.updated_at
                        ? new Date(entry.updated_at).toLocaleDateString()
                        : "No date"}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Form */}
        <div className="lg:col-span-3 space-y-4">
          {/* Section 1: Asset & Context */}
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <SectionHeader id="context" title="Asset & Context" icon="📊" />
            {expandedSections.context && (
              <div className="grid grid-cols-2 gap-4 mt-3">
                <Field
                  label="Ticker"
                  value={formData.assetTicker}
                  onChange={(v) => updateField("assetTicker", v)}
                  placeholder="e.g., AAPL, BTC, GLD"
                />
                <Field
                  label="Asset Name"
                  value={formData.assetName}
                  onChange={(v) => updateField("assetName", v)}
                  placeholder="e.g., Apple Inc."
                />
                <Field
                  label="Current Price"
                  value={formData.currentPrice}
                  onChange={(v) => updateField("currentPrice", v)}
                  placeholder="e.g., $175.50"
                />
                <Field
                  label="Price Date"
                  value={formData.priceDate}
                  onChange={(v) => updateField("priceDate", v)}
                  placeholder="e.g., 2026-03-20"
                />
              </div>
            )}
          </div>

          {/* Section 2: Thesis Clarity */}
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <SectionHeader id="thesis" title="Thesis Clarity" icon="💡" />
            {expandedSections.thesis && (
              <div className="space-y-4 mt-3">
                <Field
                  label="Bull Thesis (Why this could work)"
                  value={formData.bullThesis}
                  onChange={(v) => updateField("bullThesis", v)}
                  multiline
                  placeholder="What's the core investment thesis? Why will this asset appreciate?"
                />
                <Field
                  label="Bear Thesis (What could go wrong)"
                  value={formData.bearThesis}
                  onChange={(v) => updateField("bearThesis", v)}
                  multiline
                  placeholder="What are the key risks? What's the bear case?"
                />
                <Field
                  label="Personal Conviction Level"
                  value={formData.personalConviction}
                  onChange={(v) => updateField("personalConviction", v)}
                  placeholder="e.g., High / Medium / Low — and why"
                />
                <Field
                  label="Where will this be in 1 year?"
                  value={formData.thesisOneYear}
                  onChange={(v) => updateField("thesisOneYear", v)}
                  multiline
                  placeholder="Your realistic expectation of price / outcome in 12 months"
                />
              </div>
            )}
          </div>

          {/* Section 3: Entry Analysis */}
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <SectionHeader id="entry" title="Entry Analysis" icon="🎯" />
            {expandedSections.entry && (
              <div className="space-y-4 mt-3">
                <Field
                  label="Target Entry Price / Range"
                  value={formData.targetEntry}
                  onChange={(v) => updateField("targetEntry", v)}
                  placeholder="e.g., $150-160 accumulation zone"
                />
                <Field
                  label="Current Price vs Target"
                  value={formData.currentVsTarget}
                  onChange={(v) => updateField("currentVsTarget", v)}
                  placeholder="e.g., 10% above target — wait for pullback"
                />
                <Field
                  label="What am I waiting for?"
                  value={formData.waitingFor}
                  onChange={(v) => updateField("waitingFor", v)}
                  multiline
                  placeholder="Specific catalyst, price level, or confirmation signal"
                />
                <Field
                  label="Why am I feeling rushed?"
                  value={formData.rushPressure}
                  onChange={(v) => updateField("rushPressure", v)}
                  multiline
                  placeholder="Identify any FOMO or urgency. Is it justified?"
                />
              </div>
            )}
          </div>

          {/* Section 4: Position Sizing */}
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <SectionHeader id="sizing" title="Position Sizing" icon="⚖️" />
            {expandedSections.sizing && (
              <div className="space-y-4 mt-3">
                <Field
                  label="Max Position Size (% of portfolio)"
                  value={formData.maxPositionSize}
                  onChange={(v) => updateField("maxPositionSize", v)}
                  placeholder="e.g., 5% max"
                />
                <Field
                  label="Current Exposure"
                  value={formData.currentExposure}
                  onChange={(v) => updateField("currentExposure", v)}
                  placeholder="e.g., 2% currently held"
                />
                <Field
                  label="Proposed Size for This Trade"
                  value={formData.proposedSize}
                  onChange={(v) => updateField("proposedSize", v)}
                  placeholder="e.g., Add 1.5% (bringing total to 3.5%)"
                />
                <Field
                  label="Size Rationale"
                  value={formData.sizeRationale}
                  onChange={(v) => updateField("sizeRationale", v)}
                  multiline
                  placeholder="Why this size? Risk-adjusted reasoning"
                />
              </div>
            )}
          </div>

          {/* Section 5: Risk Assessment */}
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <SectionHeader id="risk" title="Risk Assessment" icon="🛡️" />
            {expandedSections.risk && (
              <div className="space-y-4 mt-3">
                <Field
                  label="Thesis Invalidators"
                  value={formData.invalidators}
                  onChange={(v) => updateField("invalidators", v)}
                  multiline
                  placeholder="What would make the thesis wrong? When to exit?"
                />
                <Field
                  label="Stop Loss / Mental Stop"
                  value={formData.stopLoss}
                  onChange={(v) => updateField("stopLoss", v)}
                  placeholder="e.g., Exit if below $140 for 2 weeks"
                />
                <Field
                  label="Max Loss I'm Willing to Accept"
                  value={formData.maxLoss}
                  onChange={(v) => updateField("maxLoss", v)}
                  placeholder="e.g., $5,000 or 1% of portfolio"
                />
                <Field
                  label="Opportunity Cost"
                  value={formData.opportunityCost}
                  onChange={(v) => updateField("opportunityCost", v)}
                  multiline
                  placeholder="What else could I do with this capital? Better opportunities?"
                />
              </div>
            )}
          </div>

          {/* Section 6: Emotional Audit */}
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <SectionHeader id="emotional" title="Emotional Audit" icon="🧘" />
            {expandedSections.emotional && (
              <div className="space-y-4 mt-3">
                <Field
                  label="Current Emotional State"
                  value={formData.emotionalState}
                  onChange={(v) => updateField("emotionalState", v)}
                  placeholder="e.g., Calm / Anxious / Excited / Fearful"
                />
                <Field
                  label="FOMO Level (1-10)"
                  value={formData.fomo}
                  onChange={(v) => updateField("fomo", v)}
                  placeholder="e.g., 7 — been watching it run up"
                />
                <Field
                  label="Recent News/Events Influencing Me"
                  value={formData.recentNews}
                  onChange={(v) => updateField("recentNews", v)}
                  multiline
                  placeholder="Any recent headlines or events driving urgency?"
                />
                <Field
                  label="Worst Case Scenario Exercise"
                  value={formData.worstCase}
                  onChange={(v) => updateField("worstCase", v)}
                  multiline
                  placeholder="If I buy now and it drops 30% tomorrow, how do I feel?"
                />
              </div>
            )}
          </div>

          {/* Section 7: Decision */}
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <SectionHeader id="decision" title="Final Decision" icon="✅" />
            {expandedSections.decision && (
              <div className="space-y-4 mt-3">
                <div className="space-y-1">
                  <label className="text-sm font-medium text-gray-700">
                    Decision
                  </label>
                  <select
                    value={decision}
                    onChange={(e) => setDecision(e.target.value)}
                    className={`w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent ${
                      decision ? DECISION_COLORS[decision] : "text-gray-900"
                    }`}
                  >
                    {DECISION_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value} className="text-gray-900 bg-white">
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
                <Field
                  label="Decision Rationale"
                  value={formData.decisionRationale}
                  onChange={(v) => updateField("decisionRationale", v)}
                  multiline
                  placeholder="Summarize why you made this decision. Future you will thank you."
                />
                <Field
                  label="Review Date"
                  value={formData.reviewDate}
                  onChange={(v) => updateField("reviewDate", v)}
                  placeholder="e.g., 2026-04-20 — revisit in 1 month"
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
