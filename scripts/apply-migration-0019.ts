/**
 * Apply drizzle/0019_add_scan_freshness_and_reported.sql.
 *
 * Run with:
 *   npx tsx scripts/apply-migration-0019.ts
 *
 * Adds ticker_metrics.last_good_scan_at and momentum_report_picks.reported.
 *
 * Safely re-runnable: "duplicate column" errors are logged and ignored,
 * anything else is surfaced. Mirrors apply-migration-0018.ts.
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
  const raw = fs.readFileSync("drizzle/0019_add_scan_freshness_and_reported.sql", "utf8");
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
      if (msg.toLowerCase().includes("duplicate column")) {
        console.log("SKIP (already exists)");
      } else {
        console.log(`ERR: ${msg}`);
      }
    }
  }

  const cols = await client.execute("PRAGMA table_info(ticker_metrics)");
  const picks = await client.execute("PRAGMA table_info(momentum_report_picks)");
  const hasScan = cols.rows.some((r) => r.name === "last_good_scan_at");
  const hasReported = picks.rows.some((r) => r.name === "reported");

  if (hasScan && hasReported) {
    console.log("\nBoth columns present.");
  } else {
    console.log(`\nWARNING: last_good_scan_at=${hasScan} reported=${hasReported}`);
  }
  process.exit(0);
}

run().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
