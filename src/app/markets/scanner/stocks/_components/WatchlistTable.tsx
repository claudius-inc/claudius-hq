"use client";

import { useMemo, useState } from "react";

export type WatchlistRow = {
  ticker: string;
  name: string;
  market: "US" | "SGX" | "HK" | "JP";
  price: number | null;
  momentumScore: number | null;
  technicalScore: number | null;
  priceChange1w: number | null;
  priceChange1m: number | null;
  priceChange3m: number | null;
  themeIds: number[];
  dataQuality: "ok" | "partial" | "failed";
};

export type ThemeNameMap = Record<number, string>;

type SortKey =
  | "momentumScore" | "technicalScore"
  | "priceChange1w" | "priceChange1m" | "priceChange3m"
  | "ticker" | "name";

type SortDir = "asc" | "desc";

interface Filters {
  markets: Set<"US" | "SGX" | "HK" | "JP">;
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
  const sorted = useMemo(() => sortRows(filtered, sortKey, sortDir), [filtered, sortKey, sortDir]);

  const onHeader = (key: SortKey) => {
    if (sortKey === key) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
  };

  if (rows.length === 0) {
    return (
      <div className="p-8 text-center text-gray-500">
        No tickers tracked yet. Add stocks to your themes on the{" "}
        <a href="/markets/scanner/themes" className="text-blue-600 underline">Themes</a> page.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <FilterBar filters={filters} setFilters={setFilters} themeNames={themeNames} />
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs uppercase text-gray-500">
              <Th label="Ticker"    active={sortKey === "ticker"}         dir={sortDir} onClick={() => onHeader("ticker")} />
              <Th label="Name"      active={sortKey === "name"}           dir={sortDir} onClick={() => onHeader("name")} />
              <Th label="Momentum"  active={sortKey === "momentumScore"}  dir={sortDir} onClick={() => onHeader("momentumScore")} align="right" />
              <Th label="1W Δ"      active={sortKey === "priceChange1w"}  dir={sortDir} onClick={() => onHeader("priceChange1w")} align="right" />
              <Th label="1M Δ"      active={sortKey === "priceChange1m"}  dir={sortDir} onClick={() => onHeader("priceChange1m")} align="right" />
              <Th label="3M Δ"      active={sortKey === "priceChange3m"}  dir={sortDir} onClick={() => onHeader("priceChange3m")} align="right" />
              <Th label="Technical" active={sortKey === "technicalScore"} dir={sortDir} onClick={() => onHeader("technicalScore")} align="right" />
              <th className="px-2 py-2">Themes</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <Row key={r.ticker} row={r} themeNames={themeNames} />
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-gray-400">
        Showing {sorted.length} of {rows.length}
      </p>
    </div>
  );
}

function Th({ label, active, dir, onClick, align }: { label: string; active: boolean; dir: SortDir; onClick: () => void; align?: "left" | "right" }) {
  return (
    <th
      className={`px-2 py-2 cursor-pointer select-none ${align === "right" ? "text-right" : "text-left"}`}
      onClick={onClick}
    >
      <span className={active ? "text-gray-800" : ""}>
        {label}{active ? (dir === "desc" ? " ↓" : " ↑") : ""}
      </span>
    </th>
  );
}

function Row({ row, themeNames }: { row: WatchlistRow; themeNames: ThemeNameMap }) {
  const failed = row.dataQuality === "failed";
  return (
    <tr className={`border-b hover:bg-gray-50 ${failed ? "opacity-60" : ""}`}>
      <td className="px-2 py-2 font-mono">
        {failed && (
          <span
            title="Fetch failed"
            className="inline-block w-1.5 h-1.5 rounded-full bg-red-500 mr-1.5 align-middle"
          />
        )}
        {row.ticker}
      </td>
      <td className="px-2 py-2 max-w-[18rem] truncate" title={row.name}>{row.name}</td>
      <td className="px-2 py-2 text-right"><ScoreBadge value={row.momentumScore} /></td>
      <td className="px-2 py-2 text-right"><Delta value={row.priceChange1w} /></td>
      <td className="px-2 py-2 text-right"><Delta value={row.priceChange1m} /></td>
      <td className="px-2 py-2 text-right"><Delta value={row.priceChange3m} /></td>
      <td className="px-2 py-2 text-right"><ScoreBadge value={row.technicalScore} /></td>
      <td className="px-2 py-2">
        <div className="flex flex-wrap gap-1">
          {row.themeIds.map((id) => (
            <span key={id} className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-700">
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
    v >= 70 ? "bg-green-100 text-green-800" :
    v >= 40 ? "bg-amber-100 text-amber-800" :
              "bg-gray-100 text-gray-700";
  return <span className={`px-1.5 py-0.5 rounded text-xs font-semibold ${cls}`}>{v}</span>;
}

function Delta({ value }: { value: number | null }) {
  if (value === null) return <span className="text-gray-400">—</span>;
  const cls = value > 0 ? "text-green-700" : value < 0 ? "text-red-700" : "text-gray-700";
  const sign = value > 0 ? "+" : "";
  return <span className={cls}>{sign}{value.toFixed(2)}%</span>;
}

function filterRows(rows: WatchlistRow[], f: Filters): WatchlistRow[] {
  return rows.filter((r) => {
    if (f.markets.size > 0 && !f.markets.has(r.market)) return false;
    if (f.momentumTier === "ge40" && (r.momentumScore ?? -1) < 40) return false;
    if (f.momentumTier === "ge70" && (r.momentumScore ?? -1) < 70) return false;
    if (f.positive1wOnly && !((r.priceChange1w ?? 0) > 0)) return false;
    if (f.themeIds.size > 0 && !r.themeIds.some((id) => f.themeIds.has(id))) return false;
    return true;
  });
}

function sortRows(rows: WatchlistRow[], key: SortKey, dir: SortDir): WatchlistRow[] {
  const mul = dir === "desc" ? -1 : 1;
  const out = [...rows];
  out.sort((a, b) => {
    const av = a[key as keyof WatchlistRow] as number | string | null | undefined;
    const bv = b[key as keyof WatchlistRow] as number | string | null | undefined;
    if (av === null || av === undefined) return 1;     // nulls always last
    if (bv === null || bv === undefined) return -1;
    if (typeof av === "number" && typeof bv === "number") return (av - bv) * mul;
    return String(av).localeCompare(String(bv)) * mul;
  });
  return out;
}

function FilterBar({
  filters, setFilters, themeNames,
}: {
  filters: Filters;
  setFilters: (f: Filters) => void;
  themeNames: ThemeNameMap;
}) {
  const markets: ("US" | "SGX" | "HK" | "JP")[] = ["US", "SGX", "HK", "JP"];
  const themeEntries = Object.entries(themeNames);

  const toggleMarket = (m: "US" | "SGX" | "HK" | "JP") => {
    const next = new Set(filters.markets);
    if (next.has(m)) next.delete(m); else next.add(m);
    setFilters({ ...filters, markets: next });
  };
  const toggleTheme = (id: number) => {
    const next = new Set(filters.themeIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    setFilters({ ...filters, themeIds: next });
  };

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className="text-gray-500">Market:</span>
      {markets.map((m) => (
        <Chip key={m} active={filters.markets.has(m)} onClick={() => toggleMarket(m)}>{m}</Chip>
      ))}

      <span className="text-gray-500 ml-3">Momentum:</span>
      {(["all", "ge40", "ge70"] as const).map((t) => (
        <Chip key={t} active={filters.momentumTier === t} onClick={() => setFilters({ ...filters, momentumTier: t })}>
          {t === "all" ? "All" : t === "ge40" ? "≥40" : "≥70"}
        </Chip>
      ))}

      <Chip
        active={filters.positive1wOnly}
        onClick={() => setFilters({ ...filters, positive1wOnly: !filters.positive1wOnly })}
      >
        1W positive
      </Chip>

      {themeEntries.length > 0 && (
        <>
          <span className="text-gray-500 ml-3">Theme:</span>
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

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-2 py-0.5 rounded border ${active ? "bg-gray-800 text-white border-gray-800" : "bg-white text-gray-700 border-gray-300 hover:border-gray-500"}`}
    >
      {children}
    </button>
  );
}
