/**
 * US Treasury Daily Par Yield Curve — same-day 2Y/10Y/30Y source.
 *
 * See docs/daily-note-spec.md §3. FRED's DGS series publish T+1 and cannot
 * produce a same-evening print, so rates come from Treasury's daily CSV, which
 * publishes ~6pm ET (a 3:30pm ET quote). The note trigger runs ≥6:15pm ET.
 *
 * CSV shape (verified): newest row first, date MM/DD/YYYY, columns include
 * "2 Yr", "10 Yr", "30 Yr". bp change = (today − prior business day) × 100.
 *
 * Per §1a we NEVER fabricate: if today's row is not yet published, return null
 * and the RATES section is omitted rather than printing a stale day.
 */
import { logger } from "@/lib/logger";
import { etOffset } from "@/lib/notes/session";
import type { Fact, RatesData } from "@/lib/notes/types";

const SRC = "notes/treasury";

function csvUrl(year: number): string {
  return (
    "https://home.treasury.gov/resource-center/data-chart-center/interest-rates/" +
    `daily-treasury-rates.csv/${year}/all` +
    `?type=daily_treasury_yield_curve&field_tdr_date_value=${year}&page&_format=csv`
  );
}

/** Minimal RFC-4180-ish CSV line splitter (handles quoted fields). */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQ = false;
        }
      } else {
        cur += c;
      }
    } else if (c === '"') {
      inQ = true;
    } else if (c === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out;
}

/** MM/DD/YYYY → YYYY-MM-DD (the Treasury date is already an ET calendar date). */
function toIsoDate(mdY: string): string | null {
  const m = mdY.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[1]}-${m[2]}`;
}

interface TreasuryRow {
  date: string; // YYYY-MM-DD
  y2: number;
  y10: number;
  y30: number;
}

function parseCsv(text: string): TreasuryRow[] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const header = splitCsvLine(lines[0]).map((h) => h.trim());
  const i2 = header.indexOf("2 Yr");
  const i10 = header.indexOf("10 Yr");
  const i30 = header.indexOf("30 Yr");
  const iDate = header.indexOf("Date");
  if (i2 < 0 || i10 < 0 || i30 < 0 || iDate < 0) {
    logger.error(SRC, "Treasury CSV header missing expected columns", { header });
    return [];
  }

  const rows: TreasuryRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i]);
    const iso = toIsoDate(cells[iDate] ?? "");
    const y2 = parseFloat(cells[i2]);
    const y10 = parseFloat(cells[i10]);
    const y30 = parseFloat(cells[i30]);
    if (!iso || !isFinite(y2) || !isFinite(y10) || !isFinite(y30)) continue;
    rows.push({ date: iso, y2, y10, y30 });
  }
  // The feed delivers newest-first, but the prior-row bp math depends on it, so
  // sort defensively (date descending).
  rows.sort((a, b) => b.date.localeCompare(a.date));
  return rows;
}

// Yields display to 2 decimals (4.19%), so keep 2dp. bp changes are computed
// from the raw values below, independent of this rounding.
const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Fetch the rates fact for `marketDate` (YYYY-MM-DD, ET). Returns null if the
 * feed is unavailable OR today's row is not yet published (§1a: omit, don't lie).
 */
export async function fetchRatesFact(marketDate: string): Promise<Fact<RatesData> | null> {
  const year = Number(marketDate.slice(0, 4));
  try {
    const res = await fetch(csvUrl(year), {
      headers: { "User-Agent": "claudius-hq/1.0", Accept: "text/csv" },
      cache: "no-store",
    });
    if (!res.ok) {
      logger.warn(SRC, `Treasury CSV fetch failed: ${res.status}`);
      return null;
    }
    const rows = parseCsv(await res.text());
    if (rows.length < 2) return null;

    const todayIdx = rows.findIndex((r) => r.date === marketDate);
    if (todayIdx < 0) {
      // Not yet published for the target session — omit rather than print a stale day.
      logger.warn(SRC, "Treasury feed has no row for market date yet", { marketDate, newest: rows[0]?.date });
      return null;
    }
    const today = rows[todayIdx];
    const prior = rows[todayIdx + 1];
    if (!prior) return null;

    const chg2Bp = Math.round((today.y2 - prior.y2) * 100);
    const chg10Bp = Math.round((today.y10 - prior.y10) * 100);
    const chg30Bp = Math.round((today.y30 - prior.y30) * 100);
    const spread2s10Bp = Math.round((today.y10 - today.y2) * 100);
    const priorSpread = Math.round((prior.y10 - prior.y2) * 100);

    return {
      value: {
        y2: round2(today.y2),
        y10: round2(today.y10),
        y30: round2(today.y30),
        chg2Bp,
        chg10Bp,
        chg30Bp,
        spread2s10Bp,
        spread2s10ChgBp: spread2s10Bp - priorSpread,
      },
      source: "US Treasury",
      // The par-yield curve is a 3:30pm ET quote for the market date.
      asOf: `${marketDate}T15:30:00${etOffset(new Date(`${marketDate}T12:00:00Z`).getTime())}`,
    };
  } catch (error) {
    logger.error(SRC, "Treasury fetch/parse error", { error });
    return null;
  }
}
