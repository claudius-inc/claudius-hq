"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { TagComboBox, type ComboOption } from "./TagComboBox";

interface AddTickerModalProps {
  open: boolean;
  onClose: () => void;
}

interface LookupResult {
  ticker: string;
  normalized: string;
  market: string;
  name: string | null;
  sector: string | null;
  exchange: string | null;
  price: number | null;
  quoteType: string | null;
}

interface ThemeRow {
  id: number;
  name: string;
}

interface AiSuggestion {
  description: string;
  tags: { name: string; isExisting: boolean }[];
  themes: { name: string; id: number | null; isExisting: boolean }[];
}

const MARKETS = ["US", "SGX", "HK", "JP", "CN"] as const;

export function AddTickerModal({ open, onClose }: AddTickerModalProps) {
  const router = useRouter();
  const { toast } = useToast();

  const [tickerInput, setTickerInput] = useState("");
  const [market, setMarket] = useState<string>("");
  const [name, setName] = useState("");
  const [sector, setSector] = useState("");
  const [notes, setNotes] = useState("");

  const [tags, setTags] = useState<string[]>([]);
  const [pendingNewTags, setPendingNewTags] = useState<string[]>([]); // tag names that don't yet exist in DB
  const [themeIds, setThemeIds] = useState<string[]>([]); // string IDs of selected existing themes
  const [pendingNewThemes, setPendingNewThemes] = useState<string[]>([]); // names of themes that will be created

  const [allThemes, setAllThemes] = useState<ThemeRow[]>([]);
  const [lookup, setLookup] = useState<LookupResult | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [aiLoading, setAiLoading] = useState(false);
  const [aiPopulated, setAiPopulated] = useState(false);

  const lookupDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reset = useCallback(() => {
    setTickerInput("");
    setMarket("");
    setName("");
    setSector("");
    setNotes("");
    setTags([]);
    setPendingNewTags([]);
    setThemeIds([]);
    setPendingNewThemes([]);
    setLookup(null);
    setLookupLoading(false);
    setLookupError(null);
    setSubmitError(null);
    setAiLoading(false);
    setAiPopulated(false);
  }, []);

  useEffect(() => {
    if (!open) reset();
  }, [open, reset]);

  // Load themes once when modal opens.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      try {
        // Lite endpoint is DB-only; the heavy /api/themes fans out Yahoo
        // calls per ticker × period which is unnecessary for a name list.
        const res = await fetch("/api/themes/lite");
        if (!res.ok) return;
        const data = (await res.json()) as { themes?: ThemeRow[] };
        if (!cancelled && Array.isArray(data.themes)) {
          setAllThemes(data.themes.map((t) => ({ id: t.id, name: t.name })));
        }
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  // Debounced ticker lookup whenever tickerInput / explicit market changes.
  useEffect(() => {
    const trimmed = tickerInput.trim();
    setLookupError(null);
    if (!trimmed) {
      setLookup(null);
      return;
    }
    if (lookupDebounceRef.current) clearTimeout(lookupDebounceRef.current);
    lookupDebounceRef.current = setTimeout(async () => {
      setLookupLoading(true);
      try {
        const params = new URLSearchParams({ ticker: trimmed });
        if (market) params.set("market", market);
        const res = await fetch(`/api/tickers/lookup?${params}`);
        const data = (await res.json()) as LookupResult & { error?: string };
        if (!res.ok) {
          setLookupError(data.error || "Ticker not found");
          setLookup(null);
        } else {
          setLookup(data);
          setLookupError(null);
          // Auto-fill if user hasn't typed values manually.
          if (!market && data.market) setMarket(data.market);
          if (!name && data.name) setName(data.name);
          if (!sector && data.sector) setSector(data.sector);
        }
      } catch (e) {
        setLookupError(String(e));
        setLookup(null);
      } finally {
        setLookupLoading(false);
      }
    }, 400);
    return () => {
      if (lookupDebounceRef.current) clearTimeout(lookupDebounceRef.current);
    };
    // We intentionally exclude name/sector from deps — those are user-editable
    // post-autofill and shouldn't re-trigger lookup.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tickerInput, market]);

  // After a successful Yahoo lookup, ask Gemini to classify the ticker. Fires
  // at most once per modal session (guarded by `aiPopulated`). If the lookup
  // changes mid-flight (e.g. the lookup effect re-runs because auto-filling
  // `market` mutated its deps), the cleanup aborts the in-flight fetch and
  // unconditionally clears the loading flag so the UI never gets stuck.
  useEffect(() => {
    if (!lookup || aiPopulated) return;
    let active = true;
    const controller = new AbortController();
    setAiLoading(true);
    (async () => {
      try {
        const res = await fetch("/api/tickers/ai-suggest", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ticker: lookup.normalized,
            name: lookup.name,
            sector: lookup.sector,
            exchange: lookup.exchange,
            market: lookup.market,
          }),
          signal: controller.signal,
        });
        if (!active) return;
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          console.warn(
            `[ai-suggest] ${res.status} ${res.statusText}: ${text.slice(0, 200)}`,
          );
          return;
        }
        const data = (await res.json()) as AiSuggestion;
        if (!active) return;

        if (data.description) {
          setNotes((prev) => (prev.trim() ? prev : data.description));
        }

        if (Array.isArray(data.tags) && data.tags.length > 0) {
          setTags((prev) => {
            const next = [...prev];
            for (const t of data.tags) {
              if (!next.includes(t.name)) next.push(t.name);
            }
            return next;
          });
          setPendingNewTags((prev) => {
            const next = [...prev];
            for (const t of data.tags) {
              if (!t.isExisting && !next.includes(t.name)) next.push(t.name);
            }
            return next;
          });
        }

        if (Array.isArray(data.themes) && data.themes.length > 0) {
          const existingIdsToAdd: string[] = [];
          const newNamesToAdd: string[] = [];
          for (const t of data.themes) {
            if (t.isExisting && t.id != null) {
              existingIdsToAdd.push(String(t.id));
            } else if (!t.isExisting && t.name) {
              newNamesToAdd.push(t.name);
            }
          }
          if (existingIdsToAdd.length > 0) {
            setThemeIds((prev) => {
              const next = [...prev];
              for (const id of existingIdsToAdd) {
                if (!next.includes(id)) next.push(id);
              }
              return next;
            });
          }
          if (newNamesToAdd.length > 0) {
            setPendingNewThemes((prev) => {
              const next = [...prev];
              for (const n of newNamesToAdd) {
                if (!next.includes(n)) next.push(n);
              }
              return next;
            });
          }
        }

        setAiPopulated(true);
      } catch (err) {
        if (!active) return;
        if ((err as Error).name === "AbortError") return;
        console.warn("[ai-suggest] request failed:", err);
      } finally {
        if (active) setAiLoading(false);
      }
    })();
    return () => {
      active = false;
      controller.abort();
      // Unconditional reset — the in-flight finally block won't run while
      // `active` is false, so this is the only place that clears the flag
      // when the effect is re-triggered before the fetch resolves.
      setAiLoading(false);
    };
    // We deliberately exclude `notes`, `tags`, `themeIds`, `pendingNew*` to
    // avoid re-running when the user edits the form post-AI. The aiPopulated
    // gate prevents re-fires once we've successfully populated.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lookup, aiPopulated]);

  // Tag autocomplete loader.
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

  // Theme autocomplete from already-loaded list (client-side filter).
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
    // If the user removed a chip, drop it from pendingNewTags too.
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
    // Mark as pending-new only if it's not already in the existing pool.
    let isExisting = false;
    try {
      const params = new URLSearchParams({ q: tag, limit: "10" });
      const res = await fetch(`/api/tags?${params}`);
      if (res.ok) {
        const data = (await res.json()) as { tags?: { name: string }[] };
        isExisting = !!data.tags?.some((t) => t.name === tag);
      }
    } catch {
      // ignore — assume new on failure
    }
    if (!isExisting) {
      setPendingNewTags((prev) => (prev.includes(tag) ? prev : [...prev, tag]));
    }
  };

  const canSubmit =
    !!lookup && !submitting && tickerInput.trim().length > 0 && !lookupLoading;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || !lookup) return;
    setSubmitting(true);
    setSubmitError(null);

    try {
      const body = {
        ticker: tickerInput.trim(),
        market: market || lookup.market,
        name: name.trim() || undefined,
        sector: sector.trim() || undefined,
        notes: notes.trim() || undefined,
        tags,
        themeIds: themeIds.map((id) => Number(id)).filter((n) => !Number.isNaN(n)),
        newThemes: pendingNewThemes.map((nm) => ({ name: nm })),
      };

      const res = await fetch("/api/tickers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as {
        ticker?: string;
        created?: boolean;
        error?: string;
      };

      if (!res.ok) {
        setSubmitError(data.error || "Failed to add ticker");
        toast(data.error || "Failed to add ticker", "error");
        return;
      }

      toast(
        data.created
          ? `Added ${data.ticker} — will appear in watchlist after next scan`
          : `Updated ${data.ticker}`,
        "success",
      );
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
    <Modal open={open} onClose={onClose} title="Add Ticker" size="md">
      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Ticker
          </label>
          <input
            type="text"
            value={tickerInput}
            onChange={(e) => setTickerInput(e.target.value.toUpperCase())}
            placeholder="e.g. NVDA, 0700, D05"
            autoFocus
            className="input w-full font-mono"
            required
          />
          <div className="mt-1 min-h-[1.25rem] text-xs">
            {lookupLoading && (
              <span className="text-gray-500 inline-flex items-center gap-1">
                <span className="h-3 w-3 border border-gray-400 border-t-transparent rounded-full animate-spin" />
                Looking up…
              </span>
            )}
            {lookupError && !lookupLoading && (
              <span className="text-red-600">{lookupError}</span>
            )}
            {lookup && !lookupLoading && !lookupError && (
              <span className="text-emerald-600">
                ✓ {lookup.normalized}
                {lookup.exchange ? ` · ${lookup.exchange}` : ""}
                {lookup.price != null ? ` · $${lookup.price.toFixed(2)}` : ""}
              </span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Market
            </label>
            <select
              value={market}
              onChange={(e) => setMarket(e.target.value)}
              className="input w-full"
            >
              <option value="">Auto-detect</option>
              {MARKETS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
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
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Name (optional)
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Auto-filled from quote"
            className="input w-full"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="block text-sm font-medium text-gray-700">
              Description (optional)
            </label>
            {aiLoading && (
              <span className="text-[11px] text-gray-500 inline-flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-amber-500" />
                AI suggesting…
              </span>
            )}
          </div>
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
          {pendingNewTags.length > 0 ? (
            <p className="text-xs text-amber-600 mt-1">
              Will create {pendingNewTags.length} new tag
              {pendingNewTags.length === 1 ? "" : "s"} on submit.
            </p>
          ) : (
            <p className="text-xs text-gray-400 mt-1">
              Reuse existing tags where possible. Tags share one normalized{" "}
              <code className="text-[11px]">tags</code> pool across tickers and themes.
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
              {pendingNewThemes.length === 1 ? "" : "s"} on submit.
            </p>
          )}
        </div>

        {submitError && (
          <p className="text-sm text-red-600">{submitError}</p>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="btn-secondary">
            Cancel
          </button>
          <button
            type="submit"
            disabled={!canSubmit}
            className="btn-primary"
          >
            {submitting ? "Adding…" : "Add ticker"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
