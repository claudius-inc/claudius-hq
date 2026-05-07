/**
 * Apply drizzle/0012_add_momentum_snapshots.sql.
 *
 * Run with:
 *   npx tsx scripts/apply-migration-0012.ts
 *
 * Creates the `momentum_snapshots` table. `CREATE TABLE IF NOT EXISTS` is
 * idempotent — safe to re-run. Mirrors apply-migration-0011.ts so the
 * project's existing migration pattern is preserved.
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
  const raw = fs.readFileSync("drizzle/0012_add_momentum_snapshots.sql", "utf8");
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

  // Verify the table exists.
  const tables = await client.execute(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='momentum_snapshots'",
  );
  if (tables.rows.length > 0) {
    console.log("\nmomentum_snapshots table created successfully.");
  } else {
    console.log("\nWARNING: momentum_snapshots table was not created.");
  }
  process.exit(0);
}

run().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
