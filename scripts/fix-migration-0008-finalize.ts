/**
 * Cleanup follow-up to migration 0008.
 *
 * `ALTER TABLE watchlist_scores RENAME TO ticker_metrics` doesn't rename the
 * indexes from the original CREATE TABLE migration (0007). One of those
 * indexes referenced the `market` column, which blocked DROP COLUMN. We
 * drop the dangling indexes first, then re-attempt the column drop.
 */
import { createClient } from "@libsql/client";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config();

const db = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

async function run() {
  // Find any indexes still referencing the renamed table.
  const idx = await db.execute(
    "SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'ticker_metrics'",
  );
  console.log(`Indexes on ticker_metrics:`);
  for (const r of idx.rows) console.log(`  ${r.name}`);

  const candidates = idx.rows
    .map((r) => String(r.name))
    .filter((n) => n.startsWith("idx_watchlist_scores_") || n.includes("market"));

  for (const name of candidates) {
    process.stdout.write(`Dropping index ${name}... `);
    try {
      await db.execute(`DROP INDEX IF EXISTS ${name}`);
      console.log("OK");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log(`ERR: ${msg}`);
    }
  }

  process.stdout.write(`Dropping ticker_metrics.market... `);
  try {
    await db.execute("ALTER TABLE ticker_metrics DROP COLUMN market");
    console.log("OK");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.log(`ERR: ${msg}`);
  }

  const cols = await db.execute("PRAGMA table_info(ticker_metrics)");
  console.log(
    `ticker_metrics columns: ${cols.rows.map((r: { name: unknown }) => r.name).join(", ")}`,
  );
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
