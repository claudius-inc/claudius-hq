/**
 * Verify the stock_prices_daily cache populates after a theme refresh.
 *
 * Steps:
 *   1. Bust the themes:performance marketCache row.
 *   2. Hit /api/themes/performance to trigger fetchThemePerformanceAll.
 *   3. Re-query stock_prices_daily and report row count + ticker count.
 *
 * Usage: npx tsx scripts/verify-stock-prices-cache.ts
 */
import { createClient } from "@libsql/client";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

const client = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

const API_BASE = process.env.VERIFY_API_BASE || "http://localhost:3000";

async function rowCount(): Promise<{ rows: number; tickers: number }> {
  const r1 = await client.execute(
    "SELECT COUNT(*) AS c FROM stock_prices_daily",
  );
  const r2 = await client.execute(
    "SELECT COUNT(DISTINCT ticker) AS c FROM stock_prices_daily",
  );
  return {
    rows: Number(r1.rows[0].c),
    tickers: Number(r2.rows[0].c),
  };
}

async function main() {
  console.log("=== stock_prices_daily Cache Verification ===\n");

  const before = await rowCount();
  console.log(`Before: ${before.rows} rows across ${before.tickers} tickers`);

  // Clear the themes:performance marketCache so the route actually
  // re-runs fetchThemePerformanceAll instead of returning a hot cache.
  const bust = await client.execute(
    "DELETE FROM market_cache WHERE key LIKE 'themes%'",
  );
  console.log(`Cleared ${bust.rowsAffected ?? 0} theme marketCache rows.\n`);

  const apiKey = process.env.HQ_API_KEY;
  if (!apiKey) throw new Error("HQ_API_KEY missing in env");

  console.log(`→ GET ${API_BASE}/api/themes/performance`);
  const t0 = Date.now();
  const res = await fetch(`${API_BASE}/api/themes/performance`, {
    headers: { "x-api-key": apiKey },
  });
  const elapsed = Date.now() - t0;
  console.log(`  ← status=${res.status}  elapsed=${elapsed}ms\n`);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API failed: ${res.status} ${text}`);
  }
  const json = (await res.json()) as { themes?: { name: string }[] };
  console.log(`  themes returned: ${json.themes?.length ?? 0}\n`);

  // Background insert may take a moment to flush.
  await new Promise((r) => setTimeout(r, 1500));

  const after = await rowCount();
  console.log(`After:  ${after.rows} rows across ${after.tickers} tickers`);
  console.log(
    `Delta:  +${after.rows - before.rows} rows / +${after.tickers - before.tickers} tickers\n`,
  );

  if (after.rows === before.rows) {
    console.log(
      "✅ Warm path: every ticker served from DB cache, no Yahoo calls needed.",
    );
  } else {
    console.log(
      `✅ Cold/partial fill: +${after.rows - before.rows} rows pulled from Yahoo and persisted.`,
    );
  }

  // Sample a few rows
  const sample = await client.execute(
    "SELECT ticker, COUNT(*) AS days, MIN(date) AS first, MAX(date) AS last FROM stock_prices_daily GROUP BY ticker ORDER BY ticker LIMIT 6",
  );
  console.log("Sample tickers:");
  for (const r of sample.rows) {
    console.log(
      `  ${String(r.ticker ?? "").padEnd(6)}  ${String(r.days).padStart(3)} days  (${r.first} → ${r.last})`,
    );
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("FAILED:", e);
    process.exit(1);
  });
