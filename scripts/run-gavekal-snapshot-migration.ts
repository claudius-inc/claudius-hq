/**
 * Run the gavekal_historical_snapshot migration directly against Turso.
 *
 * Usage: npx tsx scripts/run-gavekal-snapshot-migration.ts
 *
 * Idempotent (CREATE TABLE IF NOT EXISTS).
 */
import { createClient } from "@libsql/client";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

const client = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

const migration = `
CREATE TABLE IF NOT EXISTS gavekal_historical_snapshot (
  date           TEXT PRIMARY KEY,
  energy_ratio   REAL NOT NULL,
  currency_ratio REAL NOT NULL,
  energy_ma      REAL,
  currency_ma    REAL,
  regime         TEXT NOT NULL,
  created_at     TEXT DEFAULT (datetime('now'))
)
`.trim();

async function run() {
  console.log("Running gavekal_historical_snapshot migration...\n");
  await client.execute(migration);
  console.log("  ✓ Table created (or already exists)\n");

  const tables = await client.execute(
    "SELECT name FROM sqlite_master WHERE type='table' AND name = 'gavekal_historical_snapshot'",
  );
  if (tables.rows.length === 0) {
    throw new Error("Table did not appear after CREATE — something is wrong");
  }
  console.log("✅ Verified gavekal_historical_snapshot exists.");
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Migration failed:", err);
    process.exit(1);
  });
