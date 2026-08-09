/**
 * SPDR daily holdings (XLSX) — S&P 500 membership, GICS sector, float weight.
 * See docs/daily-note-spec.md §3.
 *
 * Two facts come from two different files, because neither has both:
 *  - GICS sector: the 11 Select Sector SPDR files (XLK, XLF, …). Each file IS
 *    one sector and together they partition the index — the files' own `Sector`
 *    column is unpopulated ("-"), so membership is the signal.
 *  - Float-adjusted index weight: the SPY file's `Weight` column (percent).
 *
 * Sheet shape (verified): a 3-row preamble, then a header row
 * ["Name","Ticker","Identifier","SEDOL","Weight","Sector","Shares Held","Local Currency"].
 * The URL path 301-redirects once; fetch follows redirects by default.
 */
import * as XLSX from "xlsx";
import { logger } from "@/lib/logger";

const SRC = "notes/spdr-holdings";

/** The 11 GICS sector SPDRs whose union is the S&P 500. */
export const SECTOR_SPDRS = [
  "XLK", "XLF", "XLY", "XLC", "XLV", "XLI", "XLP", "XLE", "XLB", "XLRE", "XLU",
] as const;

function holdingsUrl(etf: string): string {
  return (
    "https://www.ssga.com/us/en/intermediary/library-content/products/fund-data/etfs/us/" +
    `holdings-daily-us-en-${etf.toLowerCase()}.xlsx`
  );
}

export interface HoldingRow {
  ticker: string;
  name: string | null;
  /** Percent of the fund (e.g. 7.99656). */
  weight: number | null;
}

/** Parse the holdings sheet into rows, tolerating the shifting preamble. */
function parseHoldings(buf: ArrayBuffer): HoldingRow[] {
  const wb = XLSX.read(buf, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) return [];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, blankrows: false });

  const headerIdx = rows.findIndex(
    (r) => Array.isArray(r) && r.some((c) => String(c).trim() === "Ticker"),
  );
  if (headerIdx < 0) return [];
  const header = (rows[headerIdx] as unknown[]).map((c) => String(c).trim());
  const iTicker = header.indexOf("Ticker");
  const iName = header.indexOf("Name");
  const iWeight = header.indexOf("Weight");
  if (iTicker < 0) return [];

  const out: HoldingRow[] = [];
  let skipped = 0;
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i] as unknown[];
    const ticker = String(r?.[iTicker] ?? "").trim().toUpperCase();
    if (!ticker) continue; // blank row
    // Skip cash/placeholder lines ("-", "CASH") and anything not ticker-shaped.
    // No S&P 500 ticker currently contains a digit; count skips so a future one
    // can't vanish silently.
    if (!/^[A-Z][A-Z.\-]{0,6}$/.test(ticker)) {
      skipped++;
      continue;
    }
    const weightRaw = iWeight >= 0 ? Number(r[iWeight]) : NaN;
    out.push({
      ticker,
      name: iName >= 0 && r[iName] != null ? String(r[iName]).trim() : null,
      weight: Number.isFinite(weightRaw) ? weightRaw : null,
    });
  }
  if (skipped > 0) logger.info(SRC, "Skipped non-ticker holdings rows", { skipped, kept: out.length });
  return out;
}

async function fetchHoldings(etf: string): Promise<HoldingRow[]> {
  const res = await fetch(holdingsUrl(etf), {
    headers: {
      // SSGA rejects a bare fetch UA.
      "User-Agent": "Mozilla/5.0 (compatible; claudius-hq/1.0)",
      Accept: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,*/*",
    },
    redirect: "follow",
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`${etf} holdings fetch failed: ${res.status}`);
  return parseHoldings(await res.arrayBuffer());
}

export interface ConstituentRow {
  ticker: string;
  name: string | null;
  sectorEtf: string;
  /** Percent of SPY. */
  spyWeight: number | null;
  /** Percent of its own sector SPDR — a different number, not derivable from spyWeight. */
  sectorWeight: number | null;
}

/**
 * Build the full S&P 500 constituent set: sector membership from the 11 sector
 * SPDRs, float weight joined from SPY. Throws if the shape is implausible —
 * a half-parsed universe must never silently become "the index".
 */
export async function fetchSp500Constituents(): Promise<ConstituentRow[]> {
  const [spy, ...sectors] = await Promise.all([
    fetchHoldings("SPY"),
    ...SECTOR_SPDRS.map((etf) => fetchHoldings(etf).then((rows) => ({ etf, rows }))),
  ]);

  const weightByTicker = new Map<string, number | null>();
  for (const h of spy) weightByTicker.set(h.ticker, h.weight);

  const out = new Map<string, ConstituentRow>();
  for (const { etf, rows } of sectors) {
    if (rows.length === 0) throw new Error(`${etf} holdings parsed to 0 rows`);
    for (const h of rows) {
      // First sector file wins; a name should appear in exactly one.
      if (out.has(h.ticker)) continue;
      out.set(h.ticker, {
        ticker: h.ticker,
        name: h.name,
        sectorEtf: etf,
        spyWeight: weightByTicker.get(h.ticker) ?? null,
        // The sector file's own Weight column — previously parsed and thrown away.
        sectorWeight: h.weight,
      });
    }
  }

  const list = Array.from(out.values());
  if (list.length < 400) throw new Error(`Implausible constituent count: ${list.length}`);
  logger.info(SRC, "Fetched S&P 500 constituents", {
    total: list.length,
    withWeight: list.filter((c) => c.spyWeight != null).length,
  });
  return list;
}
