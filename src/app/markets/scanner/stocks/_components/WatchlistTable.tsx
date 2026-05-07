"use client";

import { useMemo, useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import { ChevronDown, ChevronUp, Info, Newspaper } from "lucide-react";
import {
  formatMarketCap,
  formatPE,
  formatDebtToEquity,
} from "@/lib/markets/format-fundamentals";
import { EditTickerButton } from "./EditTickerButton";

export type WatchlistRow = {
  ticker: string;
  name: string;
  market: "US" | "SGX" | "HK" | "JP" | "KS" | "CN" | "LSE";
  price: number | null;
  momentumScore: number | null;
  technicalScore: number | null;
  priceChange1d: number | null;
  priceChange1w: number | null;
  priceChange1m: number | null;
  priceChange3m: number | null;
  themeIds: number[];
  dataQuality: "ok" | "partial" | "failed";
  description?: string | null;
  momentumDelta: number | null;
  marketCap: number | null;
  trailingPE: number | null;
  forwardPE: number | null;
  debtToEquity: number | null;
};

export type ThemeNameMap = Record<number, string>;

type SortKey =
  | "momentumScore"
  | "technicalScore"
  | "momentumDelta"
  | "priceChange1d"
  | "priceChange1w"
  | "priceChange1m"
  | "priceChange3m"
  | "ticker"
  | "name";

type SortDir = "asc" | "desc";

interface Filters {
  markets: Set<"US" | "SGX" | "HK" | "JP" | "KS" | "CN" | "LSE">;
  momentumTier: "all" | "ge40" | "ge70";
  positive1wOnly: boolean;
  positiveMomentumDelta: boolean;
  themeIds: Set<number>;
}

export function WatchlistTable({
  rows,
  themeNames,
}: {
  rows: WatchlistRow[];
  themeNames: ThemeNameMap;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("momentumScore");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [filters, setFilters] = useState<Filters>({
    markets: new Set(),
    momentumTier: "all",
    positive1wOnly: false,
    positiveMomentumDelta: false,
    themeIds: new Set(),
  });

  const filtered = useMemo(() => filterRows(rows, filters), [rows, filters]);
  const sorted = useMemo(
    () => sortRows(filtered, sortKey, sortDir),
    [filtered, sortKey, sortDir],
  );

  const onHeader = (key: SortKey) => {
    if (sortKey === key) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  if (rows.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="p-8 text-center text-gray-500 text-sm">
          No tickers tracked yet. Add stocks to your themes on the{" "}
          <a href="/markets/scanner/themes" className="text-blue-600 underline">
            Themes
          </a>{" "}
          page.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <FilterBar
        filters={filters}
        setFilters={setFilters}
        themeNames={themeNames}
      />
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-100">
            <thead className="bg-gray-50">
              <tr>
                <Th
                  label="Ticker"
                  active={sortKey === "ticker"}
                  dir={sortDir}
                  onClick={() => onHeader("ticker")}
                  sticky
                />
                <Th
                  label="Name"
                  active={sortKey === "name"}
                  dir={sortDir}
                  onClick={() => onHeader("name")}
                />
                <Th
                  label="Momentum"
                  active={sortKey === "momentumScore"}
                  dir={sortDir}
                  onClick={() => onHeader("momentumScore")}
                  align="right"
                />
                <Th
                  label="1D Δ"
                  active={sortKey === "priceChange1d"}
                  dir={sortDir}
                  onClick={() => onHeader("priceChange1d")}
                  align="right"
                />
                <Th
                  label="1W Δ"
                  active={sortKey === "priceChange1w"}
                  dir={sortDir}
                  onClick={() => onHeader("priceChange1w")}
                  align="right"
                />
                <Th
                  label="1M Δ"
                  active={sortKey === "priceChange1m"}
                  dir={sortDir}
                  onClick={() => onHeader("priceChange1m")}
                  align="right"
                />
                <Th
                  label="3M Δ"
                  active={sortKey === "priceChange3m"}
                  dir={sortDir}
                  onClick={() => onHeader("priceChange3m")}
                  align="right"
                />
                <Th
                  label="Technical"
                  active={sortKey === "technicalScore"}
                  dir={sortDir}
                  onClick={() => onHeader("technicalScore")}
                  align="right"
                />
                <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500">
                  Themes
                </th>
                <th className="px-3 py-2.5 text-right text-xs font-medium text-gray-500 w-10">
                  <span className="sr-only">Edit</span>
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {sorted.map((r) => (
                <Row key={r.ticker} row={r} themeNames={themeNames} />
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <p className="text-xs text-gray-400">
        Showing {sorted.length} of {rows.length}
      </p>
    </div>
  );
}

function Th({
  label,
  active,
  dir,
  onClick,
  align,
  sticky,
}: {
  label: string;
  active: boolean;
  dir: SortDir;
  onClick: () => void;
  align?: "left" | "right";
  sticky?: boolean;
}) {
  const alignClass = align === "right" ? "text-right" : "text-left";
  const stickyClass = sticky
    ? "sticky left-0 z-20 bg-gray-50 border-r border-gray-200"
    : "";
  return (
    <th
      className={`px-3 py-2.5 ${alignClass} ${stickyClass} text-xs font-medium text-gray-500 cursor-pointer select-none hover:text-gray-700`}
      onClick={onClick}
    >
      <span
        className={`inline-flex items-center gap-0.5 ${align === "right" ? "justify-end" : ""}`}
      >
        {label}
        {active ? (
          dir === "desc" ? (
            <ChevronDown className="w-3 h-3" />
          ) : (
            <ChevronUp className="w-3 h-3" />
          )
        ) : null}
      </span>
    </th>
  );
}

function Row({
  row,
  themeNames,
}: {
  row: WatchlistRow;
  themeNames: ThemeNameMap;
}) {
  const failed = row.dataQuality === "failed";
  return (
    <tr className={`group hover:bg-gray-50 text-sm ${failed ? "opacity-60" : ""}`}>
      <td className="px-3 py-2.5 whitespace-nowrap font-mono sticky left-0 z-10 bg-white group-hover:bg-gray-50 max-sm:max-w-[88px] max-sm:overflow-hidden border-r border-gray-100">
        {failed && (
          <span
            title="Fetch failed"
            className="inline-block w-1.5 h-1.5 rounded-full bg-gray-400 mr-1.5 align-middle"
          />
        )}
        <Link
          href={`/markets/ticker/${row.ticker}`}
          title={row.ticker}
          className="text-emerald-600 hover:text-emerald-700 transition-colors max-sm:inline-block max-sm:max-w-[60px] max-sm:overflow-hidden max-sm:text-ellipsis max-sm:align-middle"
        >
          {row.ticker}
        </Link>
      </td>
      <td className="px-3 py-2.5 whitespace-nowrap max-w-[22rem]">
        <div className="flex items-center gap-1.5">
          <span className="truncate" title={row.name}>{row.name}</span>
          {(row.description ||
            row.marketCap != null ||
            row.trailingPE != null ||
            row.forwardPE != null ||
            row.debtToEquity != null) && (
            <InfoHover
              description={row.description ?? null}
              marketCap={row.marketCap}
              trailingPE={row.trailingPE}
              forwardPE={row.forwardPE}
              debtToEquity={row.debtToEquity}
            />
          )}
          <NewsHover ticker={row.ticker} />
        </div>
      </td>
      <td className="px-3 py-2.5 whitespace-nowrap text-right">
        <div className="flex items-center justify-end gap-1">
          <ScoreBadge value={row.momentumScore} />
          <MomentumDeltaBadge value={row.momentumDelta} />
        </div>
      </td>
      <td className="px-3 py-2.5 whitespace-nowrap text-right">
        <Delta value={row.priceChange1d} />
      </td>
      <td className="px-3 py-2.5 whitespace-nowrap text-right">
        <Delta value={row.priceChange1w} />
      </td>
      <td className="px-3 py-2.5 whitespace-nowrap text-right">
        <Delta value={row.priceChange1m} />
      </td>
      <td className="px-3 py-2.5 whitespace-nowrap text-right">
        <Delta value={row.priceChange3m} />
      </td>
      <td className="px-3 py-2.5 whitespace-nowrap text-right">
        <ScoreBadge value={row.technicalScore} />
      </td>
      <td className="px-3 py-2.5 whitespace-nowrap">
        <div className="flex flex-wrap gap-1">
          {row.themeIds.map((id) => (
            <span
              key={id}
              className="inline-flex items-center px-1.5 py-px text-[10px] rounded border bg-gray-50 text-gray-500 border-gray-200"
            >
              {themeNames[id] ?? `#${id}`}
            </span>
          ))}
        </div>
      </td>
      <td className="px-3 py-2.5 whitespace-nowrap text-right">
        <EditTickerButton ticker={row.ticker} />
      </td>
    </tr>
  );
}

function ScoreBadge({ value }: { value: number | null }) {
  if (value === null) return <span className="text-gray-400">—</span>;
  const v = Math.round(value);
  const cls =
    v >= 70
      ? "bg-emerald-100 text-emerald-700"
      : v >= 40
        ? "bg-amber-100 text-amber-700"
        : "bg-gray-100 text-gray-600";
  return (
    <span className={`px-1.5 py-0.5 rounded text-xs font-semibold ${cls}`}>
      {v}
    </span>
  );
}

function MomentumDeltaBadge({ value }: { value: number | null }) {
  if (value === null) return <span className="text-gray-400">—</span>;
  const v = Math.round(value);
  if (v === 0) return <span className="text-gray-400">0</span>;
  const cls = v > 0 ? "text-emerald-600" : "text-red-600";
  const sign = v > 0 ? "+" : "";
  return (
    <span className={`font-semibold ${cls}`}>{sign}{v}</span>
  );
}

function Delta({ value }: { value: number | null }) {
  if (value === null) return <span className="text-gray-400">—</span>;
  const cls = value >= 0 ? "text-emerald-600" : "text-red-600";
  const sign = value >= 0 ? "+" : "";
  return (
    <span className={cls}>
      {sign}
      {value.toFixed(1)}%
    </span>
  );
}

function filterRows(rows: WatchlistRow[], f: Filters): WatchlistRow[] {
  return rows.filter((r) => {
    if (f.markets.size > 0 && !f.markets.has(r.market)) return false;
    if (f.momentumTier === "ge40" && (r.momentumScore ?? -1) < 40) return false;
    if (f.momentumTier === "ge70" && (r.momentumScore ?? -1) < 70) return false;
    if (f.positive1wOnly && !((r.priceChange1w ?? 0) > 0)) return false;
    if (f.positiveMomentumDelta && !((r.momentumDelta ?? 0) > 0)) return false;
    if (f.themeIds.size > 0 && !r.themeIds.some((id) => f.themeIds.has(id)))
      return false;
    return true;
  });
}

function sortRows(
  rows: WatchlistRow[],
  key: SortKey,
  dir: SortDir,
): WatchlistRow[] {
  const mul = dir === "desc" ? -1 : 1;
  const out = [...rows];
  out.sort((a, b) => {
    const av = a[key as keyof WatchlistRow] as
      | number
      | string
      | null
      | undefined;
    const bv = b[key as keyof WatchlistRow] as
      | number
      | string
      | null
      | undefined;
    if (av === null || av === undefined) return 1; // nulls always last
    if (bv === null || bv === undefined) return -1;
    if (typeof av === "number" && typeof bv === "number")
      return (av - bv) * mul;
    return String(av).localeCompare(String(bv)) * mul;
  });
  return out;
}

function FilterBar({
  filters,
  setFilters,
  themeNames,
}: {
  filters: Filters;
  setFilters: (f: Filters) => void;
  themeNames: ThemeNameMap;
}) {
  const [themesExpanded, setThemesExpanded] = useState(false);
  const markets: ("US" | "SGX" | "HK" | "JP" | "KS" | "CN" | "LSE")[] = [
    "US",
    "SGX",
    "HK",
    "JP",
    "KS",
    "CN",
    "LSE",
  ];
  const themeEntries = Object.entries(themeNames);

  const toggleMarket = (m: "US" | "SGX" | "HK" | "JP" | "KS" | "CN" | "LSE") => {
    const next = new Set(filters.markets);
    if (next.has(m)) next.delete(m);
    else next.add(m);
    setFilters({ ...filters, markets: next });
  };
  const toggleTheme = (id: number) => {
    const next = new Set(filters.themeIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setFilters({ ...filters, themeIds: next });
  };

  // Collapse beyond 3 themes regardless of viewport so the filter row stays
  // compact on dense theme libraries.
  const visibleThemes = themesExpanded ? themeEntries : themeEntries.slice(0, 3);
  const hasMoreThemes = themeEntries.length > 3;

  return (
    <div className="flex flex-wrap items-center gap-1.5 text-sm">
      <span className="text-gray-500">Market:</span>
      {markets.map((m) => (
        <Chip
          key={m}
          active={filters.markets.has(m)}
          onClick={() => toggleMarket(m)}
        >
          {m}
        </Chip>
      ))}

      <span className="text-gray-500">Momentum:</span>
      {(["all", "ge40", "ge70"] as const).map((t) => (
        <Chip
          key={t}
          active={filters.momentumTier === t}
          onClick={() => setFilters({ ...filters, momentumTier: t })}
        >
          {t === "all" ? "All" : t === "ge40" ? "≥40" : "≥70"}
        </Chip>
      ))}

      <Chip
        active={filters.positive1wOnly}
        onClick={() =>
          setFilters({ ...filters, positive1wOnly: !filters.positive1wOnly })
        }
      >
        1W positive
      </Chip>

      <Chip
        active={filters.positiveMomentumDelta}
        onClick={() =>
          setFilters({
            ...filters,
            positiveMomentumDelta: !filters.positiveMomentumDelta,
          })
        }
      >
        Gainers
      </Chip>

      {themeEntries.length > 0 && (
        <>
          <span className="text-gray-500">Theme:</span>
          {visibleThemes.map(([id, name]) => (
            <Chip
              key={id}
              active={filters.themeIds.has(Number(id))}
              onClick={() => toggleTheme(Number(id))}
            >
              {name}
            </Chip>
          ))}
          {hasMoreThemes && !themesExpanded && (
            <Chip active={false} onClick={() => setThemesExpanded(true)}>
              +{themeEntries.length - 3} more
            </Chip>
          )}
          {hasMoreThemes && themesExpanded && (
            <Chip active={false} onClick={() => setThemesExpanded(false)}>
              Less
            </Chip>
          )}
        </>
      )}
    </div>
  );
}

/* ── Hover tooltip shared hook ── */
function useHoverTooltip() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setOpen(true);
  }, []);

  const hide = useCallback(() => {
    timerRef.current = setTimeout(() => setOpen(false), 150);
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return { open, ref, show, hide };
}

/* ── Info icon: shows description + fundamentals on hover ── */
interface InfoHoverPayload {
  description: string | null;
  marketCap: number | null;
  trailingPE: number | null;
  forwardPE: number | null;
  debtToEquity: number | null;
}

function InfoHover(props: InfoHoverPayload) {
  const { open, ref, show, hide } = useHoverTooltip();
  return (
    <div ref={ref} className="relative inline-flex" onMouseEnter={show} onMouseLeave={hide}>
      <Info className="w-3.5 h-3.5 text-gray-400 hover:text-blue-500 transition-colors cursor-default flex-shrink-0" />
      {open && <DescriptionTooltip {...props} anchorRef={ref} />}
    </div>
  );
}

// Single fundamentals cell inside the tooltip's 2x2 grid.
function MetricCell({ label, value }: { label: string; value: string }) {
  const isMissing = value === "—";
  return (
    <div className="flex flex-col">
      <span className="text-[9px] uppercase tracking-wider text-gray-400">
        {label}
      </span>
      <span
        className={`text-xs tabular-nums ${isMissing ? "text-gray-500" : "text-gray-100"}`}
      >
        {value}
      </span>
    </div>
  );
}

function DescriptionTooltip({
  description,
  marketCap,
  trailingPE,
  forwardPE,
  debtToEquity,
  anchorRef,
}: InfoHoverPayload & {
  anchorRef: React.RefObject<HTMLDivElement | null>;
}) {
  const rect = anchorRef.current?.getBoundingClientRect();
  if (!rect) return null;
  const hasFundamentals =
    marketCap != null ||
    trailingPE != null ||
    forwardPE != null ||
    debtToEquity != null;
  return (
    <div
      className="fixed z-[9999] bg-gray-900 text-white text-[11px] leading-relaxed rounded-lg px-3 py-2.5 shadow-xl pointer-events-none w-[300px] break-words whitespace-normal"
      style={{
        bottom: `calc(100vh - ${rect.top - 8}px)`,
        left: Math.max(8, Math.min(rect.left - 100, window.innerWidth - 320)),
      }}
    >
      {description && <p className="mb-2">{description}</p>}
      {hasFundamentals && (
        <div
          className={`grid grid-cols-2 gap-x-4 gap-y-1.5 ${description ? "pt-2 border-t border-gray-700/60" : ""}`}
        >
          <MetricCell label="Market Cap" value={formatMarketCap(marketCap)} />
          <MetricCell label="P/E" value={formatPE(trailingPE)} />
          <MetricCell label="Fwd P/E" value={formatPE(forwardPE)} />
          <MetricCell label="D/E" value={formatDebtToEquity(debtToEquity)} />
        </div>
      )}
      <div className="absolute top-full left-6 border-4 border-transparent border-t-gray-900" />
    </div>
  );
}

/* ── Newspaper icon: fetches & shows top headlines on hover ── */
function NewsHover({ ticker }: { ticker: string }) {
  const { open, ref, show, hide } = useHoverTooltip();
  const [news, setNews] = useState<{ title: string; url: string }[] | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchNews = useCallback(async () => {
    if (news !== null) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/stocks/news?ticker=${encodeURIComponent(ticker)}`);
      if (res.ok) {
        const data = await res.json();
        setNews(data.headlines ?? []);
      } else {
        setNews([]);
      }
    } catch {
      setNews([]);
    }
    setLoading(false);
  }, [ticker, news]);

  const handleEnter = () => {
    show();
    fetchNews();
  };

  const rect = ref.current?.getBoundingClientRect();

  return (
    <div ref={ref} className="relative inline-flex" onMouseEnter={handleEnter} onMouseLeave={hide}>
      <Newspaper className="w-3.5 h-3.5 text-gray-400 hover:text-blue-500 transition-colors cursor-default flex-shrink-0" />
      {open && rect && (
        <div className="fixed z-[9999] bg-gray-900 text-white text-[11px] rounded-lg px-3 py-2.5 shadow-xl max-w-[320px]"
          style={{
            bottom: `calc(100vh - ${rect.top - 8}px)`,
            left: Math.max(8, Math.min(rect.left - 100, window.innerWidth - 340)),
          }}
        >
          <div className="font-semibold text-[10px] uppercase tracking-wide text-gray-400 mb-1.5">Latest News</div>
          {loading ? (
            <div className="text-gray-400 py-1">Loading…</div>
          ) : news && news.length > 0 ? (
            <ul className="space-y-1.5">
              {news.map((h, i) => (
                <li key={i} className="leading-snug break-words whitespace-normal">
                  <a href={h.url} target="_blank" rel="noopener noreferrer" className="text-gray-200 hover:text-blue-400 transition-colors">• {h.title}</a>
                </li>
              ))}
            </ul>
          ) : news !== null ? (
            <div className="text-gray-500 py-1">No recent news found.</div>
          ) : null}
          <div className="absolute top-full left-6 border-4 border-transparent border-t-gray-900" />
        </div>
      )}
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center px-2 py-0.5 text-[11px] rounded border transition-colors ${
        active
          ? "bg-gray-800 text-white border-gray-800"
          : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
      }`}
    >
      {children}
    </button>
  );
}
