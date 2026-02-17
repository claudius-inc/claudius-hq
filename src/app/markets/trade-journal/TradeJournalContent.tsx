"use client";

import { useEffect, useState, useCallback } from "react";

interface JournalEntry {
  id: number;
  ticker: string;
  action: string;
  price: number;
  shares: number | null;
  date: string;
  thesis: string;
  catalysts: string | null;
  invalidators: string | null;
  outcome: string | null;
  exitPrice: number | null;
  exitDate: string | null;
  lessonsLearned: string | null;
  emotionalState: string | null;
  tags: string;
  createdAt: string;
  updatedAt: string;
}

interface Stats {
  total: number;
  open: number;
  closed: number;
  wins: number;
  losses: number;
  breakeven: number;
  winRate: number;
  avgReturn: number;
  bestReturn: number;
  worstReturn: number;
  avgHoldingDays: number;
}

const ACTIONS = ["buy", "sell", "trim", "add"] as const;
const OUTCOMES = ["open", "win", "loss", "breakeven"] as const;
const EMOTIONS = ["conviction", "FOMO", "fear", "opportunistic", "neutral", "uncertain"] as const;

const ACTION_COLORS: Record<string, string> = {
  buy: "bg-green-100 text-green-800",
  add: "bg-emerald-100 text-emerald-800",
  sell: "bg-red-100 text-red-800",
  trim: "bg-orange-100 text-orange-800",
};

const OUTCOME_COLORS: Record<string, string> = {
  open: "bg-blue-100 text-blue-800",
  win: "bg-green-100 text-green-800",
  loss: "bg-red-100 text-red-800",
  breakeven: "bg-gray-100 text-gray-800",
};

