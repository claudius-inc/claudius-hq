"use client";

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useLayoutEffect,
  type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Search, Loader2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";

interface SearchHit {
  ticker: string;
  name: string | null;
  market: string;
  sector: string | null;
}

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia("(max-width: 768px)");
    setIsMobile(mql.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);
  return isMobile;
}

export function TickerSearch() {
  const router = useRouter();
  const isMobile = useIsMobile();

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchHit[]>([]);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);

  // Desktop dropdown visibility (driven by focus/typing)
  const [desktopOpen, setDesktopOpen] = useState(false);
  // Mobile fullscreen sheet visibility
  const [mobileOpen, setMobileOpen] = useState(false);

  const desktopWrapRef = useRef<HTMLDivElement>(null);
  const desktopInputRef = useRef<HTMLInputElement>(null);
  const desktopPanelRef = useRef<HTMLDivElement>(null);
  const mobileInputRef = useRef<HTMLInputElement>(null);
  const fetchSeqRef = useRef(0);

  const [coords, setCoords] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);

  const reset = useCallback(() => {
    setQuery("");
    setResults([]);
    setActive(0);
    setLoading(false);
  }, []);

  // ⌘K / Ctrl+K — open on mobile, focus on desktop
  useEffect(() => {
    function onKey(e: globalThis.KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (isMobile) {
          setMobileOpen(true);
        } else {
          desktopInputRef.current?.focus();
          desktopInputRef.current?.select();
        }
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isMobile]);

  // Auto-focus the mobile input after the Modal mounts. (Modal already
  // handles body-scroll-lock and ESC-to-close.)
  useEffect(() => {
    if (!mobileOpen) return;
    const t = setTimeout(() => mobileInputRef.current?.focus(), 60);
    return () => clearTimeout(t);
  }, [mobileOpen]);

  // Position the desktop dropdown below the trigger. Anchor by the
  // trigger's right edge so the panel grows leftward (the trigger lives
  // at the right of the tab row, so left-anchored growth would overflow
  // the viewport). Clamp width to the viewport with an 8px margin.
  const updateCoords = useCallback(() => {
    const el = desktopWrapRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const margin = 8;
    const vw = window.innerWidth;
    const desired = Math.max(rect.width, 360);
    const width = Math.min(desired, vw - margin * 2);
    let left = rect.right - width;
    if (left < margin) left = margin;
    // rect.bottom now includes the wrapper's pb-1.5 (6px); land the
    // dropdown a few px below it for breathing room.
    setCoords({ top: rect.bottom, left, width });
  }, []);

  useLayoutEffect(() => {
    if (!desktopOpen) return;
    updateCoords();
  }, [desktopOpen, updateCoords]);

  useEffect(() => {
    if (!desktopOpen) return;
    const handler = () => updateCoords();
    window.addEventListener("scroll", handler, true);
    window.addEventListener("resize", handler);
    return () => {
      window.removeEventListener("scroll", handler, true);
      window.removeEventListener("resize", handler);
    };
  }, [desktopOpen, updateCoords]);

  // Click-outside closes the desktop dropdown
  useEffect(() => {
    if (!desktopOpen) return;
    function onDown(e: MouseEvent) {
      const t = e.target as Node;
      if (desktopWrapRef.current?.contains(t)) return;
      if (desktopPanelRef.current?.contains(t)) return;
      setDesktopOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [desktopOpen]);

  // Debounced search
  useEffect(() => {
    const q = query.trim();
    if (q.length === 0) {
      setResults([]);
      setLoading(false);
      return;
    }
    const seq = ++fetchSeqRef.current;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/tickers/search?q=${encodeURIComponent(q)}&limit=10`,
        );
        if (seq !== fetchSeqRef.current) return;
        if (!res.ok) {
          setResults([]);
          return;
        }
        const data = (await res.json()) as { results?: SearchHit[] };
        setResults(data.results ?? []);
        setActive(0);
      } catch {
        if (seq === fetchSeqRef.current) setResults([]);
      } finally {
        if (seq === fetchSeqRef.current) setLoading(false);
      }
    }, 150);
    return () => clearTimeout(t);
  }, [query]);

  const navigate = useCallback(
    (ticker: string) => {
      setDesktopOpen(false);
      setMobileOpen(false);
      reset();
      router.push(`/markets/ticker/${encodeURIComponent(ticker)}`);
    },
    [router, reset],
  );

  const closeMobile = useCallback(() => {
    setMobileOpen(false);
    reset();
  }, [reset]);

  const handleKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(results.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const hit = results[active];
      if (hit) navigate(hit.ticker);
      else if (query.trim()) navigate(query.trim().toUpperCase());
    } else if (e.key === "Escape") {
      e.preventDefault();
      if (isMobile) closeMobile();
      else {
        setDesktopOpen(false);
        desktopInputRef.current?.blur();
      }
    }
  };

  return (
    <>
      {/* ── Desktop trigger (md+): inline compact input ─────────
          The pb-1.5 puts the input's visual bottom on the same line
          as the tab labels (which have their own pb-1.5 inside). */}
      <div
        ref={desktopWrapRef}
        className="hidden md:block relative w-56 lg:w-64 pb-1.5"
      >
        <div className="flex items-center gap-1.5 h-7 px-2 rounded-md border border-gray-200 bg-white focus-within:border-gray-400 focus-within:ring-1 focus-within:ring-gray-200 transition-colors">
          <Search className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
          <input
            ref={desktopInputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setDesktopOpen(true);
            }}
            onFocus={() => setDesktopOpen(true)}
            onKeyDown={handleKey}
            placeholder="Search ticker…"
            className="flex-1 min-w-0 text-sm text-gray-900 placeholder:text-gray-400 bg-transparent outline-none"
            aria-label="Search tickers"
          />
          {loading ? (
            <Loader2 className="w-3.5 h-3.5 text-gray-400 animate-spin flex-shrink-0" />
          ) : query.length === 0 ? (
            <kbd className="hidden lg:inline-flex items-center gap-px px-1 h-4 text-[10px] font-mono text-gray-400 bg-gray-50 border border-gray-200 rounded leading-none">
              <span className="text-[11px]">⌘</span>K
            </kbd>
          ) : null}
        </div>
      </div>

      {/* ── Mobile trigger (<md): icon-only button ─────────────── */}
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        className="md:hidden flex items-center justify-center w-9 h-9 rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors"
        aria-label="Search ticker"
      >
        <Search className="w-4 h-4" />
      </button>

      {/* ── Desktop dropdown panel (portal) ────────────────────── */}
      {desktopOpen &&
        coords &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={desktopPanelRef}
            style={{
              position: "fixed",
              top: coords.top,
              left: coords.left,
              width: coords.width,
            }}
            className="z-[9999] bg-white border border-gray-200 rounded-lg shadow-xl overflow-hidden animate-fade-in"
          >
            <ResultsList
              results={results}
              query={query}
              activeIndex={active}
              setActiveIndex={setActive}
              navigate={navigate}
              loading={loading}
            />
            {results.length > 0 && (
              <div className="flex items-center justify-end gap-3 px-3 py-1.5 border-t border-gray-100 bg-gray-50/60">
                <KbdHint shortcut="↵" label="open" />
                <KbdHint shortcut="↑↓" label="navigate" />
                <KbdHint shortcut="esc" label="close" />
              </div>
            )}
          </div>,
          document.body,
        )}

      {/* ── Mobile sheet (uses shared Modal primitive) ─────────── */}
      <Modal open={mobileOpen} onClose={closeMobile} size="md">
        {/* Negative margins cancel Modal's content padding so the input row
            can sit flush with the modal edges and stick to the top while
            results scroll underneath. */}
        <div className="-m-4">
          <div className="sticky top-0 z-10 bg-white px-4 py-2 border-b border-gray-100">
            <div className="flex items-center gap-2 px-2 h-10 rounded-md border border-gray-200 focus-within:border-gray-400 focus-within:ring-1 focus-within:ring-gray-200">
              <Search className="w-4 h-4 text-gray-400 flex-shrink-0" />
              <input
                ref={mobileInputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKey}
                placeholder="Search ticker or company…"
                className="flex-1 min-w-0 text-base text-gray-900 placeholder:text-gray-400 bg-transparent outline-none"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                inputMode="search"
                enterKeyHint="search"
                aria-label="Search tickers"
              />
              {loading && (
                <Loader2 className="w-4 h-4 text-gray-400 animate-spin flex-shrink-0" />
              )}
            </div>
          </div>
          <ResultsList
            results={results}
            query={query}
            activeIndex={active}
            setActiveIndex={setActive}
            navigate={navigate}
            loading={loading}
            mobile
          />
        </div>
      </Modal>
    </>
  );
}

function KbdHint({ shortcut, label }: { shortcut: string; label: string }) {
  return (
    <span className="flex items-center gap-1 text-[10px] text-gray-400">
      <kbd className="font-mono text-[11px] text-gray-500">{shortcut}</kbd>
      <span>{label}</span>
    </span>
  );
}

interface ResultsListProps {
  results: SearchHit[];
  query: string;
  activeIndex: number;
  setActiveIndex: (i: number) => void;
  navigate: (t: string) => void;
  loading: boolean;
  mobile?: boolean;
}

function ResultsList({
  results,
  query,
  activeIndex,
  setActiveIndex,
  navigate,
  loading,
  mobile,
}: ResultsListProps) {
  const trimmed = query.trim();

  if (trimmed.length === 0) {
    return (
      <div
        className={`px-4 ${
          mobile ? "py-16 text-center" : "py-3"
        } text-xs text-gray-400`}
      >
        Start typing a ticker or company name
      </div>
    );
  }

  if (results.length === 0 && !loading) {
    return (
      <div
        className={`px-4 ${
          mobile ? "py-16 text-center" : "py-3"
        } text-xs text-gray-400`}
      >
        <div>No tickers match &ldquo;{query}&rdquo;</div>
        <button
          type="button"
          onClick={() => navigate(trimmed.toUpperCase())}
          className="mt-2 text-gray-700 hover:text-gray-900 underline underline-offset-2"
        >
          Try &ldquo;{trimmed.toUpperCase()}&rdquo; anyway
        </button>
      </div>
    );
  }

  return (
    <div className={mobile ? "py-1" : "max-h-[60vh] overflow-y-auto py-1"}>
      {results.map((hit, idx) => {
        const isActive = idx === activeIndex;
        return (
          <button
            key={hit.ticker}
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onMouseEnter={() => setActiveIndex(idx)}
            onClick={() => navigate(hit.ticker)}
            className={`w-full text-left px-3 ${
              mobile ? "py-3" : "py-2"
            } flex items-center gap-3 transition-colors ${
              isActive ? "bg-gray-50" : "hover:bg-gray-50"
            }`}
          >
            <span className="text-sm font-semibold text-gray-900 tabular-nums flex-shrink-0">
              {hit.ticker}
            </span>
            <span className="text-xs text-gray-500 truncate flex-1 min-w-0">
              {hit.name ?? hit.sector ?? ""}
            </span>
            <span className="text-[10px] uppercase tracking-wider text-gray-500 flex-shrink-0 px-1.5 py-0.5 rounded bg-gray-50 border border-gray-100 font-medium">
              {hit.market}
            </span>
          </button>
        );
      })}
    </div>
  );
}
