/**
 * Apply drizzle/0008_normalize_tags_and_rename_metrics.sql.
 *
 * Run with:
 *   npx tsx scripts/apply-migration-0008.ts
 *
 * Idempotent where possible (CREATE IF NOT EXISTS, INSERT OR IGNORE). The
 * RENAME TABLE and DROP COLUMN statements are NOT idempotent — re-running on
 * an already-migrated DB will throw on those lines, which is fine; you'll
 * see "no such column" / "no such table" and can stop.
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
    "drizzle/0008_normalize_tags_and_rename_metrics.sql",
    "utf8",
  );
  // Strip line comments, then split on a semicolon at end-of-line.
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

  // Sanity: print table list.
  const tables = await client.execute(
    "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
  );
  console.log(`\nTables (${tables.rows.length}):`);
  for (const r of tables.rows) console.log(`  ${r.name}`);

  // Sanity: column lists for the affected tables.
  for (const t of ["ticker_metrics", "tags", "ticker_tags", "theme_tags", "themes"]) {
    const cols = await client.execute(`PRAGMA table_info(${t})`);
    console.log(
      `${t}: ${cols.rows.map((r: { name: unknown }) => r.name).join(", ")}`,
    );
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
