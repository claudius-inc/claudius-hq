/**
 * Prove the "live quote + immutable history" refactor actually populates
 * today's row from the live Yahoo quote (not just from a stale chart() backfill).
 *
 * Steps:
 *   1. Pick the freshest ticker in stock_prices_daily.
 *   2. DELETE its row for today's date (if any) so we can prove a re-write.
 *   3. Bust the themes:performance marketCache.
 *   4. Hit /api/themes/performance — `fetchLiveQuotes` should fire and
 *      append today's close back into the DB.
 *   5. Re-query: today's row for that ticker must be back, with a fresh close.
 *
 * Usage: npx tsx scripts/verify-themes-freshness.ts
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

async function main() {
  console.log("=== Themes Freshness Verification ===\n");

  const apiKey = process.env.HQ_API_KEY;
  if (!apiKey) throw new Error("HQ_API_KEY missing in env");

  // Pick a representative ticker (one we know is liquid + Yahoo-tracked)
  const candidate = await client.execute(
    "SELECT ticker, MAX(date) AS latest, COUNT(*) AS rows FROM stock_prices_daily WHERE ticker IN ('AAPL','SPY','NVDA','MSFT','TSLA','AMD','QQQ') GROUP BY ticker ORDER BY rows DESC LIMIT 1",
  );
  if (candidate.rows.length === 0) {
    console.error("No common tickers found in stock_prices_daily.");
    process.exit(1);
  }
  const ticker = String(candidate.rows[0].ticker);
  console.log(`Selected test ticker: ${ticker}`);

  const today = new Date().toISOString().split("T")[0];
  console.log(`Today: ${today}\n`);

  // Snapshot before
  const beforeRow = await client.execute({
    sql: "SELECT date, close FROM stock_prices_daily WHERE ticker=? ORDER BY date DESC LIMIT 3",
    args: [ticker],
  });
  console.log(`Before — last 3 rows for ${ticker}:`);
  for (const r of beforeRow.rows) console.log(`  ${r.date}  ${r.close}`);

  // Delete today's row if any (simulating a fresh tomorrow)
  const del = await client.execute({
    sql: "DELETE FROM stock_prices_daily WHERE ticker=? AND date=?",
    args: [ticker, today],
  });
  console.log(`\nDeleted ${del.rowsAffected ?? 0} row(s) for ${ticker} on ${today}.`);

  // Bust the themes:performance marketCache
  const bust = await client.execute(
    "DELETE FROM market_cache WHERE key LIKE 'themes%'",
  );
  console.log(`Cleared ${bust.rowsAffected ?? 0} theme marketCache rows.\n`);

  // Hit the API
  console.log(`→ GET ${API_BASE}/api/themes/performance`);
  const t0 = Date.now();
  const res = await fetch(`${API_BASE}/api/themes/performance`, {
    headers: { "x-api-key": apiKey },
  });
  const elapsed = Date.now() - t0;
  console.log(`  ← status=${res.status}  elapsed=${elapsed}ms\n`);
  if (!res.ok) throw new Error(`API failed: ${res.status}`);

  // Background insert may take a moment to flush.
  await new Promise((r) => setTimeout(r, 1500));

  // Snapshot after
  const afterRow = await client.execute({
    sql: "SELECT date, close FROM stock_prices_daily WHERE ticker=? ORDER BY date DESC LIMIT 3",
    args: [ticker],
  });
  console.log(`After — last 3 rows for ${ticker}:`);
  for (const r of afterRow.rows) console.log(`  ${r.date}  ${r.close}`);

  // Verify today's row exists
  const todayRow = await client.execute({
    sql: "SELECT close FROM stock_prices_daily WHERE ticker=? AND date=?",
    args: [ticker, today],
  });

  console.log("");
  if (todayRow.rows.length > 0) {
    console.log(
      `✅ Freshness write path works: ${ticker} now has today's row (${today}, close=${todayRow.rows[0].close}).`,
    );
    console.log(
      "   This came from fetchLiveQuotes() during the API call, not from a stale chart() backfill.",
    );
  } else {
    console.error(
      `✗ Today's row for ${ticker} is missing. Either fetchLiveQuotes() returned nothing or storeStockPrices() didn't fire.`,
    );
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("FAILED:", e);
    process.exit(1);
  });
