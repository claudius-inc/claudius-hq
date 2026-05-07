/**
 * Apply drizzle/0010_add_scanner_universe_currency.sql.
 *
 * Run with:
 *   npx tsx scripts/apply-migration-0010.ts
 *
 * Adds `currency` to scanner_universe. ALTER TABLE ADD COLUMN is *not*
 * idempotent — re-running will throw "duplicate column". We log + continue
 * so the script is safely re-runnable. Mirrors apply-migration-0009.ts so
 * the project's existing migration pattern is preserved.
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
    "drizzle/0010_add_scanner_universe_currency.sql",
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
