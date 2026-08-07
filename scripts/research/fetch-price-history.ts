/**
 * One-time bulk fetch of daily price history for the scanner universe, cached
 * to .cache/price-history/ for the backtest harness.
 *
 * Run with:
 *   npx tsx scripts/research/fetch-price-history.ts
 *   npx tsx scripts/research/fetch-price-history.ts --years 5 --force
 *
 * Re-runnable: tickers already cached are skipped unless --force. The cache is
 * gitignored and regenerable, so it is safe to delete.
 *
 * ADJUSTED vs RAW CLOSE
 * ---------------------
 * This stores BOTH. The backtest uses `adjclose` (split- and dividend-adjusted)
 * because raw closes make a split look like a -90% day — the same artifact that
 * put MVIS at the top of the live report three times on a +1242% "gain".
 *
 * Note that production (watchlist-fetcher.ts fetchBars) reads `q.close`, i.e.
 * RAW. The backtest therefore measures the scorers on clean data; any edge it
 * finds is an upper bound on what production currently gets. Quantifying that
 * gap is a follow-up, not something this script assumes away.
 */
import { createClient } from "@libsql/client";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";

dotenv.config({ path: ".env.local" });
dotenv.config();

export interface CachedBar {
  d: string; // YYYY-MM-DD
  o: number;
  h: number;
  l: number;
  c: number; // raw close
  a: number; // adjusted close
  v: number;
}

const CACHE_DIR = path.join(process.cwd(), ".cache", "price-history");

const argOf = (flag: string, fallback: string): string => {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const YEARS = Number(argOf("--years", "5"));
const FORCE = process.argv.includes("--force");

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Filesystem-safe cache key — tickers contain dots and carets. */
export const cacheKey = (ticker: string) => ticker.replace(/[^A-Za-z0-9._-]/g, "_");

async function fetchTicker(ticker: string): Promise<CachedBar[] | null> {
  const url =
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}` +
    `?range=${YEARS}y&interval=1d&events=div%2Csplit`;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
      if (res.status === 429) {
        await sleep(5000 * (attempt + 1));
        continue;
      }
      if (!res.ok) return null;

      const json = (await res.json()) as {
        chart?: { result?: Array<Record<string, unknown>> };
      };
      const r = json.chart?.result?.[0] as
        | {
            timestamp?: number[];
            indicators?: {
              quote?: Array<{
                open?: (number | null)[];
                high?: (number | null)[];
                low?: (number | null)[];
                close?: (number | null)[];
                volume?: (number | null)[];
              }>;
              adjclose?: Array<{ adjclose?: (number | null)[] }>;
            };
          }
        | undefined;
      if (!r?.timestamp) return null;

      const q = r.indicators?.quote?.[0] ?? {};
      const adj = r.indicators?.adjclose?.[0]?.adjclose;
      const out: CachedBar[] = [];

      for (let i = 0; i < r.timestamp.length; i++) {
        const c = q.close?.[i];
        const o = q.open?.[i];
        const h = q.high?.[i];
        const l = q.low?.[i];
        if (c == null || o == null || h == null || l == null) continue;
        out.push({
          d: new Date(r.timestamp[i] * 1000).toISOString().slice(0, 10),
          o, h, l, c,
          // Some listings have no adjclose array; fall back to raw so the row
          // is still usable (it just carries the split artifact).
          a: adj?.[i] ?? c,
          v: q.volume?.[i] ?? 0,
        });
      }
      return out;
    } catch {
      await sleep(1000);
    }
  }
  return null;
}

async function main() {
  fs.mkdirSync(CACHE_DIR, { recursive: true });

  const client = createClient({
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN,
  });
  const rows = await client.execute("SELECT ticker FROM ticker_metrics ORDER BY ticker");
  const tickers = rows.rows.map((r) => r.ticker as string);
  console.log(`Universe: ${tickers.length} tickers · ${YEARS}y daily · force=${FORCE}`);

  let fetched = 0, skipped = 0, failed = 0;
  const failures: string[] = [];

  for (let i = 0; i < tickers.length; i++) {
    const ticker = tickers[i];
    const file = path.join(CACHE_DIR, `${cacheKey(ticker)}.json`);

    if (!FORCE && fs.existsSync(file)) {
      skipped++;
      continue;
    }

    const bars = await fetchTicker(ticker);
    if (!bars || bars.length === 0) {
      failed++;
      failures.push(ticker);
    } else {
      fs.writeFileSync(file, JSON.stringify(bars));
      fetched++;
    }

    if ((i + 1) % 25 === 0) {
      process.stdout.write(`  ${i + 1}/${tickers.length} (ok ${fetched}, skip ${skipped}, fail ${failed})\n`);
    }
    await sleep(150);
  }

  console.log(`\nDone. fetched=${fetched} skipped=${skipped} failed=${failed}`);
  if (failures.length) {
    console.log(`Failed tickers (${failures.length}): ${failures.slice(0, 40).join(", ")}${failures.length > 40 ? " …" : ""}`);
  }
  console.log(`Cache: ${CACHE_DIR}`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Fetch failed:", err);
  process.exit(1);
});
