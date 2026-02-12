/**
 * Seed script for investment themes
 * Run with: npx tsx scripts/seed-themes.ts
 */

import { createClient } from "@libsql/client";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const db = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

const THEMES = [
  {
    name: "Nuclear",
    description: "Nuclear energy companies including uranium miners, reactor manufacturers, and nuclear technology",
    stocks: ["CCJ", "URA", "SMR", "OKLO", "NNE", "LEU"],
  },
  {
    name: "AI Infrastructure",
    description: "Companies building the infrastructure for AI: chips, semiconductors, and data centers",
    stocks: ["NVDA", "AMD", "AVGO", "MRVL", "TSM", "SMCI"],
  },
  {
    name: "China Tech",
    description: "Major Chinese technology companies listed on US exchanges",
    stocks: ["BABA", "JD", "PDD", "BIDU", "BILI", "TCEHY"],
  },
  {
    name: "Defense",
    description: "US defense contractors and aerospace companies",
    stocks: ["LMT", "RTX", "NOC", "GD", "LHX"],
  },
  {
    name: "Solar",
    description: "Solar energy companies including panel manufacturers and installers",
    stocks: ["ENPH", "FSLR", "SEDG", "RUN", "JKS"],
  },
  {
    name: "Uranium",
    description: "Uranium mining and exploration companies",
    stocks: ["UEC", "DNN", "URG", "CCJ", "NXE"],
  },
  {
    name: "Reshoring/Industrial",
    description: "Industrial companies benefiting from US manufacturing reshoring",
    stocks: ["CAT", "DE", "EMR", "ETN", "ROK"],
  },
  {
    name: "Nuclear Utilities",
    description: "Utility companies with significant nuclear power generation",
    stocks: ["VST", "CEG", "NRG", "PEG"],
  },
];

async function seed() {
  console.log("🌱 Seeding themes...\n");

  // Create tables if they don't exist
  await db.executeMultiple(`
    CREATE TABLE IF NOT EXISTS themes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      description TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS theme_stocks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      theme_id INTEGER NOT NULL REFERENCES themes(id) ON DELETE CASCADE,
      ticker TEXT NOT NULL,
      added_at TEXT DEFAULT (datetime('now')),
      UNIQUE(theme_id, ticker)
    );
  `);

  for (const theme of THEMES) {
    try {
      // Insert theme
      const result = await db.execute({
        sql: "INSERT OR IGNORE INTO themes (name, description) VALUES (?, ?)",
        args: [theme.name, theme.description],
      });

      let themeId: number;
      
      if (result.rowsAffected > 0) {
        themeId = Number(result.lastInsertRowid);
        console.log(`✅ Created theme: ${theme.name} (id: ${themeId})`);
      } else {
        // Theme already exists, get its ID
        const existing = await db.execute({
          sql: "SELECT id FROM themes WHERE name = ?",
          args: [theme.name],
        });
        themeId = (existing.rows[0] as unknown as { id: number }).id;
        console.log(`⏭️  Theme exists: ${theme.name} (id: ${themeId})`);
      }

      // Insert stocks
      for (const ticker of theme.stocks) {
        try {
          await db.execute({
            sql: "INSERT OR IGNORE INTO theme_stocks (theme_id, ticker) VALUES (?, ?)",
            args: [themeId, ticker],
          });
        } catch {
          // Ignore duplicate errors
        }
      }
      console.log(`   📈 Stocks: ${theme.stocks.join(", ")}`);
    } catch (e) {
      console.error(`❌ Failed to seed theme ${theme.name}:`, e);
    }
  }

  console.log("\n✨ Done!");
}

seed().catch(console.error);
