"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, ArrowLeft } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { TagComboBox, type ComboOption } from "./TagComboBox";

interface EditTickerModalProps {
  open: boolean;
  ticker: string;
  onClose: () => void;
  /** Path to navigate to after a successful delete (e.g. away from the
   *  ticker detail page since it would otherwise be empty). If omitted,
   *  the modal just closes and refreshes the current route. */
  redirectAfterDelete?: string;
}

interface ThemeRow {
  id: number;
  name: string;
}

interface TickerData {
  ticker: string;
  market: string;
  name: string | null;
  notes: string | null;
  tags: string[];
  themeIds: number[];
}

interface SuggestedTag {
  name: string;
  isExisting: boolean;
}
interface SuggestedTheme {
  name: string;
  id: number | null;
  isExisting: boolean;
}
interface RedraftResponse {
  ticker?: string;
  description?: string;
  tags?: SuggestedTag[];
  themes?: SuggestedTheme[];
  error?: string;
}

type Mode = "edit" | "review";

// Read-only display of an existing string value (em-dash if blank).
function CurrentText({ value, multiline = false }: { value: string; multiline?: boolean }) {
  if (!value.trim()) {
    return <p className="text-sm text-gray-400 italic">—</p>;
  }
  return (
    <p className={`text-sm text-gray-700 ${multiline ? "whitespace-pre-wrap" : ""}`}>
      {value}
    </p>
  );
}

// Read-only chip list for tags / themes on the Current side.
function CurrentChips({ items }: { items: string[] }) {
  if (items.length === 0) {
    return <p className="text-sm text-gray-400 italic">—</p>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {items.map((item, i) => (
        <span
          key={`${item}-${i}`}
          className="inline-flex items-center px-2 py-0.5 text-xs rounded-md border bg-white text-gray-700 border-gray-200"
        >
          {item}
        </span>
      ))}
    </div>
  );
}

function ReviewRow({
  label,
  current,
  proposed,
}: {
  label: string;
  current: React.ReactNode;
  proposed: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium text-gray-700">{label}</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="rounded-md border border-gray-200 bg-gray-50 p-3 space-y-1.5">
          <span className="text-[10px] uppercase tracking-wider text-gray-400">
            Current
          </span>
          {current}
        </div>
        <div className="rounded-md border border-amber-200 bg-amber-50/40 p-3 space-y-1.5">
          <span className="text-[10px] uppercase tracking-wider text-amber-600">
            AI suggestion (editable)
          </span>
          {proposed}
        </div>
      </div>
    </div>
  );
}

