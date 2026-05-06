"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import type { TickerProfile } from "@/lib/ticker-ai";

interface EditTickerProfileModalProps {
  open: boolean;
  ticker: string;
  onClose: () => void;
}

interface SegmentDraft {
  item: string;
  pct: string; // string while editing so we can support "" and partial numbers
}

interface ProfileResponse {
  profile?: TickerProfile;
  error?: string;
}

function profileToDraft(p: TickerProfile | null): {
  revenueModel: string;
  cyclicality: string;
  customerConcentration: string;
  tailwinds: string;
  headwinds: string;
  threats: string;
  opportunities: string;
  segments: SegmentDraft[];
} {
  return {
    revenueModel: p?.revenueModel ?? "",
    cyclicality: p?.cyclicality ?? "",
    customerConcentration: p?.customerConcentration ?? "",
    // The four list fields are edited as one-per-line text; this is much
    // simpler to author than per-row chip editors and round-trips cleanly.
    tailwinds: (p?.tailwinds ?? []).join("\n"),
    headwinds: (p?.headwinds ?? []).join("\n"),
    threats: (p?.threats ?? []).join("\n"),
    opportunities: (p?.opportunities ?? []).join("\n"),
    segments:
      p?.revenueSegments && p.revenueSegments.length > 0
        ? p.revenueSegments.map((s) => ({ item: s.item, pct: String(s.pct) }))
        : [],
  };
}

