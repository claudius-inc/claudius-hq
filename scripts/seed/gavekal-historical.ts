/**
 * Seed historical Gavekal monthly data 1928–present.
 *
 * Stores four monthly series in `gavekal_prices` with `_M` suffix:
 *   ^GSPC_M  — S&P 500 monthly close (Yahoo daily 1928+, aggregated)
 *   WTI_M    — WTI crude monthly (FRED WTISPLC 1946+, EIA annual 1928–1945)
 *   GOLD_M   — Gold $/oz monthly (FRED LBMA 1968+, step function pre-1968)
 *   UST10Y_M — Synthetic 10y UST total return index (built from yields)
 *
 * Run: npx tsx scripts/seed-gavekal-historical.ts
 *
 * Reads TURSO_DATABASE_URL, TURSO_AUTH_TOKEN, FRED_API_KEY from .env(.local).
 */

import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import { createClient } from "@libsql/client";
import YahooFinance from "yahoo-finance2";

const yahoo = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

const FRED_KEY = process.env.FRED_API_KEY;
const TURSO_URL = process.env.TURSO_DATABASE_URL;
const TURSO_TOKEN = process.env.TURSO_AUTH_TOKEN;

if (!FRED_KEY) throw new Error("FRED_API_KEY missing in env");
if (!TURSO_URL) throw new Error("TURSO_DATABASE_URL missing in env");

const START_YEAR = 1928;
const START_DATE = `${START_YEAR}-01-01`;

const db = createClient({ url: TURSO_URL, authToken: TURSO_TOKEN });

// ── Type helpers ────────────────────────────────────────────────────────────

type MonthlyMap = Map<string, number>; // key: "YYYY-MM-01", val: close

const ymKey = (date: Date): string =>
  `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-01`;

const ymKeyFromString = (dateStr: string): string => {
  // Accept YYYY-MM-DD and return first-of-month
  return `${dateStr.slice(0, 7)}-01`;
};

// ── 1. Fetch Shiller monthly data (S&P 500 + 10y yield, 1871–present) ─────

interface ShillerRow {
  date: string; // YYYY-MM-01
  sp500: number;
  longRate: number; // 10y treasury yield
}

