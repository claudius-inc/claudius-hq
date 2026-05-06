/**
 * Apply drizzle/0009_add_ticker_profile_fields.sql.
 *
 * Run with:
 *   npx tsx scripts/apply-migration-0009.ts
 *
 * Adds 9 columns to scanner_universe. ALTER TABLE ADD COLUMN is *not*
 * idempotent — re-running will throw "duplicate column" on each statement.
 * That's fine; we log + continue so you can re-run safely.
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
    "drizzle/0009_add_ticker_profile_fields.sql",
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
      // Tolerate "duplicate column" so the script is re-runnable.
      if (msg.toLowerCase().includes("duplicate column")) {
        console.log("SKIP (already exists)");
      } else {
        console.log(`ERR: ${msg}`);
      }
    }
  }

  const cols = await client.execute("PRAGMA table_info(scanner_universe)");
  const names = cols.rows.map((r) => r.name as string);
  console.log("\nscanner_universe columns:", names.join(", "));
  process.exit(0);
}

run().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
