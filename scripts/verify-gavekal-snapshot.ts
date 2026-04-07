/**
 * Verify the gavekal_historical_snapshot lazy-backfill pipeline.
 *
 * Steps:
 *   1. Confirm the table exists.
 *   2. Print current row count (may be 0 if no one has hit the API yet).
 *   3. If empty, hit /api/markets/gavekal to trigger lazy backfill.
 *   4. Re-query and spot-check a handful of historical regime classifications.
 *
 * Usage: npx tsx scripts/verify-gavekal-snapshot.ts
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

async function tableExists(): Promise<boolean> {
  const r = await client.execute(
    "SELECT name FROM sqlite_master WHERE type='table' AND name = 'gavekal_historical_snapshot'",
  );
  return r.rows.length > 0;
}

async function rowCount(): Promise<number> {
  const r = await client.execute(
    "SELECT COUNT(*) AS c FROM gavekal_historical_snapshot",
  );
  return Number(r.rows[0].c);
}

async function dateRange(): Promise<{ first: string; last: string } | null> {
  const r = await client.execute(
    "SELECT MIN(date) AS first, MAX(date) AS last FROM gavekal_historical_snapshot",
  );
  if (!r.rows.length || !r.rows[0].first) return null;
  return {
    first: String(r.rows[0].first),
    last: String(r.rows[0].last),
  };
}

async function spotCheck() {
  const dates = [
    "1980-01-01",
    "1990-01-01",
    "2000-01-01",
    "2010-01-01",
    "2020-01-01",
    "2024-01-01",
  ];
  const placeholders = dates.map(() => "?").join(", ");
  const r = await client.execute({
    sql: `SELECT date, energy_ratio, currency_ratio, energy_ma, currency_ma, regime
          FROM gavekal_historical_snapshot
          WHERE date IN (${placeholders})
          ORDER BY date`,
    args: dates,
  });
  return r.rows;
}

async function regimeChangeCount(): Promise<number> {
  // Count distinct regime transitions (consecutive different regimes).
  // We do this in JS for clarity rather than a SQL window function.
  const r = await client.execute(
    "SELECT date, regime FROM gavekal_historical_snapshot WHERE date >= '1971-01-01' ORDER BY date",
  );
  let last: string | null = null;
  let changes = 0;
  for (const row of r.rows) {
    const regime = String(row.regime);
    if (regime !== last) {
      changes++;
      last = regime;
    }
  }
  return changes;
}

async function fetchApi(): Promise<{
  status: number;
  ok: boolean;
  hasHistory: boolean;
  historyLen?: number;
}> {
  const url = `${API_BASE}/api/markets/gavekal`;
  console.log(`→ GET ${url}`);
  const apiKey = process.env.HQ_API_KEY;
  if (!apiKey) {
    throw new Error(
      "HQ_API_KEY missing in env — required to bypass middleware auth.",
    );
  }
  const res = await fetch(url, { headers: { "x-api-key": apiKey } });
  const ok = res.ok;
  let hasHistory = false;
  let historyLen: number | undefined;
  if (ok) {
    const json = (await res.json()) as { regimeHistory?: unknown[] };
    hasHistory = Array.isArray(json.regimeHistory);
    historyLen = Array.isArray(json.regimeHistory)
      ? json.regimeHistory.length
      : undefined;
  }
  return { status: res.status, ok, hasHistory, historyLen };
}

async function main() {
  console.log("=== Gavekal Historical Snapshot Verification ===\n");

  // 1. Table existence
  if (!(await tableExists())) {
    throw new Error(
      "gavekal_historical_snapshot does not exist. Run scripts/run-gavekal-snapshot-migration.ts first.",
    );
  }
  console.log("✓ Table exists\n");

  // 2. Pre-fetch row count
  const before = await rowCount();
  console.log(`Rows before API hit: ${before}`);

  // 3. Hit the API to trigger lazy backfill if empty
  if (before === 0) {
    // Bust the marketCache row so the route doesn't short-circuit on a
    // pre-existing cached GavekalData JSON (which would skip the backfill).
    const bust = await client.execute(
      "DELETE FROM market_cache WHERE key LIKE 'gavekal:quadrant%'",
    );
    console.log(
      `Cleared ${bust.rowsAffected ?? 0} marketCache rows to force re-compute.`,
    );
    console.log("Hitting API to trigger lazy backfill…\n");
    try {
      const r = await fetchApi();
      console.log(
        `  ← status=${r.status} ok=${r.ok} regimeHistoryLen=${r.historyLen ?? "n/a"}\n`,
      );
    } catch (e) {
      console.warn(
        `  ⚠ API fetch failed (is the dev server running on ${API_BASE}?):`,
        e instanceof Error ? e.message : e,
      );
      console.warn(
        "  → continuing; will check the DB directly. If empty, you'll need to hit /markets in the browser.",
      );
    }
  } else {
    console.log("Snapshot already populated — skipping API hit.\n");
  }

  // 4. Post-fetch row count
  const after = await rowCount();
  console.log(`Rows after: ${after}`);

  if (after === 0) {
    console.error(
      "\n✗ Snapshot is still empty. Either the API was unreachable, the source monthly tables (^GSPC_M, WTI_M, GOLD_M, UST10Y_M) aren't seeded, or the lazy backfill silently failed. Check logs.",
    );
    process.exit(1);
  }

  // 5. Date range
  const range = await dateRange();
  if (range) {
    console.log(`Date range: ${range.first} → ${range.last}`);
  }

  // 6. Regime change count
  const changes = await regimeChangeCount();
  console.log(`Distinct regime transitions since 1971-01-01: ${changes}`);

  // 7. Spot check
  console.log("\nSpot check (selected decades):");
  const rows = await spotCheck();
  for (const row of rows) {
    const eMa = row.energy_ma == null ? "—" : Number(row.energy_ma).toFixed(4);
    const cMa = row.currency_ma == null ? "—" : Number(row.currency_ma).toFixed(4);
    console.log(
      `  ${row.date}  energy=${Number(row.energy_ratio).toFixed(4)} (MA ${eMa})  currency=${Number(row.currency_ratio).toFixed(4)} (MA ${cMa})  regime=${row.regime}`,
    );
  }

  // 8. Sanity assertions
  if (after < 600 || after > 800) {
    console.warn(
      `\n⚠ Row count ${after} is outside expected range (~660–720). Investigate.`,
    );
  }
  if (changes < 5 || changes > 60) {
    console.warn(
      `\n⚠ Regime transition count ${changes} is outside expected range (~10–40). Investigate.`,
    );
  }

  console.log("\n✅ Verification complete.");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("FAILED:", e);
    process.exit(1);
  });