async function fetchShillerData(): Promise<ShillerRow[]> {
  console.log("→ Fetching Robert Shiller monthly dataset (datahub mirror)…");
  const url =
    "https://raw.githubusercontent.com/datasets/s-and-p-500/master/data/data.csv";
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Shiller fetch failed: ${res.status}`);
  const csv = await res.text();
  const lines = csv.trim().split("\n");
  const header = lines[0].split(",");
  const dateIdx = header.indexOf("Date");
  const spIdx = header.indexOf("SP500");
  const rateIdx = header.indexOf("Long Interest Rate");
  if (dateIdx < 0 || spIdx < 0 || rateIdx < 0) {
    throw new Error("Shiller CSV missing expected columns");
  }
  const rows: ShillerRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",");
    const sp = parseFloat(cols[spIdx]);
    const lr = parseFloat(cols[rateIdx]);
    if (!isFinite(sp) || sp <= 0) continue;
    rows.push({
      date: cols[dateIdx],
      sp500: sp,
      longRate: isFinite(lr) ? lr : 0,
    });
  }
  console.log(
    `  ✓ ${rows.length} monthly rows, ${rows[0].date} → ${rows[rows.length - 1].date}`,
  );
  return rows;
}

function shillerToSP500(rows: ShillerRow[]): MonthlyMap {
  const out: MonthlyMap = new Map();
  for (const r of rows) {
    if (r.date >= START_DATE) out.set(r.date, r.sp500);
  }
  return out;
}

function shillerToYields(rows: ShillerRow[]): MonthlyMap {
  const out: MonthlyMap = new Map();
  for (const r of rows) {
    if (r.date >= START_DATE && r.longRate > 0) out.set(r.date, r.longRate);
  }
  return out;
}

// ── 2. Generic FRED fetcher ─────────────────────────────────────────────────

interface FredObservation {
  date: string;
  value: string;
}
interface FredResponse {
  observations: FredObservation[];
}

async function fetchFred(
  seriesId: string,
  startDate: string,
): Promise<MonthlyMap> {
  console.log(`→ Fetching FRED ${seriesId} from ${startDate}…`);
  const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${seriesId}&api_key=${FRED_KEY}&file_type=json&observation_start=${startDate}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`FRED ${seriesId} failed: ${res.status} ${res.statusText}`);
  }
  const data = (await res.json()) as FredResponse;
  const out: MonthlyMap = new Map();
  for (const obs of data.observations) {
    if (obs.value === "." || obs.value == null) continue;
    const v = parseFloat(obs.value);
    if (!isFinite(v)) continue;
    out.set(ymKeyFromString(obs.date), v);
  }
  console.log(`  ✓ ${out.size} observations`);
  return out;
}

// Daily FRED series → monthly (last value of each month)
async function fetchFredAndAggregateMonthly(
  seriesId: string,
  startDate: string,
): Promise<MonthlyMap> {
  console.log(`→ Fetching FRED ${seriesId} (daily→monthly) from ${startDate}…`);
  const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${seriesId}&api_key=${FRED_KEY}&file_type=json&observation_start=${startDate}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`FRED ${seriesId} failed: ${res.status} ${res.statusText}`);
  }
  const data = (await res.json()) as FredResponse;
  const monthly: MonthlyMap = new Map();
  // Last observation of each month wins
  for (const obs of data.observations) {
    if (obs.value === "." || obs.value == null) continue;
    const v = parseFloat(obs.value);
    if (!isFinite(v)) continue;
    monthly.set(ymKeyFromString(obs.date), v);
  }
  console.log(`  ✓ ${monthly.size} monthly observations (aggregated)`);
  return monthly;
}

// ── 3. Build WTI monthly: FRED 1946+, inline annuals 1928–1945 ─────────────

// EIA US first purchase price of crude oil, $/bbl, annual averages
// Source: EIA historical petroleum statistics
const WTI_ANNUAL_PRE1946: Record<number, number> = {
  1928: 1.17,
  1929: 1.27,
  1930: 1.19,
  1931: 0.65,
  1932: 0.87,
  1933: 0.67,
  1934: 1.0,
  1935: 0.97,
  1936: 1.09,
  1937: 1.18,
  1938: 1.13,
  1939: 1.02,
  1940: 1.02,
  1941: 1.14,
  1942: 1.19,
  1943: 1.2,
  1944: 1.21,
  1945: 1.05,
};

async function buildWtiMonthly(): Promise<MonthlyMap> {
  const out: MonthlyMap = new Map();

  // Inline pre-1946: forward-fill annual to monthly
  for (let y = 1928; y <= 1945; y++) {
    const v = WTI_ANNUAL_PRE1946[y];
    for (let m = 1; m <= 12; m++) {
      const key = `${y}-${String(m).padStart(2, "0")}-01`;
      out.set(key, v);
    }
  }

  // FRED WTISPLC: monthly WTI Spot Price, 1946+
  const fred = await fetchFred("WTISPLC", "1946-01-01");
  fred.forEach((v, k) => out.set(k, v));

  console.log(`  WTI total: ${out.size} monthly points`);
  return out;
}

// ── 4. Build gold monthly from datahub mirror (1833+) ──────────────────────

async function buildGoldMonthly(): Promise<MonthlyMap> {
  console.log("→ Fetching datahub gold prices monthly (1833+)…");
  const url =
    "https://raw.githubusercontent.com/datasets/gold-prices/master/data/monthly.csv";
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Gold CSV fetch failed: ${res.status}`);
  const csv = await res.text();
  const lines = csv.trim().split("\n");
  const out: MonthlyMap = new Map();
  for (let i = 1; i < lines.length; i++) {
    const [dateStr, priceStr] = lines[i].split(",");
    const v = parseFloat(priceStr);
    if (!isFinite(v) || v <= 0) continue;
    // CSV uses YYYY-MM, normalise to YYYY-MM-01
    const key = `${dateStr.trim()}-01`;
    if (key >= START_DATE) out.set(key, v);
  }
  console.log(`  ✓ ${out.size} monthly gold points`);
  return out;
}

// (Yields now come from Shiller's CSV directly via shillerToYields)

// ── 6. Build synthetic 10y UST total return index ──────────────────────────

/**
 * Build a synthetic constant-maturity 10y Treasury total return index from
 * monthly yields. This is what IEF approximates.
 *
 * Per-month total return:
 *   r_t = (yield_{t-1} / 12)              ← coupon income
 *       + (-D × Δyield)                   ← capital gain from yield change
 *
 * where D ≈ 7.5 is the modified duration of a constant-maturity 10y bond
 * (varies with the yield level but 7.5 is a fair central estimate for the
 * 1928–present range).
 *
 * Index starts at 100 in the first month and compounds.
 */
