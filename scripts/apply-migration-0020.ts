/**
 * Apply drizzle/0020_add_pick_labels_and_quarantine.sql.
 *
 * Run with:
 *   npx tsx scripts/apply-migration-0020.ts
 *
 * Creates pick_labels and ticker_quarantine. Safely re-runnable: "already
 * exists" errors are logged and ignored. Mirrors apply-migration-0018.ts.
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
  const raw = fs.readFileSync("drizzle/0020_add_pick_labels_and_quarantine.sql", "utf8");
  const statements = raw
    .split("\n")
    .filter((l) => !l.trim().startsWith("--"))
    .join("\n")
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
      if (msg.toLowerCase().includes("already exists")) console.log("SKIP (already exists)");
      else console.log(`ERR: ${msg}`);
    }
  }

  const tables = await client.execute("SELECT name FROM sqlite_master WHERE type='table'");
  const names = new Set(tables.rows.map((r) => r.name as string));
  const missing = ["pick_labels", "ticker_quarantine"].filter((t) => !names.has(t));
  console.log(missing.length === 0 ? "\nBoth tables present." : `\nWARNING: missing ${missing.join(", ")}`);
  process.exit(0);
}

run().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
