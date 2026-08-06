/**
 * Apply drizzle/0018_add_screen_pick_logging.sql.
 *
 * Run with:
 *   npx tsx scripts/apply-migration-0018.ts
 *
 * Creates momentum_report_picks, crypto_screen_picks, crypto_prices_daily and
 * crypto_screen_runs, and adds ticker_metrics.avg_dollar_vol_20d.
 *
 * Safely re-runnable: "already exists" / "duplicate column" errors are logged
 * and ignored, anything else is surfaced. Mirrors apply-migration-0014.ts.
 */
import { createClient } from "@libsql/client";
import * as dotenv from "dotenv";
import * as fs from "fs";

dotenv.config({ path: ".env.local" });
dotenv.config();

const client = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

async function run() {
  const raw = fs.readFileSync("drizzle/0018_add_screen_pick_logging.sql", "utf8");
  const cleaned = raw
    .split("\n")
    .filter((l) => !l.trim().startsWith("--"))
    .join("\n");
  const statements = cleaned
    .split(/;\s*$/m)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  for (const stmt of statements) {
    process.stdout.write(`Running: ${stmt.split("\n")[0].slice(0, 80)}... `);
    try {
      await client.execute(stmt);
      console.log("OK");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const lower = msg.toLowerCase();
      if (lower.includes("already exists") || lower.includes("duplicate column")) {
        console.log("SKIP (already exists)");
      } else {
        console.log(`ERR: ${msg}`);
      }
    }
  }

  const expectedTables = [
    "momentum_report_picks",
    "crypto_screen_picks",
    "crypto_prices_daily",
    "crypto_screen_runs",
  ];
  const tables = await client.execute(
    "SELECT name FROM sqlite_master WHERE type='table'",
  );
  const names = new Set(tables.rows.map((r) => r.name as string));
  const missingTables = expectedTables.filter((t) => !names.has(t));

  const cols = await client.execute("PRAGMA table_info(ticker_metrics)");
  const colNames = new Set(cols.rows.map((r) => r.name as string));
  const hasCol = colNames.has("avg_dollar_vol_20d");

  if (missingTables.length === 0 && hasCol) {
    console.log("\nAll four tables and avg_dollar_vol_20d present.");
  } else {
    if (missingTables.length) console.log(`\nWARNING: missing tables: ${missingTables.join(", ")}`);
    if (!hasCol) console.log("WARNING: ticker_metrics.avg_dollar_vol_20d missing");
  }
  process.exit(0);
}

run().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
