/**
 * Apply drizzle/0014_add_ticker_metrics_fundamentals.sql.
 *
 * Run with:
 *   npx tsx scripts/apply-migration-0014.ts
 *
 * Adds market_cap, trailing_pe, forward_pe, debt_to_equity columns to
 * ticker_metrics. Each ALTER ADD COLUMN is independently re-runnable except
 * for "duplicate column" errors which are logged + ignored, so the script is
 * safely re-runnable. Mirrors apply-migration-0010.ts.
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
  const raw = fs.readFileSync(
    "drizzle/0014_add_ticker_metrics_fundamentals.sql",
    "utf8",
  );
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
      // duplicate column on re-run is fine; surface anything else.
      if (msg.toLowerCase().includes("duplicate column")) {
        console.log("SKIP (already exists)");
      } else {
        console.log(`ERR: ${msg}`);
      }
    }
  }

  // Verify all four columns now exist.
  const cols = await client.execute("PRAGMA table_info(ticker_metrics)");
  const colNames = new Set(cols.rows.map((r) => r.name as string));
  const expected = ["market_cap", "trailing_pe", "forward_pe", "debt_to_equity"];
  const missing = expected.filter((c) => !colNames.has(c));
  if (missing.length === 0) {
    console.log("\nAll four columns present on ticker_metrics.");
  } else {
    console.log(`\nWARNING: missing columns: ${missing.join(", ")}`);
  }
  process.exit(0);
}

run().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
