#!/usr/bin/env node
const { createClient } = require("@libsql/client");
const db = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

async function main() {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS tag_performance (
      tag TEXT NOT NULL,
      period TEXT NOT NULL,
      avg_return REAL NOT NULL,
      median_return REAL NOT NULL,
      stock_count INTEGER NOT NULL,
      top_stock TEXT,
      top_stock_return REAL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (tag, period)
    )
  `);
  console.log("tag_performance table created");
}
main().catch(e => console.error(e));
