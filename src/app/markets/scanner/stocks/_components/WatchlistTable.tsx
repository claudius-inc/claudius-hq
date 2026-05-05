"use client";

import { useMemo, useState, useRef, useEffect, useCallback } from "react";
import { ChevronDown, ChevronUp, Info, Newspaper } from "lucide-react";

export type WatchlistRow = {
  ticker: string;
  name: string;
  market: "US" | "SGX" | "HK" | "JP" | "KS" | "CN";
  price: number | null;
  momentumScore: number | null;
  technicalScore: number | null;
  priceChange1w: number | null;
  priceChange1m: number | null;
  priceChange3m: number | null;
  themeIds: number[];
  dataQuality: "ok" | "partial" | "failed";
  description?: string | null;
};

export type ThemeNameMap = Record<number, string>;

type SortKey =
  | "momentumScore"
  | "technicalScore"
  | "priceChange1w"
  | "priceChange1m"
  | "priceChange3m"
  | "ticker"
  | "name";

type SortDir = "asc" | "desc";

interface Filters {
  markets: Set<"US" | "SGX" | "HK" | "JP" | "KS" | "CN">;
  momentumTier: "all" | "ge40" | "ge70";
  positive1wOnly: boolean;
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
}: {
  label: string;
  active: boolean;
  dir: SortDir;
  onClick: () => void;
  align?: "left" | "right";
}) {
  const alignClass = align === "right" ? "text-right" : "text-left";
  return (
    <th
      className={`px-3 py-2.5 ${alignClass} text-xs font-medium text-gray-500 cursor-pointer select-none hover:text-gray-700`}
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
    <tr className={`hover:bg-gray-50 text-sm ${failed ? "opacity-60" : ""}`}>
      <td className="px-3 py-2.5 whitespace-nowrap font-mono">
        {failed && (
          <span
            title="Fetch failed"
            className="inline-block w-1.5 h-1.5 rounded-full bg-gray-400 mr-1.5 align-middle"
          />
        )}
        {row.ticker}
      </td>
      <td className="px-3 py-2.5 whitespace-nowrap max-w-[22rem]">
        <div className="flex items-center gap-1.5">
          <span className="truncate" title={row.name}>{row.name}</span>
          {row.description && <InfoHover content={row.description} />}
          <NewsHover ticker={row.ticker} />
        </div>
      </td>
      <td className="px-3 py-2.5 whitespace-nowrap text-right">
        <ScoreBadge value={row.momentumScore} />
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
  const markets: ("US" | "SGX" | "HK" | "JP" | "KS" | "CN")[] = [
    "US",
    "SGX",
    "HK",
    "JP",
    "KS",
    "CN",
  ];
  const themeEntries = Object.entries(themeNames);

  const toggleMarket = (m: "US" | "SGX" | "HK" | "JP" | "KS" | "CN") => {
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

      <span className="text-gray-500 ml-2">Momentum:</span>
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

      {themeEntries.length > 0 && (
        <>
          <span className="text-gray-500 ml-2">Theme:</span>
          {themeEntries.map(([id, name]) => (
            <Chip
              key={id}
              active={filters.themeIds.has(Number(id))}
              onClick={() => toggleTheme(Number(id))}
            >
              {name}
            </Chip>
          ))}
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

/* ── Info icon: shows company description on hover ── */
function InfoHover({ content }: { content: string }) {
  const { open, ref, show, hide } = useHoverTooltip();
  return (
    <div ref={ref} className="relative inline-flex" onMouseEnter={show} onMouseLeave={hide}>
      <Info className="w-3.5 h-3.5 text-gray-400 hover:text-blue-500 transition-colors cursor-default flex-shrink-0" />
      {open && (
        <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 bg-gray-900 text-white text-[11px] leading-relaxed rounded-lg px-3 py-2 shadow-lg pointer-events-none">
          {content}
          <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900" />
        </div>
      )}
    </div>
  );
}

/* ── Newspaper icon: fetches & shows top headlines on hover ── */
function NewsHover({ ticker }: { ticker: string }) {
  const { open, ref, show, hide } = useHoverTooltip();
  const [news, setNews] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchNews = useCallback(async () => {
    if (news !== null) return; // already fetched
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

  return (
    <div ref={ref} className="relative inline-flex" onMouseEnter={handleEnter} onMouseLeave={hide}>
      <Newspaper className="w-3.5 h-3.5 text-gray-400 hover:text-blue-500 transition-colors cursor-default flex-shrink-0" />
      {open && (
        <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-72 bg-gray-900 text-white text-[11px] rounded-lg px-3 py-2.5 shadow-lg">
          <div className="font-semibold text-[10px] uppercase tracking-wide text-gray-400 mb-1.5">Latest News</div>
          {loading ? (
            <div className="text-gray-400 py-1">Loading…</div>
          ) : news && news.length > 0 ? (
            <ul className="space-y-1.5">
              {news.map((h, i) => (
                <li key={i} className="text-gray-200 leading-snug">• {h}</li>
              ))}
            </ul>
          ) : news !== null ? (
            <div className="text-gray-500 py-1">No recent news found.</div>
          ) : null}
          <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900" />
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