function buildSyntheticUstTotalReturn(yields: MonthlyMap): MonthlyMap {
  const sortedKeys = Array.from(yields.keys()).sort();
  const out: MonthlyMap = new Map();
  if (sortedKeys.length === 0) return out;

  const D = 7.5;
  let index = 100;
  let prevYield: number | null = null;

  for (const key of sortedKeys) {
    const y = yields.get(key)!;
    if (prevYield !== null) {
      const couponReturn = prevYield / 100 / 12; // monthly coupon income
      const capitalReturn = -D * (y - prevYield) / 100; // -D × Δy (Δy in %)
      const totalReturn = couponReturn + capitalReturn;
      index = index * (1 + totalReturn);
    }
    out.set(key, Math.round(index * 10000) / 10000);
    prevYield = y;
  }

  return out;
}

// ── 7. Storage ──────────────────────────────────────────────────────────────

async function ensureTable() {
  // Create gavekal_prices table if it doesn't exist (matches schema.ts shape)
  await db.execute(`
    CREATE TABLE IF NOT EXISTS gavekal_prices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      symbol TEXT NOT NULL,
      date TEXT NOT NULL,
      close REAL NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);
  await db.execute(
    `CREATE UNIQUE INDEX IF NOT EXISTS gavekal_prices_symbol_date_idx
     ON gavekal_prices (symbol, date)`,
  );
  console.log("  ✓ gavekal_prices table ensured");
}

async function clearSymbol(symbol: string) {
  const result = await db.execute({
    sql: "DELETE FROM gavekal_prices WHERE symbol = ?",
    args: [symbol],
  });
  console.log(`  cleared ${result.rowsAffected} existing rows for ${symbol}`);
}

async function storeMonthly(symbol: string, data: MonthlyMap) {
  await clearSymbol(symbol);
  const sorted = Array.from(data.entries()).sort(([a], [b]) => a.localeCompare(b));
  const BATCH = 200;
  let inserted = 0;
  for (let i = 0; i < sorted.length; i += BATCH) {
    const batch = sorted.slice(i, i + BATCH);
    // Build a multi-row INSERT statement
    const placeholders = batch.map(() => "(?, ?, ?)").join(", ");
    const args: (string | number)[] = [];
    for (const [date, close] of batch) {
      args.push(symbol, date, close);
    }
    await db.execute({
      sql: `INSERT INTO gavekal_prices (symbol, date, close) VALUES ${placeholders}`,
      args,
    });
    inserted += batch.length;
  }
  console.log(`  ✓ stored ${inserted} rows for ${symbol}`);
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log("=== Gavekal Historical Backfill 1928–present ===\n");

  await ensureTable();

  // 1. Shiller dataset (S&P 500 + 10y yield, 1871–present)
  const shiller = await fetchShillerData();
  const spx = shillerToSP500(shiller);
  await storeMonthly("^GSPC_M", spx);

  // 2. WTI
  const wti = await buildWtiMonthly();
  await storeMonthly("WTI_M", wti);

  // 3. Gold
  const gold = await buildGoldMonthly();
  await storeMonthly("GOLD_M", gold);

  // 4. 10y yields from Shiller (1871–2023) + FRED GS10 (1953+, more current)
  const yields = shillerToYields(shiller);
  console.log(`  10Y yield (from Shiller): ${yields.size} monthly points`);
  const gs10 = await fetchFred("GS10", "2020-01-01");
  let patched = 0;
  gs10.forEach((v, k) => {
    if (!yields.has(k) || yields.get(k) === 0) {
      yields.set(k, v);
      patched++;
    }
  });
  console.log(`  10Y yield: patched ${patched} months from FRED GS10`);
  console.log(`  10Y yield total: ${yields.size} monthly points`);
  const ust = buildSyntheticUstTotalReturn(yields);
  await storeMonthly("UST10Y_M", ust);

  // Quick sanity check: print first/last point for each series
  console.log("\n=== Sanity check ===");
  for (const sym of ["^GSPC_M", "WTI_M", "GOLD_M", "UST10Y_M"]) {
    const rows = await db.execute({
      sql: `SELECT date, close FROM gavekal_prices WHERE symbol = ?
            ORDER BY date ASC LIMIT 1`,
      args: [sym],
    });
    const first = rows.rows[0];
    const last = (
      await db.execute({
        sql: `SELECT date, close FROM gavekal_prices WHERE symbol = ?
              ORDER BY date DESC LIMIT 1`,
        args: [sym],
      })
    ).rows[0];
    const count = (
      await db.execute({
        sql: `SELECT COUNT(*) as c FROM gavekal_prices WHERE symbol = ?`,
        args: [sym],
      })
    ).rows[0];
    console.log(
      `  ${sym}: ${count.c} rows, ${first.date}=${first.close} → ${last.date}=${last.close}`,
    );
  }

  console.log("\n✅ Historical backfill complete");
  process.exit(0);
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
