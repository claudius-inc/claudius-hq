"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
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
  sector: string | null;
  notes: string | null;
  tags: string[];
  themeIds: number[];
}

export function EditTickerModal({
  open,
  ticker,
  onClose,
  redirectAfterDelete,
}: EditTickerModalProps) {
  const router = useRouter();
  const { toast } = useToast();

  const [name, setName] = useState("");
  const [sector, setSector] = useState("");
  const [notes, setNotes] = useState("");

  const [tags, setTags] = useState<string[]>([]);
  const [pendingNewTags, setPendingNewTags] = useState<string[]>([]);
  const [themeIds, setThemeIds] = useState<string[]>([]);
  const [pendingNewThemes, setPendingNewThemes] = useState<string[]>([]);

  const [allThemes, setAllThemes] = useState<ThemeRow[]>([]);
  const [market, setMarket] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const reset = useCallback(() => {
    setName("");
    setSector("");
    setNotes("");
    setTags([]);
    setPendingNewTags([]);
    setThemeIds([]);
    setPendingNewThemes([]);
    setMarket("");
    setLoading(false);
    setLoadError(null);
    setSubmitting(false);
    setSubmitError(null);
    setConfirmingDelete(false);
    setDeleting(false);
  }, []);

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
          // Lite endpoint is DB-only; the heavy /api/themes fans out
          // Yahoo calls per ticker × period and would block the modal.
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
          setSector(data.sector ?? "");
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
      // assume new on failure
    }
    if (!isExisting) {
      setPendingNewTags((prev) => (prev.includes(tag) ? prev : [...prev, tag]));
    }
  };

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

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setSubmitError(null);

    try {
      const body = {
        name: name.trim() || null,
        sector: sector.trim() || null,
        notes: notes.trim() || null,
        tags,
        themeIds: themeIds
          .map((id) => Number(id))
          .filter((n) => !Number.isNaN(n)),
        newThemes: pendingNewThemes.map((nm) => ({ name: nm })),
      };

      const res = await fetch(`/api/tickers/${encodeURIComponent(ticker)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as { error?: string; ticker?: string };

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

  return (
    <Modal open={open} onClose={onClose} title={`Edit ${ticker}`} size="md">
      {loading ? (
        <div className="py-8 text-center text-sm text-gray-500">
          <span className="inline-flex items-center gap-2">
            <span className="h-3 w-3 border border-gray-400 border-t-transparent rounded-full animate-spin" />
            Loading…
          </span>
        </div>
      ) : loadError ? (
        <div className="py-8 text-center text-sm text-red-600">{loadError}</div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
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
              Sector (optional)
            </label>
            <input
              type="text"
              value={sector}
              onChange={(e) => setSector(e.target.value)}
              placeholder="e.g. Technology"
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

          {confirmingDelete ? (
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
          ) : (
            <div className="flex items-center justify-between gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmingDelete(true)}
                disabled={!canDelete}
                className="text-sm font-medium text-red-600 hover:text-red-700 hover:underline disabled:text-red-300 disabled:no-underline"
              >
                Delete ticker
              </button>
              <div className="flex gap-2">
                <button type="button" onClick={onClose} className="btn-secondary">
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!canSubmit}
                  className="btn-primary"
                >
                  {submitting ? "Saving…" : "Save changes"}
                </button>
              </div>
            </div>
          )}
        </form>
      )}
    </Modal>
  );
}
