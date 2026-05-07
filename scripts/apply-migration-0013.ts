/**
 * Apply drizzle/0013_drop_scanner_universe_sector.sql.
 *
 * Run with:
 *   npx tsx scripts/apply-migration-0013.ts
 *
 * Drops the `sector` column from `scanner_universe`. Mirrors
 * apply-migration-0011.ts so the project's existing migration pattern is
 * preserved.
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
  // Pre-flight: report how many rows had a non-null sector so the operator
  // sees how much data is about to disappear.
  try {
    const before = await client.execute(
      "SELECT COUNT(*) AS n FROM scanner_universe WHERE sector IS NOT NULL",
    );
    const n = before.rows[0]?.n;
    console.log(`scanner_universe rows with sector IS NOT NULL: ${n}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`Could not count sector rows (column may already be dropped): ${msg}`);
  }

  const raw = fs.readFileSync(
    "drizzle/0013_drop_scanner_universe_sector.sql",
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
      console.log(`ERR: ${msg}`);
    }
  }

  // Verify the column is gone.
  const cols = await client.execute("PRAGMA table_info(scanner_universe)");
  const stillHasSector = cols.rows.some((r) => (r.name as string) === "sector");
  if (!stillHasSector) {
    console.log("\nscanner_universe.sector dropped successfully.");
  } else {
    console.log("\nWARNING: scanner_universe.sector still exists.");
  }
  process.exit(0);
}

run().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
