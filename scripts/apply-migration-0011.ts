/**
 * Apply drizzle/0011_drop_stock_scans.sql.
 *
 * Run with:
 *   npx tsx scripts/apply-migration-0011.ts
 *
 * Drops the `stock_scans` table. `DROP TABLE IF EXISTS` is idempotent — safe
 * to re-run. Mirrors apply-migration-0010.ts so the project's existing
 * migration pattern is preserved.
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
  // Pre-flight: log how many rows we're about to drop, so the operator has a
  // record before the data is gone.
  try {
    const before = await client.execute(
      "SELECT COUNT(*) AS n FROM stock_scans",
    );
    const n = before.rows[0]?.n;
    console.log(`stock_scans row count before drop: ${n}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`Could not count stock_scans (likely already dropped): ${msg}`);
  }

  const raw = fs.readFileSync("drizzle/0011_drop_stock_scans.sql", "utf8");
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
      console.log(`ERR: ${msg}`);
    }
  }

  // Verify the table is gone.
  const tables = await client.execute(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='stock_scans'",
  );
  if (tables.rows.length === 0) {
    console.log("\nstock_scans dropped successfully.");
  } else {
    console.log("\nWARNING: stock_scans still exists.");
  }
  process.exit(0);
}

run().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
