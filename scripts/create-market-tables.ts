import { createClient } from "@libsql/client";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

async function createTables() {
  const client = createClient({
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN,
  });

  console.log("Creating market indicator tables...");

  // Congress trades
  await client.execute(`
    CREATE TABLE IF NOT EXISTS congress_trades (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      member_name TEXT NOT NULL,
      party TEXT,
      state TEXT,
      chamber TEXT,
      ticker TEXT NOT NULL,
      transaction_type TEXT NOT NULL,
      amount_range TEXT,
      transaction_date TEXT NOT NULL,
      filed_date TEXT,
      source_id TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);
  console.log("✓ congress_trades");

  // Insider trades
  await client.execute(`
    CREATE TABLE IF NOT EXISTS insider_trades (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company TEXT NOT NULL,
      ticker TEXT NOT NULL,
      insider_name TEXT NOT NULL,
      title TEXT,
      transaction_type TEXT NOT NULL,
      shares REAL,
      price REAL,
      value REAL,
      transaction_date TEXT NOT NULL,
      filed_date TEXT,
      source_id TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);
  console.log("✓ insider_trades");

  // Dark pool data
  await client.execute(`
    CREATE TABLE IF NOT EXISTS darkpool_data (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      week_ending TEXT NOT NULL,
      ticker TEXT,
      ats_volume REAL NOT NULL,
      total_volume REAL,
      ats_percent REAL,
      issue_type TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);
  console.log("✓ darkpool_data");

  console.log("\nAll tables created successfully!");
  process.exit(0);
}

createTables().catch(console.error);
