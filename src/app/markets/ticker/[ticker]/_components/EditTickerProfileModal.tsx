"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Sparkles, ArrowLeft } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import type { TickerProfile } from "@/lib/ai/ticker-ai";

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

interface ProfileDraft {
  revenueModel: string;
  cyclicality: string;
  customerConcentration: string;
  tailwinds: string;
  headwinds: string;
  threats: string;
  opportunities: string;
  segments: SegmentDraft[];
}

function profileToDraft(p: TickerProfile | null): ProfileDraft {
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

function emptyDraft(): ProfileDraft {
  return profileToDraft(null);
}

function linesToList(s: string): string[] {
  return s
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

function draftToProfile(draft: {
  revenueModel: string;
  cyclicality: string;
  customerConcentration: string;
  tailwinds: string;
  headwinds: string;
  threats: string;
  opportunities: string;
  segments: SegmentDraft[];
}): TickerProfile {
  const cleanedSegments = draft.segments
    .map((s) => ({ item: s.item.trim(), pct: Number(s.pct) }))
    .filter((s) => s.item.length > 0 && Number.isFinite(s.pct));
  const tw = linesToList(draft.tailwinds);
  const hw = linesToList(draft.headwinds);
  const th = linesToList(draft.threats);
  const op = linesToList(draft.opportunities);
  return {
    revenueModel: draft.revenueModel.trim() || null,
    revenueSegments: cleanedSegments.length > 0 ? cleanedSegments : null,
    cyclicality: draft.cyclicality.trim() || null,
    tailwinds: tw.length > 0 ? tw : null,
    headwinds: hw.length > 0 ? hw : null,
    threats: th.length > 0 ? th : null,
    opportunities: op.length > 0 ? op : null,
    customerConcentration: draft.customerConcentration.trim() || null,
  };
}

// Read-only display of an existing string value (or em-dash if blank).
function CurrentText({ value, multiline = false }: { value: string; multiline?: boolean }) {
  if (!value.trim()) {
    return (
      <p className="text-sm text-gray-400 italic">—</p>
    );
  }
  return (
    <p className={`text-sm text-gray-700 ${multiline ? "whitespace-pre-wrap" : ""}`}>
      {value}
    </p>
  );
}

function CurrentSegments({ segments }: { segments: SegmentDraft[] }) {
  if (segments.length === 0) {
    return <p className="text-sm text-gray-400 italic">—</p>;
  }
  return (
    <ul className="space-y-1 text-sm text-gray-700">
      {segments.map((s, i) => (
        <li
          key={`current-seg-${i}`}
          className="flex items-center justify-between gap-2"
        >
          <span className="truncate">{s.item || "—"}</span>
          <span className="tabular-nums text-gray-500 shrink-0">
            {s.pct === "" ? "—" : `${Number(s.pct).toFixed(0)}%`}
          </span>
        </li>
      ))}
    </ul>
  );
}

// Side-by-side comparison row used in review mode. Mobile stacks vertically
// (Current → AI suggestion), desktop renders them in 2 columns.
function ReviewRow({
  label,
  meta,
  current,
  proposed,
}: {
  label: string;
  meta?: React.ReactNode;
  current: React.ReactNode;
  proposed: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium text-gray-700">{label}</h3>
        {meta}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="rounded-md border border-gray-200 bg-gray-50 p-3 space-y-1">
          <span className="text-[10px] uppercase tracking-wider text-gray-400">
            Current
          </span>
          {current}
        </div>
        <div className="rounded-md border border-amber-200 bg-amber-50/40 p-3 space-y-1">
          <span className="text-[10px] uppercase tracking-wider text-amber-600">
            AI suggestion (editable)
          </span>
          {proposed}
        </div>
      </div>
    </div>
  );
}

type Mode = "edit" | "review";

export function EditTickerProfileModal({
  open,
  ticker,
  onClose,
}: EditTickerProfileModalProps) {
  const router = useRouter();
  const { toast } = useToast();

  // The "live" form state. In edit mode this is what the user types and what
  // gets PATCH'd. In review mode this is the **left side** (the unchanged
  // original) and we don't mutate it until Confirm.
  const [revenueModel, setRevenueModel] = useState("");
  const [cyclicality, setCyclicality] = useState("");
  const [customerConcentration, setCustomerConcentration] = useState("");
  const [tailwinds, setTailwinds] = useState("");
  const [headwinds, setHeadwinds] = useState("");
  const [threats, setThreats] = useState("");
  const [opportunities, setOpportunities] = useState("");
  const [segments, setSegments] = useState<SegmentDraft[]>([]);

  // Mirror state for the AI proposal during review. Only populated after a
  // successful redraft fetch; cleared on Back / Confirm / modal close.
  const [aiRevenueModel, setAiRevenueModel] = useState("");
  const [aiCyclicality, setAiCyclicality] = useState("");
  const [aiCustomerConcentration, setAiCustomerConcentration] = useState("");
  const [aiTailwinds, setAiTailwinds] = useState("");
  const [aiHeadwinds, setAiHeadwinds] = useState("");
  const [aiThreats, setAiThreats] = useState("");
  const [aiOpportunities, setAiOpportunities] = useState("");
  const [aiSegments, setAiSegments] = useState<SegmentDraft[]>([]);

  const [mode, setMode] = useState<Mode>("edit");
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [redrafting, setRedrafting] = useState(false);

  const applyDraft = useCallback(
    (
      draft: ProfileDraft,
      setters: {
        rm: (v: string) => void;
        cy: (v: string) => void;
        cc: (v: string) => void;
        tw: (v: string) => void;
        hw: (v: string) => void;
        th: (v: string) => void;
        op: (v: string) => void;
        sg: (v: SegmentDraft[]) => void;
      },
    ) => {
      setters.rm(draft.revenueModel);
      setters.cy(draft.cyclicality);
      setters.cc(draft.customerConcentration);
      setters.tw(draft.tailwinds);
      setters.hw(draft.headwinds);
      setters.th(draft.threats);
      setters.op(draft.opportunities);
      setters.sg(draft.segments);
    },
    [],
  );

  const clearAi = useCallback(() => {
    applyDraft(emptyDraft(), {
      rm: setAiRevenueModel,
      cy: setAiCyclicality,
      cc: setAiCustomerConcentration,
      tw: setAiTailwinds,
      hw: setAiHeadwinds,
      th: setAiThreats,
      op: setAiOpportunities,
      sg: setAiSegments,
    });
  }, [applyDraft]);

  const reset = useCallback(() => {
    applyDraft(emptyDraft(), {
      rm: setRevenueModel,
      cy: setCyclicality,
      cc: setCustomerConcentration,
      tw: setTailwinds,
      hw: setHeadwinds,
      th: setThreats,
      op: setOpportunities,
      sg: setSegments,
    });
    clearAi();
    setMode("edit");
    setLoading(false);
    setLoadError(null);
    setSubmitting(false);
    setSubmitError(null);
    setRedrafting(false);
  }, [applyDraft, clearAi]);

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
        applyDraft(draft, {
          rm: setRevenueModel,
          cy: setCyclicality,
          cc: setCustomerConcentration,
          tw: setTailwinds,
          hw: setHeadwinds,
          th: setThreats,
          op: setOpportunities,
          sg: setSegments,
        });
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
  }, [open, ticker, reset, applyDraft]);

  // Segment editors — one for the live form, one for the AI side.
  const updateSegment = (i: number, field: "item" | "pct", value: string) => {
    setSegments((prev) => {
      const next = [...prev];
      next[i] = { ...next[i], [field]: value };
      return next;
    });
  };
  const addSegment = () =>
    setSegments((prev) => [...prev, { item: "", pct: "" }]);
  const removeSegment = (i: number) =>
    setSegments((prev) => prev.filter((_, k) => k !== i));

  const updateAiSegment = (i: number, field: "item" | "pct", value: string) => {
    setAiSegments((prev) => {
      const next = [...prev];
      next[i] = { ...next[i], [field]: value };
      return next;
    });
  };
  const addAiSegment = () =>
    setAiSegments((prev) => [...prev, { item: "", pct: "" }]);
  const removeAiSegment = (i: number) =>
    setAiSegments((prev) => prev.filter((_, k) => k !== i));

  const segmentTotal = segments.reduce((acc, s) => {
    const n = Number(s.pct);
    return acc + (Number.isFinite(n) ? n : 0);
  }, 0);
  const aiSegmentTotal = aiSegments.reduce((acc, s) => {
    const n = Number(s.pct);
    return acc + (Number.isFinite(n) ? n : 0);
  }, 0);

  // Fetch AI proposal and switch to review mode. Does NOT mutate the live
  // form — the user's typed edits stay on the "Current" side until they
  // confirm.
  const onRedraft = async () => {
    if (redrafting) return;
    setRedrafting(true);
    try {
      const res = await fetch(
        `/api/tickers/${encodeURIComponent(ticker)}/redraft`,
        { method: "POST" },
      );
      const data = (await res.json()) as ProfileResponse;
      if (!res.ok) {
        toast(data.error || "Failed to draft profile", "error");
        return;
      }
      const draft = profileToDraft(data.profile ?? null);
      applyDraft(draft, {
        rm: setAiRevenueModel,
        cy: setAiCyclicality,
        cc: setAiCustomerConcentration,
        tw: setAiTailwinds,
        hw: setAiHeadwinds,
        th: setAiThreats,
        op: setAiOpportunities,
        sg: setAiSegments,
      });
      setMode("review");
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), "error");
    } finally {
      setRedrafting(false);
    }
  };

  const onBackToEdit = () => {
    clearAi();
    setMode("edit");
  };

  // Shared PATCH helper used by both Save (edit mode) and Confirm (review mode).
  const savePatch = async (profile: TickerProfile, successMsg: string) => {
    setSubmitError(null);
    setSubmitting(true);
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
      toast(successMsg, "success");
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

  const onSubmitEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    const profile = draftToProfile({
      revenueModel,
      cyclicality,
      customerConcentration,
      tailwinds,
      headwinds,
      threats,
      opportunities,
      segments,
    });
    await savePatch(profile, "Profile saved");
  };

  const onSubmitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    const profile = draftToProfile({
      revenueModel: aiRevenueModel,
      cyclicality: aiCyclicality,
      customerConcentration: aiCustomerConcentration,
      tailwinds: aiTailwinds,
      headwinds: aiHeadwinds,
      threats: aiThreats,
      opportunities: aiOpportunities,
      segments: aiSegments,
    });
    await savePatch(profile, "AI draft applied");
  };

  const title =
    mode === "review"
      ? `Review AI draft — ${ticker}`
      : `Edit profile — ${ticker}`;
  const size = mode === "review" ? "xl" : "lg";

  // Form ids let us put the submit button in the Modal's footer slot
  // (which lives outside the scrollable content area) while keeping the
  // <form> wrapping just the fields. Pressing Enter inside a field still
  // submits the right form.
  const editFormId = "edit-profile-form";
  const reviewFormId = "review-profile-form";

  const editFooter = (
    <div className="flex items-center justify-between gap-2 flex-wrap">
      <button
        type="button"
        onClick={onRedraft}
        disabled={redrafting || submitting}
        className="inline-flex items-center gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 hover:bg-amber-100 disabled:opacity-50"
      >
        <Sparkles className="w-3.5 h-3.5" />
        {redrafting ? "Drafting…" : "Re-draft via AI"}
      </button>
      <div className="flex items-center gap-2">
        <button type="button" onClick={onClose} className="btn-secondary">
          Cancel
        </button>
        <button
          form={editFormId}
          type="submit"
          disabled={submitting || redrafting}
          className="btn-primary"
        >
          {submitting ? "Saving…" : "Save profile"}
        </button>
      </div>
    </div>
  );

  const reviewFooter = (
    <div className="flex items-center justify-between gap-2 flex-wrap">
      <button
        type="button"
        onClick={onBackToEdit}
        disabled={submitting}
        className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Back to edit
      </button>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onRedraft}
          disabled={redrafting || submitting}
          className="inline-flex items-center gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 hover:bg-amber-100 disabled:opacity-50"
        >
          <Sparkles className="w-3.5 h-3.5" />
          {redrafting ? "Drafting…" : "Re-draft again"}
        </button>
        <button
          form={reviewFormId}
          type="submit"
          disabled={submitting || redrafting}
          className="btn-primary"
        >
          {submitting ? "Saving…" : "Confirm changes"}
        </button>
      </div>
    </div>
  );

  const showFooter = !loading && !loadError;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size={size}
      footer={showFooter ? (mode === "review" ? reviewFooter : editFooter) : undefined}
    >
      {loading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : loadError ? (
        <p className="text-sm text-red-600">{loadError}</p>
      ) : mode === "edit" ? (
        <form id={editFormId} onSubmit={onSubmitEdit} className="space-y-4">
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
        </form>
      ) : (
        // Review mode — side-by-side comparison.
        <form id={reviewFormId} onSubmit={onSubmitReview} className="space-y-5">
          <p className="text-xs text-gray-500 leading-relaxed">
            Compare the AI suggestion to the current profile. Edit anything on
            the right side before confirming. Nothing is saved until you click
            <span className="font-medium"> Confirm changes</span>.
          </p>

          <ReviewRow
            label="Revenue model"
            current={<CurrentText value={revenueModel} multiline />}
            proposed={
              <textarea
                value={aiRevenueModel}
                onChange={(e) => setAiRevenueModel(e.target.value)}
                rows={2}
                className="input w-full resize-none"
              />
            }
          />

          <ReviewRow
            label="Revenue segments"
            meta={
              <span
                className={`text-xs tabular-nums ${
                  Math.abs(aiSegmentTotal - 100) <= 5 || aiSegments.length === 0
                    ? "text-gray-400"
                    : "text-amber-600"
                }`}
              >
                {aiSegments.length === 0
                  ? "none"
                  : `${aiSegmentTotal.toFixed(0)}% total`}
              </span>
            }
            current={<CurrentSegments segments={segments} />}
            proposed={
              <div className="space-y-2">
                {aiSegments.map((seg, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={seg.item}
                      onChange={(e) =>
                        updateAiSegment(i, "item", e.target.value)
                      }
                      placeholder="Segment name"
                      className="input flex-1"
                    />
                    <input
                      type="number"
                      value={seg.pct}
                      onChange={(e) =>
                        updateAiSegment(i, "pct", e.target.value)
                      }
                      placeholder="%"
                      min={0}
                      max={100}
                      step={1}
                      className="input w-16 text-right tabular-nums"
                    />
                    <button
                      type="button"
                      onClick={() => removeAiSegment(i)}
                      className="text-gray-400 hover:text-red-600"
                      aria-label="Remove segment"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={addAiSegment}
                  className="inline-flex items-center gap-1.5 text-xs text-gray-600 hover:text-gray-900"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add segment
                </button>
              </div>
            }
          />

          <ReviewRow
            label="Cyclicality"
            current={<CurrentText value={cyclicality} multiline />}
            proposed={
              <textarea
                value={aiCyclicality}
                onChange={(e) => setAiCyclicality(e.target.value)}
                rows={2}
                className="input w-full resize-none"
              />
            }
          />

          <ReviewRow
            label="Customer concentration"
            current={<CurrentText value={customerConcentration} multiline />}
            proposed={
              <textarea
                value={aiCustomerConcentration}
                onChange={(e) => setAiCustomerConcentration(e.target.value)}
                rows={2}
                className="input w-full resize-none"
              />
            }
          />

          <ReviewRow
            label="Tailwinds"
            current={<CurrentText value={tailwinds} multiline />}
            proposed={
              <textarea
                value={aiTailwinds}
                onChange={(e) => setAiTailwinds(e.target.value)}
                rows={4}
                className="input w-full resize-none"
              />
            }
          />

          <ReviewRow
            label="Headwinds"
            current={<CurrentText value={headwinds} multiline />}
            proposed={
              <textarea
                value={aiHeadwinds}
                onChange={(e) => setAiHeadwinds(e.target.value)}
                rows={4}
                className="input w-full resize-none"
              />
            }
          />

          <ReviewRow
            label="Opportunities"
            current={<CurrentText value={opportunities} multiline />}
            proposed={
              <textarea
                value={aiOpportunities}
                onChange={(e) => setAiOpportunities(e.target.value)}
                rows={4}
                className="input w-full resize-none"
              />
            }
          />

          <ReviewRow
            label="Threats"
            current={<CurrentText value={threats} multiline />}
            proposed={
              <textarea
                value={aiThreats}
                onChange={(e) => setAiThreats(e.target.value)}
                rows={4}
                className="input w-full resize-none"
              />
            }
          />

          {submitError && <p className="text-sm text-red-600">{submitError}</p>}
        </form>
      )}
    </Modal>
  );
}