export function TradeJournalContent() {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showCloseForm, setShowCloseForm] = useState<number | null>(null);
  const [filterTicker, setFilterTicker] = useState("");
  const [filterOutcome, setFilterOutcome] = useState("");

  const fetchData = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (filterTicker) params.set("ticker", filterTicker);
      if (filterOutcome) params.set("outcome", filterOutcome);

      const [entriesRes, statsRes] = await Promise.all([
        fetch(`/api/trade-journal?${params}`),
        fetch("/api/trade-journal?stats=true"),
      ]);

      const entriesData = await entriesRes.json();
      const statsData = await statsRes.json();

      setEntries(entriesData.entries || []);
      setStats(statsData);
    } catch (e) {
      console.error("Failed to fetch:", e);
    } finally {
      setLoading(false);
    }
  }, [filterTicker, filterOutcome]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this journal entry?")) return;
    await fetch(`/api/trade-journal/${id}`, { method: "DELETE" });
    fetchData();
  };

  if (loading) {
    return <div className="text-center py-12 text-gray-400">Loading trade journal…</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Trade Journal</h1>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors"
        >
          {showForm ? "Cancel" : "+ New Entry"}
        </button>
      </div>

      {/* Stats Banner */}
      {stats && stats.total > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { label: "Total Trades", value: stats.total },
            { label: "Win Rate", value: stats.closed > 0 ? `${stats.winRate}%` : "—" },
            { label: "Avg Return", value: stats.closed > 0 ? `${stats.avgReturn}%` : "—" },
            { label: "Avg Holding", value: stats.avgHoldingDays > 0 ? `${stats.avgHoldingDays}d` : "—" },
            { label: "Open", value: stats.open },
          ].map((s) => (
            <div key={s.label} className="bg-white border border-gray-200 rounded-lg p-3 text-center">
              <div className="text-xs text-gray-500">{s.label}</div>
              <div className="text-lg font-bold">{s.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* New Entry Form */}
      {showForm && (
        <NewEntryForm
          onSaved={() => {
            setShowForm(false);
            fetchData();
          }}
        />
      )}

      {/* Filters */}
      <div className="flex gap-3 items-center">
        <input
          type="text"
          placeholder="Filter by ticker…"
          value={filterTicker}
          onChange={(e) => setFilterTicker(e.target.value.toUpperCase())}
          className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg w-32"
        />
        <select
          value={filterOutcome}
          onChange={(e) => setFilterOutcome(e.target.value)}
          className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg"
        >
          <option value="">All outcomes</option>
          {OUTCOMES.map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
      </div>

      {/* Entries List */}
      {entries.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          No journal entries yet. Start logging your trades!
        </div>
      ) : (
        <div className="space-y-3">
          {entries.map((entry) => (
            <div key={entry.id} className="bg-white border border-gray-200 rounded-lg overflow-hidden">
              {/* Summary Row */}
              <div
                className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors"
                onClick={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
              >
                <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${ACTION_COLORS[entry.action] || "bg-gray-100"}`}>
                  {entry.action.toUpperCase()}
                </span>
                <span className="font-bold text-sm">{entry.ticker}</span>
                <span className="text-sm text-gray-500">${entry.price.toFixed(2)}</span>
                {entry.shares && <span className="text-xs text-gray-400">{entry.shares} shares</span>}
                <span className="text-xs text-gray-400">{entry.date}</span>
                <span className={`ml-auto px-2 py-0.5 text-xs font-medium rounded-full ${OUTCOME_COLORS[entry.outcome || "open"]}`}>
                  {(entry.outcome || "open").toUpperCase()}
                </span>
                {entry.exitPrice && (
                  <span className={`text-xs font-medium ${entry.exitPrice > entry.price ? "text-green-600" : "text-red-600"}`}>
                    {(((entry.exitPrice - entry.price) / entry.price) * 100).toFixed(1)}%
                  </span>
                )}
                <svg className={`w-4 h-4 text-gray-400 transition-transform ${expandedId === entry.id ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>

              {/* Expanded Detail */}
              {expandedId === entry.id && (
                <div className="px-4 pb-4 border-t border-gray-100 space-y-3">
                  <div className="pt-3">
                    <div className="text-xs font-medium text-gray-500 mb-1">Thesis</div>
                    <p className="text-sm text-gray-800 whitespace-pre-wrap">{entry.thesis}</p>
                  </div>
                  {entry.catalysts && (
                    <div>
                      <div className="text-xs font-medium text-gray-500 mb-1">Catalysts</div>
                      <p className="text-sm text-gray-700 whitespace-pre-wrap">{entry.catalysts}</p>
                    </div>
                  )}
                  {entry.invalidators && (
                    <div>
                      <div className="text-xs font-medium text-gray-500 mb-1">Invalidators</div>
                      <p className="text-sm text-gray-700 whitespace-pre-wrap">{entry.invalidators}</p>
                    </div>
                  )}
                  {entry.emotionalState && (
                    <div>
                      <div className="text-xs font-medium text-gray-500 mb-1">Emotional State</div>
                      <span className="text-xs bg-purple-100 text-purple-800 px-2 py-0.5 rounded-full">{entry.emotionalState}</span>
                    </div>
                  )}
                  {entry.lessonsLearned && (
                    <div>
                      <div className="text-xs font-medium text-gray-500 mb-1">Lessons Learned</div>
                      <p className="text-sm text-gray-700 whitespace-pre-wrap">{entry.lessonsLearned}</p>
                    </div>
                  )}
                  {entry.exitPrice && (
                    <div className="flex gap-4 text-sm">
                      <span><span className="text-gray-500">Exit:</span> ${entry.exitPrice.toFixed(2)}</span>
                      {entry.exitDate && <span><span className="text-gray-500">Date:</span> {entry.exitDate}</span>}
                    </div>
                  )}

                  {/* Action buttons */}
                  <div className="flex gap-2 pt-2">
                    {entry.outcome === "open" && (
                      <button
                        onClick={(e) => { e.stopPropagation(); setShowCloseForm(showCloseForm === entry.id ? null : entry.id); }}
                        className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                      >
                        Close Trade
                      </button>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDelete(entry.id); }}
                      className="px-3 py-1.5 text-xs text-red-600 border border-red-200 rounded-lg hover:bg-red-50"
                    >
                      Delete
                    </button>
                  </div>

                  {/* Close Trade Form */}
                  {showCloseForm === entry.id && (
                    <CloseTradeForm
                      entryId={entry.id}
                      onSaved={() => {
                        setShowCloseForm(null);
                        fetchData();
                      }}
                    />
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── New Entry Form ──────────────────────────────────── */

function NewEntryForm({ onSaved }: { onSaved: () => void }) {
  const [form, setForm] = useState({
    ticker: "",
    action: "buy" as string,
    price: "",
    shares: "",
    date: new Date().toISOString().slice(0, 10),
    thesis: "",
    catalysts: "",
    invalidators: "",
    emotionalState: "",
  });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/trade-journal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          price: parseFloat(form.price),
          shares: form.shares ? parseFloat(form.shares) : null,
        }),
      });
      if (res.ok) onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white border border-gray-200 rounded-lg p-4 space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Ticker *</label>
          <input
            required
            value={form.ticker}
            onChange={(e) => setForm({ ...form, ticker: e.target.value.toUpperCase() })}
            className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg"
            placeholder="AAPL"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Action *</label>
          <select
            value={form.action}
            onChange={(e) => setForm({ ...form, action: e.target.value })}
            className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg"
          >
            {ACTIONS.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Price *</label>
          <input
            required
            type="number"
            step="0.01"
            value={form.price}
            onChange={(e) => setForm({ ...form, price: e.target.value })}
            className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Shares</label>
          <input
            type="number"
            step="0.01"
            value={form.shares}
            onChange={(e) => setForm({ ...form, shares: e.target.value })}
            className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Date *</label>
          <input
            required
            type="date"
            value={form.date}
            onChange={(e) => setForm({ ...form, date: e.target.value })}
            className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Emotional State</label>
          <select
            value={form.emotionalState}
            onChange={(e) => setForm({ ...form, emotionalState: e.target.value })}
            className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg"
          >
            <option value="">Select…</option>
            {EMOTIONS.map((e) => <option key={e} value={e}>{e}</option>)}
          </select>
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">Thesis * — Why this trade?</label>
        <textarea
          required
          rows={3}
          value={form.thesis}
          onChange={(e) => setForm({ ...form, thesis: e.target.value })}
          className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg"
          placeholder="What's your investment thesis?"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Catalysts</label>
          <textarea
            rows={2}
            value={form.catalysts}
            onChange={(e) => setForm({ ...form, catalysts: e.target.value })}
            className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg"
            placeholder="Expected catalysts…"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Invalidators</label>
          <textarea
            rows={2}
            value={form.invalidators}
            onChange={(e) => setForm({ ...form, invalidators: e.target.value })}
            className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg"
            placeholder="What would prove thesis wrong?"
          />
        </div>
      </div>
      <button
        type="submit"
        disabled={saving}
        className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 disabled:opacity-50"
      >
        {saving ? "Saving…" : "Save Entry"}
      </button>
    </form>
  );
}

/* ── Close Trade Form ────────────────────────────────── */

function CloseTradeForm({ entryId, onSaved }: { entryId: number; onSaved: () => void }) {
  const [form, setForm] = useState({
    outcome: "win" as string,
    exitPrice: "",
    exitDate: new Date().toISOString().slice(0, 10),
    lessonsLearned: "",
  });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch(`/api/trade-journal/${entryId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          outcome: form.outcome,
          exitPrice: form.exitPrice ? parseFloat(form.exitPrice) : null,
          exitDate: form.exitDate,
          lessonsLearned: form.lessonsLearned || null,
        }),
      });
      if (res.ok) onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="bg-gray-50 rounded-lg p-3 space-y-3 mt-2">
      <div className="text-xs font-medium text-gray-700">Close Trade</div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Outcome</label>
          <select
            value={form.outcome}
            onChange={(e) => setForm({ ...form, outcome: e.target.value })}
            className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded-lg"
          >
            <option value="win">Win</option>
            <option value="loss">Loss</option>
            <option value="breakeven">Breakeven</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Exit Price</label>
          <input
            type="number"
            step="0.01"
            value={form.exitPrice}
            onChange={(e) => setForm({ ...form, exitPrice: e.target.value })}
            className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded-lg"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Exit Date</label>
          <input
            type="date"
            value={form.exitDate}
            onChange={(e) => setForm({ ...form, exitDate: e.target.value })}
            className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded-lg"
          />
        </div>
      </div>
      <div>
        <label className="block text-xs text-gray-500 mb-1">Lessons Learned</label>
        <textarea
          rows={2}
          value={form.lessonsLearned}
          onChange={(e) => setForm({ ...form, lessonsLearned: e.target.value })}
          className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded-lg"
          placeholder="What did you learn from this trade?"
        />
      </div>
      <button
        type="submit"
        disabled={saving}
        className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
      >
        {saving ? "Saving…" : "Close Trade"}
      </button>
    </form>
  );
}