export function EditTickerModal({
  open,
  ticker,
  onClose,
  redirectAfterDelete,
}: EditTickerModalProps) {
  const router = useRouter();
  const { toast } = useToast();

  // Live form state — what the user types and what gets PATCH'd.
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [pendingNewTags, setPendingNewTags] = useState<string[]>([]);
  const [themeIds, setThemeIds] = useState<string[]>([]);
  const [pendingNewThemes, setPendingNewThemes] = useState<string[]>([]);

  // AI proposal mirror state — only populated during review.
  const [aiNotes, setAiNotes] = useState("");
  const [aiTags, setAiTags] = useState<string[]>([]);
  const [aiPendingNewTags, setAiPendingNewTags] = useState<string[]>([]);
  const [aiThemeIds, setAiThemeIds] = useState<string[]>([]);
  const [aiPendingNewThemes, setAiPendingNewThemes] = useState<string[]>([]);

  const [allThemes, setAllThemes] = useState<ThemeRow[]>([]);
  const [market, setMarket] = useState<string>("");
  const [mode, setMode] = useState<Mode>("edit");
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [redrafting, setRedrafting] = useState(false);

  const clearAi = useCallback(() => {
    setAiNotes("");
    setAiTags([]);
    setAiPendingNewTags([]);
    setAiThemeIds([]);
    setAiPendingNewThemes([]);
  }, []);

  const reset = useCallback(() => {
    setName("");
    setNotes("");
    setTags([]);
    setPendingNewTags([]);
    setThemeIds([]);
    setPendingNewThemes([]);
    setMarket("");
    clearAi();
    setMode("edit");
    setLoading(false);
    setLoadError(null);
    setSubmitting(false);
    setSubmitError(null);
    setConfirmingDelete(false);
    setDeleting(false);
    setRedrafting(false);
  }, [clearAi]);

  useEffect(() => {
    if (!open) reset();
  }, [open, reset]);

  // Load existing ticker data + theme catalog when the modal opens.
  useEffect(() => {
    if (!open || !ticker) return;
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    (async () => {
      try {
        const [tickerRes, themesRes] = await Promise.all([
          fetch(`/api/tickers/${encodeURIComponent(ticker)}`),
          fetch("/api/themes/lite"),
        ]);
        if (cancelled) return;

        if (!tickerRes.ok) {
          const errBody = (await tickerRes.json().catch(() => ({}))) as {
            error?: string;
          };
          setLoadError(errBody.error || `Failed to load ${ticker}`);
        } else {
          const data = (await tickerRes.json()) as TickerData;
          if (cancelled) return;
          setName(data.name ?? "");
          setNotes(data.notes ?? "");
          setTags(data.tags ?? []);
          setThemeIds((data.themeIds ?? []).map((id) => String(id)));
          setMarket(data.market ?? "");
        }

        if (themesRes.ok) {
          const themeData = (await themesRes.json()) as { themes?: ThemeRow[] };
          if (!cancelled && Array.isArray(themeData.themes)) {
            setAllThemes(
              themeData.themes.map((t) => ({ id: t.id, name: t.name })),
            );
          }
        }
      } catch (e) {
        if (!cancelled) setLoadError(String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, ticker]);

  const loadTagOptions = useCallback(
    async (query: string): Promise<ComboOption[]> => {
      const params = new URLSearchParams({ limit: "30" });
      if (query) params.set("q", query);
      try {
        const res = await fetch(`/api/tags?${params}`);
        if (!res.ok) return [];
        const data = (await res.json()) as {
          tags?: { name: string; count: number }[];
        };
        return (data.tags || []).map((t) => ({
          value: t.name,
          label: t.name,
          hint: `${t.count}`,
        }));
      } catch {
        return [];
      }
    },
    [],
  );

  const loadThemeOptions = useCallback(
    async (query: string): Promise<ComboOption[]> => {
      const q = query.toLowerCase();
      return allThemes
        .filter((t) => t.name.toLowerCase().includes(q))
        .map((t) => ({ value: String(t.id), label: t.name }));
    },
    [allThemes],
  );

  // ── Live form (Edit mode) tag/theme handlers ──
  const pendingNewTagSet = useMemo(
    () => new Set(pendingNewTags),
    [pendingNewTags],
  );
  const tagLabels = useMemo(() => {
    const out: Record<string, string> = {};
    for (const t of tags) {
      out[t] = pendingNewTagSet.has(t) ? `✨ ${t}` : t;
    }
    return out;
  }, [tags, pendingNewTagSet]);
  const themeLabels = useMemo(() => {
    const out: Record<string, string> = {};
    for (const t of allThemes) out[String(t.id)] = t.name;
    for (const n of pendingNewThemes) out[`new:${n}`] = `✨ ${n} (new)`;
    return out;
  }, [allThemes, pendingNewThemes]);
  const themeSelectionForCombo = useMemo(
    () => [...themeIds, ...pendingNewThemes.map((n) => `new:${n}`)],
    [themeIds, pendingNewThemes],
  );
  const newThemeValueSet = useMemo(
    () => new Set(pendingNewThemes.map((n) => `new:${n}`)),
    [pendingNewThemes],
  );
  const onTagsChange = (next: string[]) => {
    setTags(next);
    setPendingNewTags((prev) => prev.filter((t) => next.includes(t)));
  };
  const onThemesChange = (next: string[]) => {
    const ids = next.filter((v) => !v.startsWith("new:"));
    const news = next
      .filter((v) => v.startsWith("new:"))
      .map((v) => v.slice(4));
    setThemeIds(ids);
    setPendingNewThemes(news);
  };
  const onCreateTheme = (query: string) => {
    if (!query.trim()) return;
    const exists = allThemes.some(
      (t) => t.name.toLowerCase() === query.toLowerCase(),
    );
    if (exists) return;
    if (pendingNewThemes.includes(query)) return;
    setPendingNewThemes((prev) => [...prev, query]);
  };
  const onCreateTag = async (query: string) => {
    const tag = query.trim().toLowerCase();
    if (!tag || tags.includes(tag)) return;
    setTags((prev) => [...prev, tag]);
    let isExisting = false;
    try {
      const params = new URLSearchParams({ q: tag, limit: "10" });
      const res = await fetch(`/api/tags?${params}`);
      if (res.ok) {
        const data = (await res.json()) as { tags?: { name: string }[] };
        isExisting = !!data.tags?.some((t) => t.name === tag);
      }
    } catch {
      /* assume new */
    }
    if (!isExisting) {
      setPendingNewTags((prev) => (prev.includes(tag) ? prev : [...prev, tag]));
    }
  };

  // ── AI proposal (Review mode) tag/theme handlers ──
  const aiPendingNewTagSet = useMemo(
    () => new Set(aiPendingNewTags),
    [aiPendingNewTags],
  );
  const aiTagLabels = useMemo(() => {
    const out: Record<string, string> = {};
    for (const t of aiTags) {
      out[t] = aiPendingNewTagSet.has(t) ? `✨ ${t}` : t;
    }
    return out;
  }, [aiTags, aiPendingNewTagSet]);
  const aiThemeLabels = useMemo(() => {
    const out: Record<string, string> = {};
    for (const t of allThemes) out[String(t.id)] = t.name;
    for (const n of aiPendingNewThemes) out[`new:${n}`] = `✨ ${n} (new)`;
    return out;
  }, [allThemes, aiPendingNewThemes]);
  const aiThemeSelectionForCombo = useMemo(
    () => [...aiThemeIds, ...aiPendingNewThemes.map((n) => `new:${n}`)],
    [aiThemeIds, aiPendingNewThemes],
  );
  const aiNewThemeValueSet = useMemo(
    () => new Set(aiPendingNewThemes.map((n) => `new:${n}`)),
    [aiPendingNewThemes],
  );
  const onAiTagsChange = (next: string[]) => {
    setAiTags(next);
    setAiPendingNewTags((prev) => prev.filter((t) => next.includes(t)));
  };
  const onAiThemesChange = (next: string[]) => {
    const ids = next.filter((v) => !v.startsWith("new:"));
    const news = next
      .filter((v) => v.startsWith("new:"))
      .map((v) => v.slice(4));
    setAiThemeIds(ids);
    setAiPendingNewThemes(news);
  };
  const onAiCreateTheme = (query: string) => {
    if (!query.trim()) return;
    const exists = allThemes.some(
      (t) => t.name.toLowerCase() === query.toLowerCase(),
    );
    if (exists) return;
    if (aiPendingNewThemes.includes(query)) return;
    setAiPendingNewThemes((prev) => [...prev, query]);
  };
  const onAiCreateTag = async (query: string) => {
    const tag = query.trim().toLowerCase();
    if (!tag || aiTags.includes(tag)) return;
    setAiTags((prev) => [...prev, tag]);
    let isExisting = false;
    try {
      const params = new URLSearchParams({ q: tag, limit: "10" });
      const res = await fetch(`/api/tags?${params}`);
      if (res.ok) {
        const data = (await res.json()) as { tags?: { name: string }[] };
        isExisting = !!data.tags?.some((t) => t.name === tag);
      }
    } catch {
      /* assume new */
    }
    if (!isExisting) {
      setAiPendingNewTags((prev) =>
        prev.includes(tag) ? prev : [...prev, tag],
      );
    }
  };

  // Map the current theme catalog so we can resolve theme names that come
  // back from /redraft as either id-bearing (existing) or name-only (new).
  const themesByName = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of allThemes) m.set(t.name.toLowerCase(), t.id);
    return m;
  }, [allThemes]);

  // Render-current display strings derived from the live form state.
  const currentTagDisplay = useMemo(() => tags.slice(), [tags]);
  const currentThemeDisplay = useMemo(() => {
    const idsAsNames: string[] = [];
    for (const id of themeIds) {
      const t = allThemes.find((x) => String(x.id) === id);
      if (t) idsAsNames.push(t.name);
    }
    return [...idsAsNames, ...pendingNewThemes];
  }, [themeIds, pendingNewThemes, allThemes]);

  // ── Re-draft (fetch AI proposal and switch to review mode) ──
  const onRedraft = async () => {
    if (redrafting) return;
    setRedrafting(true);
    try {
      const res = await fetch(
        `/api/tickers/${encodeURIComponent(ticker)}/redraft`,
        { method: "POST" },
      );
      const data = (await res.json()) as RedraftResponse;
      if (!res.ok) {
        toast(data.error || "Failed to draft", "error");
        return;
      }
      // description → notes
      setAiNotes(data.description ?? "");
      // tags
      const proposedTags = (data.tags ?? []).map((t) => t.name);
      const proposedNewTags = (data.tags ?? [])
        .filter((t) => !t.isExisting)
        .map((t) => t.name);
      setAiTags(proposedTags);
      setAiPendingNewTags(proposedNewTags);
      // themes — split into existing (have id) and new
      const existingThemeIds: string[] = [];
      const newThemeNames: string[] = [];
      for (const th of data.themes ?? []) {
        if (th.isExisting && th.id != null) {
          existingThemeIds.push(String(th.id));
        } else if (!th.isExisting && th.name) {
          // If the AI suggested a name that has since become an existing
          // theme (race), fold it into existing rather than pendingNew.
          const matchedId = themesByName.get(th.name.toLowerCase());
          if (matchedId != null) existingThemeIds.push(String(matchedId));
          else newThemeNames.push(th.name);
        }
      }
      setAiThemeIds(existingThemeIds);
      setAiPendingNewThemes(newThemeNames);
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

  // ── Submit handlers (edit mode = Save changes; review mode = Confirm) ──
  const canSubmit =
    !loading && !submitting && !deleting && !loadError && !confirmingDelete;
  const canDelete = !loading && !submitting && !deleting && !loadError;

  const onDelete = async () => {
    if (!canDelete) return;
    setDeleting(true);
    setSubmitError(null);
    try {
      const res = await fetch(`/api/tickers/${encodeURIComponent(ticker)}`, {
        method: "DELETE",
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!res.ok) {
        const msg = data.error || "Failed to delete ticker";
        setSubmitError(msg);
        toast(msg, "error");
        return;
      }
      toast(`Deleted ${ticker}`, "success");
      onClose();
      if (redirectAfterDelete) {
        router.push(redirectAfterDelete);
      } else {
        router.refresh();
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setSubmitError(msg);
      toast(msg, "error");
    } finally {
      setDeleting(false);
    }
  };

  const onSubmitEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const body = {
        name: name.trim() || null,
        notes: notes.trim() || null,
        tags,
        themeIds: themeIds.map((id) => Number(id)).filter((n) => !Number.isNaN(n)),
        newThemes: pendingNewThemes.map((nm) => ({ name: nm })),
      };
      const res = await fetch(`/api/tickers/${encodeURIComponent(ticker)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setSubmitError(data.error || "Failed to update ticker");
        toast(data.error || "Failed to update ticker", "error");
        return;
      }
      toast(`Updated ${ticker}`, "success");
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

  const onSubmitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const body = {
        // Keep name untouched in this PATCH — review only covers description /
        // tags / themes. Existing structural fields persist.
        notes: aiNotes.trim() || null,
        tags: aiTags,
        themeIds: aiThemeIds.map((id) => Number(id)).filter((n) => !Number.isNaN(n)),
        newThemes: aiPendingNewThemes.map((nm) => ({ name: nm })),
      };
      const res = await fetch(`/api/tickers/${encodeURIComponent(ticker)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setSubmitError(data.error || "Failed to apply AI draft");
        toast(data.error || "Failed to apply AI draft", "error");
        return;
      }
      toast(`AI draft applied to ${ticker}`, "success");
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

  const editFormId = "edit-ticker-form";
  const reviewFormId = "edit-ticker-review-form";

  const editFooter = !confirmingDelete && (
    <div className="flex items-center justify-between gap-2 flex-wrap">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => setConfirmingDelete(true)}
          disabled={!canDelete}
          className="text-sm font-medium text-red-600 hover:text-red-700 hover:underline disabled:text-red-300 disabled:no-underline"
        >
          Delete
        </button>
        <button
          type="button"
          onClick={onRedraft}
          disabled={redrafting || submitting || !canSubmit}
          className="inline-flex items-center gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 hover:bg-amber-100 disabled:opacity-50"
        >
          <Sparkles className="w-3.5 h-3.5" />
          {redrafting ? "Drafting…" : "Re-draft via AI"}
        </button>
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={onClose} className="btn-secondary">
          Cancel
        </button>
        <button
          form={editFormId}
          type="submit"
          disabled={!canSubmit || redrafting}
          className="btn-primary"
        >
          {submitting ? "Saving…" : "Save changes"}
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
  const title =
    mode === "review"
      ? `Review AI draft — ${ticker}`
      : `Edit ${ticker}`;
  const size = mode === "review" ? "xl" : "md";

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size={size}
      footer={
        showFooter ? (mode === "review" ? reviewFooter : editFooter) : undefined
      }
    >
      {loading ? (
        <div className="py-8 text-center text-sm text-gray-500">
          <span className="inline-flex items-center gap-2">
            <span className="h-3 w-3 border border-gray-400 border-t-transparent rounded-full animate-spin" />
            Loading…
          </span>
        </div>
      ) : loadError ? (
        <div className="py-8 text-center text-sm text-red-600">{loadError}</div>
      ) : mode === "edit" ? (
        <form id={editFormId} onSubmit={onSubmitEdit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Ticker
              </label>
              <input
                type="text"
                value={ticker}
                disabled
                className="input w-full font-mono bg-gray-50 text-gray-500 cursor-not-allowed"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Market
              </label>
              <input
                type="text"
                value={market}
                disabled
                className="input w-full bg-gray-50 text-gray-500 cursor-not-allowed"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input w-full"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description (optional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="1-2 sentence summary of what the company does"
              className="input w-full resize-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Tags
            </label>
            <TagComboBox
              selected={tags}
              onChange={onTagsChange}
              loadOptions={loadTagOptions}
              onCreate={onCreateTag}
              labels={tagLabels}
              newValues={pendingNewTagSet}
              placeholder="Search or create tags…"
              lowerCase
              ariaLabel="Tags"
            />
            {pendingNewTags.length > 0 && (
              <p className="text-xs text-amber-600 mt-1">
                Will create {pendingNewTags.length} new tag
                {pendingNewTags.length === 1 ? "" : "s"} on save.
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Themes
            </label>
            <TagComboBox
              selected={themeSelectionForCombo}
              onChange={onThemesChange}
              loadOptions={loadThemeOptions}
              onCreate={onCreateTheme}
              labels={themeLabels}
              newValues={newThemeValueSet}
              placeholder="Search or create themes…"
              ariaLabel="Themes"
            />
            {pendingNewThemes.length > 0 && (
              <p className="text-xs text-amber-600 mt-1">
                Will create {pendingNewThemes.length} new theme
                {pendingNewThemes.length === 1 ? "" : "s"} on save.
              </p>
            )}
          </div>

          {submitError && <p className="text-sm text-red-600">{submitError}</p>}

          {confirmingDelete && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 space-y-2">
              <p className="text-sm text-red-800">
                Delete <span className="font-mono font-semibold">{ticker}</span>?
                This removes its registry entry, computed metrics, tag links,
                and theme memberships. Trade-journal entries and research
                reports are kept.
              </p>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(false)}
                  disabled={deleting}
                  className="btn-secondary text-xs"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={onDelete}
                  disabled={deleting}
                  className="inline-flex items-center px-3 py-1.5 rounded-md text-xs font-medium text-white bg-red-600 hover:bg-red-700 disabled:bg-red-300 transition-colors"
                >
                  {deleting ? "Deleting…" : "Yes, delete"}
                </button>
              </div>
            </div>
          )}
        </form>
      ) : (
        // Review mode — side-by-side comparison for description / tags / themes
        <form id={reviewFormId} onSubmit={onSubmitReview} className="space-y-5">
          <p className="text-xs text-gray-500 leading-relaxed">
            Compare the AI suggestion to the current ticker. Edit anything on
            the right side before confirming. Nothing is saved until you click
            <span className="font-medium"> Confirm changes</span>.
          </p>

          <ReviewRow
            label="Description"
            current={<CurrentText value={notes} multiline />}
            proposed={
              <textarea
                value={aiNotes}
                onChange={(e) => setAiNotes(e.target.value)}
                rows={3}
                className="input w-full resize-none"
              />
            }
          />

          <ReviewRow
            label="Tags"
            current={<CurrentChips items={currentTagDisplay} />}
            proposed={
              <div className="space-y-1">
                <TagComboBox
                  selected={aiTags}
                  onChange={onAiTagsChange}
                  loadOptions={loadTagOptions}
                  onCreate={onAiCreateTag}
                  labels={aiTagLabels}
                  newValues={aiPendingNewTagSet}
                  placeholder="Search or create tags…"
                  lowerCase
                  ariaLabel="AI tags"
                />
                {aiPendingNewTags.length > 0 && (
                  <p className="text-[11px] text-amber-600">
                    Will create {aiPendingNewTags.length} new tag
                    {aiPendingNewTags.length === 1 ? "" : "s"} on confirm.
                  </p>
                )}
              </div>
            }
          />

          <ReviewRow
            label="Themes"
            current={<CurrentChips items={currentThemeDisplay} />}
            proposed={
              <div className="space-y-1">
                <TagComboBox
                  selected={aiThemeSelectionForCombo}
                  onChange={onAiThemesChange}
                  loadOptions={loadThemeOptions}
                  onCreate={onAiCreateTheme}
                  labels={aiThemeLabels}
                  newValues={aiNewThemeValueSet}
                  placeholder="Search or create themes…"
                  ariaLabel="AI themes"
                />
                {aiPendingNewThemes.length > 0 && (
                  <p className="text-[11px] text-amber-600">
                    Will create {aiPendingNewThemes.length} new theme
                    {aiPendingNewThemes.length === 1 ? "" : "s"} on confirm.
                  </p>
                )}
              </div>
            }
          />

          {submitError && <p className="text-sm text-red-600">{submitError}</p>}
        </form>
      )}
    </Modal>
  );
}