function linesToList(s: string): string[] {
  return s
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

export function EditTickerProfileModal({
  open,
  ticker,
  onClose,
}: EditTickerProfileModalProps) {
  const router = useRouter();
  const { toast } = useToast();

  const [revenueModel, setRevenueModel] = useState("");
  const [cyclicality, setCyclicality] = useState("");
  const [customerConcentration, setCustomerConcentration] = useState("");
  const [tailwinds, setTailwinds] = useState("");
  const [headwinds, setHeadwinds] = useState("");
  const [threats, setThreats] = useState("");
  const [opportunities, setOpportunities] = useState("");
  const [segments, setSegments] = useState<SegmentDraft[]>([]);

  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const reset = useCallback(() => {
    const empty = profileToDraft(null);
    setRevenueModel(empty.revenueModel);
    setCyclicality(empty.cyclicality);
    setCustomerConcentration(empty.customerConcentration);
    setTailwinds(empty.tailwinds);
    setHeadwinds(empty.headwinds);
    setThreats(empty.threats);
    setOpportunities(empty.opportunities);
    setSegments(empty.segments);
    setLoading(false);
    setLoadError(null);
    setSubmitting(false);
    setSubmitError(null);
  }, []);

  // Pre-fill from the API when the modal opens.
  useEffect(() => {
    if (!open) {
      reset();
      return;
    }
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    (async () => {
      try {
        const res = await fetch(`/api/tickers/${encodeURIComponent(ticker)}`);
        const data = (await res.json()) as ProfileResponse;
        if (cancelled) return;
        if (!res.ok) {
          setLoadError(data.error || "Failed to load profile");
          return;
        }
        const draft = profileToDraft(data.profile ?? null);
        setRevenueModel(draft.revenueModel);
        setCyclicality(draft.cyclicality);
        setCustomerConcentration(draft.customerConcentration);
        setTailwinds(draft.tailwinds);
        setHeadwinds(draft.headwinds);
        setThreats(draft.threats);
        setOpportunities(draft.opportunities);
        setSegments(draft.segments);
      } catch (err) {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, ticker, reset]);

  const updateSegment = (
    index: number,
    field: "item" | "pct",
    value: string,
  ) => {
    setSegments((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const addSegment = () => {
    setSegments((prev) => [...prev, { item: "", pct: "" }]);
  };

  const removeSegment = (index: number) => {
    setSegments((prev) => prev.filter((_, i) => i !== index));
  };

  const segmentTotal = segments.reduce((acc, s) => {
    const n = Number(s.pct);
    return acc + (Number.isFinite(n) ? n : 0);
  }, 0);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    const cleanedSegments = segments
      .map((s) => ({
        item: s.item.trim(),
        pct: Number(s.pct),
      }))
      .filter((s) => s.item.length > 0 && Number.isFinite(s.pct));

    const profile: TickerProfile = {
      revenueModel: revenueModel.trim() || null,
      revenueSegments: cleanedSegments.length > 0 ? cleanedSegments : null,
      cyclicality: cyclicality.trim() || null,
      tailwinds: linesToList(tailwinds).length > 0 ? linesToList(tailwinds) : null,
      headwinds: linesToList(headwinds).length > 0 ? linesToList(headwinds) : null,
      threats: linesToList(threats).length > 0 ? linesToList(threats) : null,
      opportunities:
        linesToList(opportunities).length > 0
          ? linesToList(opportunities)
          : null,
      customerConcentration: customerConcentration.trim() || null,
    };

    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch(`/api/tickers/${encodeURIComponent(ticker)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setSubmitError(data.error || "Failed to save profile");
        toast(data.error || "Failed to save profile", "error");
        return;
      }
      toast("Profile saved", "success");
      router.refresh();
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setSubmitError(msg);
      toast(msg, "error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={`Edit profile — ${ticker}`} size="lg">
      {loading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : loadError ? (
        <p className="text-sm text-red-600">{loadError}</p>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Revenue model
            </label>
            <textarea
              value={revenueModel}
              onChange={(e) => setRevenueModel(e.target.value)}
              rows={2}
              placeholder="One sentence on how the company makes money"
              className="input w-full resize-none"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-sm font-medium text-gray-700">
                Revenue segments
              </label>
              <span
                className={`text-xs tabular-nums ${
                  Math.abs(segmentTotal - 100) <= 5 || segments.length === 0
                    ? "text-gray-400"
                    : "text-amber-600"
                }`}
              >
                {segments.length === 0
                  ? "none"
                  : `${segmentTotal.toFixed(0)}% total`}
              </span>
            </div>
            <div className="space-y-2">
              {segments.map((seg, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={seg.item}
                    onChange={(e) => updateSegment(i, "item", e.target.value)}
                    placeholder="Segment name"
                    className="input flex-1"
                  />
                  <input
                    type="number"
                    value={seg.pct}
                    onChange={(e) => updateSegment(i, "pct", e.target.value)}
                    placeholder="%"
                    min={0}
                    max={100}
                    step={1}
                    className="input w-20 text-right tabular-nums"
                  />
                  <button
                    type="button"
                    onClick={() => removeSegment(i)}
                    className="text-gray-400 hover:text-red-600"
                    aria-label="Remove segment"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={addSegment}
                className="inline-flex items-center gap-1.5 text-xs text-gray-600 hover:text-gray-900"
              >
                <Plus className="w-3.5 h-3.5" />
                Add segment
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Cyclicality
            </label>
            <textarea
              value={cyclicality}
              onChange={(e) => setCyclicality(e.target.value)}
              rows={2}
              placeholder="e.g. highly cyclical, tied to capex / defensive consumer staples / secular AI demand"
              className="input w-full resize-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Customer concentration
            </label>
            <textarea
              value={customerConcentration}
              onChange={(e) => setCustomerConcentration(e.target.value)}
              rows={2}
              placeholder="Top customers / largest % of revenue / 'diversified' / 'unknown'"
              className="input w-full resize-none"
            />
          </div>

          <p className="text-[11px] text-gray-400 pt-1">
            Tailwinds, headwinds, threats, and opportunities — one bullet per
            line.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Tailwinds
              </label>
              <textarea
                value={tailwinds}
                onChange={(e) => setTailwinds(e.target.value)}
                rows={4}
                className="input w-full resize-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Headwinds
              </label>
              <textarea
                value={headwinds}
                onChange={(e) => setHeadwinds(e.target.value)}
                rows={4}
                className="input w-full resize-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Opportunities
              </label>
              <textarea
                value={opportunities}
                onChange={(e) => setOpportunities(e.target.value)}
                rows={4}
                className="input w-full resize-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Threats
              </label>
              <textarea
                value={threats}
                onChange={(e) => setThreats(e.target.value)}
                rows={4}
                className="input w-full resize-none"
              />
            </div>
          </div>

          {submitError && <p className="text-sm text-red-600">{submitError}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary">
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="btn-primary"
            >
              {submitting ? "Saving…" : "Save profile"}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
