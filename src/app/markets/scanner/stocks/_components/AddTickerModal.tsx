"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, ArrowLeft, Check } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { formatLocalPrice } from "@/lib/markets/yahoo-utils";
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
  exchange: string | null;
  price: number | null;
  quoteType: string | null;
  currency: string | null;
}

interface SearchCandidate {
  symbol: string;
  name: string | null;
  exchange: string | null;
  market: string | null;
  quoteType: string | null;
}

interface ThemeRow {
  id: number;
  name: string;
}

interface AiProfile {
  revenueModel: string | null;
  revenueSegments: { item: string; pct: number }[] | null;
  cyclicality: string | null;
  tailwinds: string[] | null;
  headwinds: string[] | null;
  threats: string[] | null;
  opportunities: string[] | null;
  customerConcentration: string | null;
}

interface AiSuggestion {
  description: string;
  tags: { name: string; isExisting: boolean }[];
  themes: { name: string; id: number | null; isExisting: boolean }[];
  profile: AiProfile;
}

const MARKETS = ["US", "SGX", "HK", "JP", "CN", "LSE"] as const;

type Mode = "edit" | "review";

// ── Read-only display helpers for the Current side of review rows ──
function CurrentText({ value, multiline = false }: { value: string; multiline?: boolean }) {
  if (!value.trim()) return <p className="text-sm text-gray-400 italic">—</p>;
  return (
    <p className={`text-sm text-gray-700 ${multiline ? "whitespace-pre-wrap" : ""}`}>
      {value}
    </p>
  );
}

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

