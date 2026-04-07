/**
 * Run the stock_prices_daily migration directly against Turso.
 *
 * Usage: npx tsx scripts/run-stock-prices-migration.ts
 *
 * Idempotent (CREATE TABLE / INDEX IF NOT EXISTS).
 */
import { createClient } from "@libsql/client";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

const client = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

const statements = [
  `CREATE TABLE IF NOT EXISTS stock_prices_daily (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticker TEXT NOT NULL,
    date TEXT NOT NULL,
    close REAL NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_stock_prices_daily_ticker_date
    ON stock_prices_daily(ticker, date)`,
  `CREATE INDEX IF NOT EXISTS idx_stock_prices_daily_ticker_date_desc
    ON stock_prices_daily(ticker, date DESC)`,
];

async function run() {
  console.log("Running stock_prices_daily migration...\n");
  for (const sql of statements) {
    const firstLine = sql.trim().split("\n")[0].slice(0, 70);
    console.log(`  → ${firstLine}…`);
    await client.execute(sql);
  }
  console.log("\n✓ All statements executed.\n");

  const tables = await client.execute(
    "SELECT name FROM sqlite_master WHERE type='table' AND name = 'stock_prices_daily'",
  );
  if (tables.rows.length === 0) {
    throw new Error("Table did not appear after CREATE — something is wrong");
  }
  console.log("✅ Verified stock_prices_daily exists.");
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Migration failed:", err);
    process.exit(1);
  });
