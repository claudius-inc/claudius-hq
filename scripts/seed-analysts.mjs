import { createClient } from "@libsql/client";
import { config } from "dotenv";

config({ path: ".env.local" });

const client = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

async function main() {
  // Create tables
  await client.execute(`
    CREATE TABLE IF NOT EXISTS analysts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      firm TEXT NOT NULL,
      specialty TEXT,
      success_rate REAL,
      avg_return REAL,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS analyst_calls (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      analyst_id INTEGER REFERENCES analysts(id),
      ticker TEXT NOT NULL,
      action TEXT NOT NULL,
      price_target REAL,
      price_at_call REAL,
      current_price REAL,
      call_date TEXT NOT NULL,
      notes TEXT,
      outcome TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  console.log("Tables created");

  // Seed analysts
  const analysts = [
    {
      name: "Mark Lipacis",
      firm: "Jefferies",
      specialty: "Semiconductors",
      successRate: 0.85,
      notes: "#1 ranked analyst over 10 years",
    },
    {
      name: "Gerard Cassidy",
      firm: "RBC Capital",
      specialty: "Financials",
      successRate: 0.88,
      notes: "88% success rate in financials",
    },
    {
      name: "Needham Team",
      firm: "Needham",
      specialty: "Small/Mid-cap Tech",
      successRate: null,
      notes: "Strong in small/mid-cap tech sector",
    },
    {
      name: "Ruben Roy",
      firm: "Stifel Nicolaus",
      specialty: "Tech",
      successRate: 0.82,
      notes: "Consistently high accuracy in tech",
    },
    {
      name: "Richard Shannon",
      firm: "Craig-Hallum",
      specialty: "Semiconductors",
      successRate: 0.80,
      notes: "Semiconductor/tech specialist",
    },
  ];

  for (const analyst of analysts) {
    // Check if already exists
    const existing = await client.execute({
      sql: "SELECT id FROM analysts WHERE name = ? AND firm = ?",
      args: [analyst.name, analyst.firm],
    });

    if (existing.rows.length === 0) {
      await client.execute({
        sql: `INSERT INTO analysts (name, firm, specialty, success_rate, notes) VALUES (?, ?, ?, ?, ?)`,
        args: [analyst.name, analyst.firm, analyst.specialty, analyst.successRate, analyst.notes],
      });
      console.log(`Added: ${analyst.name} (${analyst.firm})`);
    } else {
      console.log(`Exists: ${analyst.name} (${analyst.firm})`);
    }
  }

  console.log("Done!");
}

main().catch(console.error);