export function AddTickerModal({ open, onClose }: AddTickerModalProps) {
  const router = useRouter();
  const { toast } = useToast();

  const [tickerInput, setTickerInput] = useState("");
  const [market, setMarket] = useState<string>("");
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");

  const [tags, setTags] = useState<string[]>([]);
  const [pendingNewTags, setPendingNewTags] = useState<string[]>([]);
  const [themeIds, setThemeIds] = useState<string[]>([]);
  const [pendingNewThemes, setPendingNewThemes] = useState<string[]>([]);

  // AI-side mirror state for review mode.
  const [aiNotes, setAiNotes] = useState("");
  const [aiTags, setAiTags] = useState<string[]>([]);
  const [aiPendingNewTags, setAiPendingNewTags] = useState<string[]>([]);
  const [aiThemeIds, setAiThemeIds] = useState<string[]>([]);
  const [aiPendingNewThemes, setAiPendingNewThemes] = useState<string[]>([]);

  const [allThemes, setAllThemes] = useState<ThemeRow[]>([]);

  // Search → resolve flow:
  //  1. User types a query → /yahoo-search returns ranked candidates.
  //  2. We auto-select the top candidate (or keep the user's pick if still in
  //     the result set) and call /lookup for full quote details.
  //  3. Once resolved, the AI auto-suggest fires.
  const [candidates, setCandidates] = useState<SearchCandidate[]>([]);
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [lookup, setLookup] = useState<LookupResult | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [mode, setMode] = useState<Mode>("edit");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiPopulated, setAiPopulated] = useState(false);
  const [redrafting, setRedrafting] = useState(false);
  // The full profile produced by the most recent AI call. Persisted on
  // submit even when the user doesn't open the review pane.
  const [aiProfile, setAiProfile] = useState<AiProfile | null>(null);

  const lookupDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reset = useCallback(() => {
    setTickerInput("");
    setMarket("");
    setName("");
    setNotes("");
    setTags([]);
    setPendingNewTags([]);
    setThemeIds([]);
    setPendingNewThemes([]);
    setAiNotes("");
    setAiTags([]);
    setAiPendingNewTags([]);
    setAiThemeIds([]);
    setAiPendingNewThemes([]);
    setCandidates([]);
    setSelectedSymbol(null);
    setSearching(false);
    setSearchError(null);
    setLookup(null);
    setLookupLoading(false);
    setLookupError(null);
    setSubmitError(null);
    setAiLoading(false);
    setAiPopulated(false);
    setRedrafting(false);
    setAiProfile(null);
    setMode("edit");
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

  // Debounced search whenever tickerInput / market filter changes. Yahoo's
  // search() is the source of truth for "what listings match this query?" —
  // we no longer try to short-circuit with a single suffix-iterating quote()
  // because that picks the wrong listing for ambiguous symbols (e.g. ENSI
  // would resolve to the synthetic .YHD instead of LSE's ENSI.L).
  useEffect(() => {
    const trimmed = tickerInput.trim();
    setSearchError(null);
    if (!trimmed) {
      setCandidates([]);
      setSelectedSymbol(null);
      setLookup(null);
      setLookupError(null);
      setSearching(false);
      return;
    }
    if (lookupDebounceRef.current) clearTimeout(lookupDebounceRef.current);
    lookupDebounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const params = new URLSearchParams({ q: trimmed, limit: "6" });
        if (market) params.set("market", market);
        const res = await fetch(`/api/tickers/yahoo-search?${params}`);
        const data = (await res.json()) as {
          candidates?: SearchCandidate[];
          error?: string;
        };
        if (!res.ok) {
          setSearchError(data.error || "Search failed");
          setCandidates([]);
          setSelectedSymbol(null);
          setLookup(null);
          return;
        }
        const list = data.candidates ?? [];
        setCandidates(list);
        if (list.length === 0) {
          setSearchError(`No matches for "${trimmed}"`);
          setSelectedSymbol(null);
          setLookup(null);
          return;
        }
        // Keep current selection if still in the result set. Otherwise only
        // auto-select when unambiguous — for 2+ matches, leave selection
        // empty so the user picks explicitly (no flash of wrong listing).
        setSelectedSymbol((prev) => {
          if (prev && list.some((c) => c.symbol === prev)) return prev;
          if (list.length === 1) return list[0].symbol;
          return null;
        });
      } catch (e) {
        setSearchError(String(e));
        setCandidates([]);
        setSelectedSymbol(null);
        setLookup(null);
      } finally {
        setSearching(false);
      }
    }, 350);
    return () => {
      if (lookupDebounceRef.current) clearTimeout(lookupDebounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tickerInput, market]);

  // Resolve full quote details for the currently-selected candidate. Fires on
  // selectedSymbol change. Triggers the AI auto-suggest indirectly via the
  // `lookup` state. We clear `lookup` synchronously at the start so the AI
  // effect doesn't transiently fire for the previous selection while the new
  // fetch is in flight.
  useEffect(() => {
    setLookup(null);
    setLookupError(null);

    if (!selectedSymbol) {
      setLookupLoading(false);
      return;
    }
    const candidate = candidates.find((c) => c.symbol === selectedSymbol);
    if (!candidate) {
      setLookupLoading(false);
      return;
    }

    let cancelled = false;
    setLookupLoading(true);

    (async () => {
      try {
        const params = new URLSearchParams({ ticker: candidate.symbol });
        if (candidate.market) params.set("market", candidate.market);
        const res = await fetch(`/api/tickers/lookup?${params}`);
        const data = (await res.json()) as LookupResult & { error?: string };
        if (cancelled) return;
        if (!res.ok) {
          setLookupError(data.error || "Lookup failed");
          setLookup(null);
          return;
        }
        setLookup(data);
        // Auto-fill core fields only if currently empty (preserves user edits).
        if (!market && data.market) setMarket(data.market);
        if (!name && data.name) setName(data.name);
      } catch (e) {
        if (!cancelled) {
          setLookupError(String(e));
          setLookup(null);
        }
      } finally {
        if (!cancelled) setLookupLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSymbol]);

  // Reset the AI auto-suggest "already populated" guard whenever the user
  // switches candidates so AI re-runs against the new ticker.
  useEffect(() => {
    setAiPopulated(false);
  }, [selectedSymbol]);

  // Helper that takes an AiSuggestion response and applies it to the live
  // form fields where they're empty (auto-fill semantics).
  const autoApplySuggestion = useCallback(
    (data: AiSuggestion) => {
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
      if (data.profile) setAiProfile(data.profile);
    },
    [],
  );

  // First-time AI auto-populate after a successful lookup (low friction).
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
        autoApplySuggestion(data);
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
      setAiLoading(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lookup, aiPopulated]);

  // Tag autocomplete loader (used by both live and AI sides).
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

  // Switching candidates is an explicit "I want this different listing" — wipe
  // the core fields and AI-derived state so the resolve effect can repopulate
  // them from the new candidate. (Auto-selection of the top result on initial
  // search keeps existing values via the empty-checks in the resolve effect.)
  const onSelectCandidate = useCallback(
    (symbol: string) => {
      if (symbol === selectedSymbol) return;
      setMarket("");
      setName("");
      setNotes("");
      setTags([]);
      setPendingNewTags([]);
      setThemeIds([]);
      setPendingNewThemes([]);
      setAiProfile(null);
      setSelectedSymbol(symbol);
    },
    [selectedSymbol],
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

  // ── AI-side handlers (Review mode) ──
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

  const themesByName = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of allThemes) m.set(t.name.toLowerCase(), t.id);
    return m;
  }, [allThemes]);

  // Render-current display strings for the read-only Current side.
  const currentTagDisplay = useMemo(() => tags.slice(), [tags]);
  const currentThemeDisplay = useMemo(() => {
    const idsAsNames: string[] = [];
    for (const id of themeIds) {
      const t = allThemes.find((x) => String(x.id) === id);
      if (t) idsAsNames.push(t.name);
    }
    return [...idsAsNames, ...pendingNewThemes];
  }, [themeIds, pendingNewThemes, allThemes]);

  // ── Re-draft via AI: re-run ai-suggest using whatever's typed now and
  // switch into review mode. Unlike the auto-populate flow, this does NOT
  // touch the live form until the user confirms. ──
  const onRedraft = async () => {
    if (redrafting || !lookup) return;
    setRedrafting(true);
    try {
      const res = await fetch("/api/tickers/ai-suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticker: lookup.normalized,
          name: name || lookup.name,
          exchange: lookup.exchange,
          market: market || lookup.market,
        }),
      });
      const data = (await res.json()) as AiSuggestion & { error?: string };
      if (!res.ok) {
        toast(data.error || "Failed to draft", "error");
        return;
      }

      setAiNotes(data.description ?? "");
      const proposedTags = (data.tags ?? []).map((t) => t.name);
      const proposedNewTags = (data.tags ?? [])
        .filter((t) => !t.isExisting)
        .map((t) => t.name);
      setAiTags(proposedTags);
      setAiPendingNewTags(proposedNewTags);

      const existingThemeIds: string[] = [];
      const newThemeNames: string[] = [];
      for (const th of data.themes ?? []) {
        if (th.isExisting && th.id != null) {
          existingThemeIds.push(String(th.id));
        } else if (!th.isExisting && th.name) {
          const matchedId = themesByName.get(th.name.toLowerCase());
          if (matchedId != null) existingThemeIds.push(String(matchedId));
          else newThemeNames.push(th.name);
        }
      }
      setAiThemeIds(existingThemeIds);
      setAiPendingNewThemes(newThemeNames);

      // Stash the new profile so it gets persisted on Add. (The review UI
      // doesn't show profile fields — they're a separate, deeper edit on
      // the ticker detail page — but we don't want to throw away the AI's
      // refreshed profile when the user re-drafts.)
      if (data.profile) setAiProfile(data.profile);

      setMode("review");
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), "error");
    } finally {
      setRedrafting(false);
    }
  };

  // Apply the AI side to the live form and return to edit mode. The user
  // still has to click Add ticker to actually create the ticker.
  const onConfirmReview = (e: React.FormEvent) => {
    e.preventDefault();
    setNotes(aiNotes);
    setTags(aiTags);
    setPendingNewTags(aiPendingNewTags);
    setThemeIds(aiThemeIds);
    setPendingNewThemes(aiPendingNewThemes);
    setMode("edit");
    toast("AI draft applied — review and click Add ticker", "success");
  };

  const onBackToEdit = () => {
    setAiNotes("");
    setAiTags([]);
    setAiPendingNewTags([]);
    setAiThemeIds([]);
    setAiPendingNewThemes([]);
    setMode("edit");
  };

  // Submit is blocked during every auto-fill phase (search, resolve, AI). The
  // AI fill is fast enough now that gating it is no worse than letting users
  // ship a half-populated form.
  const canSubmit =
    !!lookup &&
    !submitting &&
    tickerInput.trim().length > 0 &&
    !lookupLoading &&
    !searching &&
    !aiLoading;

  // Phase flags for field-level disabling. The `resolveBusy` umbrella covers
  // the search→resolve chain so Market/Name don't fight the auto-fill.
  const resolveBusy = searching || lookupLoading;

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
        notes: notes.trim() || undefined,
        tags,
        themeIds: themeIds.map((id) => Number(id)).filter((n) => !Number.isNaN(n)),
        newThemes: pendingNewThemes.map((nm) => ({ name: nm })),
        profile: aiProfile || undefined,
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

  const editFormId = "add-ticker-form";
  const reviewFormId = "add-ticker-review-form";

  const editFooter = (
    <div className="flex items-center justify-between gap-2 flex-wrap">
      <button
        type="button"
        onClick={onRedraft}
        disabled={!lookup || redrafting || submitting || aiLoading}
        className="inline-flex items-center gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 hover:bg-amber-100 disabled:opacity-50"
        title={!lookup ? "Enter a valid ticker first" : undefined}
      >
        <Sparkles className="w-3.5 h-3.5" />
        {redrafting ? "Drafting…" : "Re-draft via AI"}
      </button>
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
          {submitting ? "Adding…" : "Add ticker"}
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
          Apply to form
        </button>
      </div>
    </div>
  );

  const title = mode === "review" ? "Review AI draft" : "Add Ticker";
  const size = mode === "review" ? "xl" : "md";

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size={size}
      footer={mode === "review" ? reviewFooter : editFooter}
    >
      {mode === "edit" ? (
        <form id={editFormId} onSubmit={onSubmit} className="space-y-4">
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
              {searching && (
                <span className="text-gray-500 inline-flex items-center gap-1">
                  <span className="h-3 w-3 border border-gray-400 border-t-transparent rounded-full animate-spin" />
                  Searching…
                </span>
              )}
              {!searching && lookupLoading && (
                <span className="text-gray-500 inline-flex items-center gap-1">
                  <span className="h-3 w-3 border border-gray-400 border-t-transparent rounded-full animate-spin" />
                  Resolving quote…
                </span>
              )}
              {!searching && !lookupLoading && searchError && (
                <span className="text-red-600">{searchError}</span>
              )}
              {!searching && !lookupLoading && !searchError && lookupError && (
                <span className="text-red-600">{lookupError}</span>
              )}
              {!searching &&
                !lookupLoading &&
                !searchError &&
                !lookupError &&
                lookup && (
                  <span className="text-emerald-600">
                    ✓ {lookup.normalized}
                    {lookup.exchange ? ` · ${lookup.exchange}` : ""}
                    {lookup.price != null
                      ? ` · ${formatLocalPrice(lookup.normalized, lookup.price, lookup.currency)}`
                      : ""}
                  </span>
                )}
            </div>

            {candidates.length >= 2 && (
              <div className="mt-2 border border-gray-200 rounded-md overflow-hidden bg-white">
                <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-gray-500 bg-gray-50 border-b border-gray-100">
                  {candidates.length} listings found — pick one
                </div>
                <ul className="divide-y divide-gray-100">
                  {candidates.map((c) => {
                    const isSelected = c.symbol === selectedSymbol;
                    return (
                      <li key={c.symbol}>
                        <button
                          type="button"
                          onClick={() => onSelectCandidate(c.symbol)}
                          className={`w-full text-left px-3 py-2 flex items-start gap-2 hover:bg-gray-50 ${
                            isSelected ? "bg-emerald-50/60" : ""
                          }`}
                          aria-pressed={isSelected}
                        >
                          <span
                            className={`mt-0.5 inline-flex items-center justify-center w-4 h-4 rounded-full border ${
                              isSelected
                                ? "bg-emerald-500 border-emerald-500 text-white"
                                : "border-gray-300 text-transparent"
                            }`}
                          >
                            <Check className="w-2.5 h-2.5" strokeWidth={3} />
                          </span>
                          <span className="flex-1 min-w-0">
                            <span className="flex items-baseline gap-2">
                              <span className="font-mono text-sm text-gray-900">
                                {c.symbol}
                              </span>
                              {c.market && (
                                <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">
                                  {c.market}
                                </span>
                              )}
                              {c.exchange && c.exchange !== c.market && (
                                <span className="text-[11px] text-gray-500 truncate">
                                  {c.exchange}
                                </span>
                              )}
                            </span>
                            {c.name && (
                              <span className="block text-xs text-gray-600 truncate">
                                {c.name}
                              </span>
                            )}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>

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
              Name (optional)
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={
                resolveBusy && !name ? "Auto-filling…" : "Auto-filled from quote"
              }
              disabled={resolveBusy && !name}
              className="input w-full disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed"
            />
          </div>

          {/* Description + Tags + Themes — populated together by the AI
              auto-suggest, so we lock them as a single group while the AI is
              working. One overlay over the whole region beats per-field
              disabled states (less visual noise; clearer "wait" signal). */}
          <div className="relative space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Description (optional)
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder="1-2 sentence summary of what the company does"
                disabled={aiLoading}
                className="input w-full resize-none disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed"
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
                disabled={aiLoading}
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
                disabled={aiLoading}
              />
              {pendingNewThemes.length > 0 && (
                <p className="text-xs text-amber-600 mt-1">
                  Will create {pendingNewThemes.length} new theme
                  {pendingNewThemes.length === 1 ? "" : "s"} on submit.
                </p>
              )}
            </div>

            {aiLoading && (
              <div className="absolute inset-0 -m-2 rounded-md bg-white/70 backdrop-blur-[1px] flex items-center justify-center z-10 pointer-events-auto">
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white border border-amber-200 shadow-sm">
                  <Sparkles className="w-3.5 h-3.5 text-amber-500 animate-pulse" />
                  <span className="text-xs font-medium text-amber-800">
                    AI is drafting description, tags, and themes…
                  </span>
                </div>
              </div>
            )}
          </div>

          {submitError && <p className="text-sm text-red-600">{submitError}</p>}
        </form>
      ) : (
        // Review mode — side-by-side comparison for description / tags / themes
        <form id={reviewFormId} onSubmit={onConfirmReview} className="space-y-5">
          <p className="text-xs text-gray-500 leading-relaxed">
            Compare the AI suggestion to what is currently in the form. Edit
            anything on the right side before applying. Clicking{" "}
            <span className="font-medium">Apply to form</span> copies the AI
            side back into the form — you still need to click Add ticker to
            create.
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
                    {aiPendingNewTags.length === 1 ? "" : "s"} on add.
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
                    {aiPendingNewThemes.length === 1 ? "" : "s"} on add.
                  </p>
                )}
              </div>
            }
          />
        </form>
      )}
    </Modal>
  );
}
