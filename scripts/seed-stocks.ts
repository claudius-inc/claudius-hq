// Run with: npx tsx scripts/seed-stocks.ts
import { createClient } from "@libsql/client";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

const db = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

async function seed() {
  // Ensure tables exist
  await db.executeMultiple(`
    CREATE TABLE IF NOT EXISTS watchlist_stocks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticker TEXT NOT NULL UNIQUE,
      exchange TEXT NOT NULL,
      name TEXT NOT NULL,
      category TEXT DEFAULT 'watchlist',
      notes TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  const stocks = [
    { ticker: "9988", exchange: "HKEX", name: "Alibaba Group", category: "holding" },
    { ticker: "1024", exchange: "HKEX", name: "Kuaishou Technology", category: "holding" },
    { ticker: "1211", exchange: "HKEX", name: "BYD Company", category: "holding" },
    { ticker: "9626", exchange: "HKEX", name: "Bilibili Inc", category: "holding" },
  ];

  for (const s of stocks) {
    await db.execute({
      sql: "INSERT OR IGNORE INTO watchlist_stocks (ticker, exchange, name, category) VALUES (?, ?, ?, ?)",
      args: [s.ticker, s.exchange, s.name, s.category],
    });
    console.log(`  ✓ ${s.ticker} - ${s.name}`);
  }

  console.log("Done! Seeded watchlist stocks.");
}

seed().catch(console.error);
