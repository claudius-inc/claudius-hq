import { createClient } from "@libsql/client";
import { config } from "dotenv";

config({ path: ".env.local" });

const client = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

async function main() {
  console.log("Creating gold_analysis table...");
  await client.execute(`
    CREATE TABLE IF NOT EXISTS gold_analysis (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      current_price REAL,
      ath REAL,
      ath_date TEXT,
      key_levels TEXT,
      scenarios TEXT,
      thesis_notes TEXT,
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);
  
  console.log("Creating gold_flows table...");
  await client.execute(`
    CREATE TABLE IF NOT EXISTS gold_flows (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      gld_shares_outstanding REAL,
      gld_nav REAL,
      estimated_flow_usd REAL,
      global_etf_flow_usd REAL,
      central_bank_tonnes REAL,
      source TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  console.log("Tables created successfully!");

  // Seed initial analysis with Mr Z's key levels
  console.log("Seeding initial data...");
  
  const keyLevels = [
    { level: 5600, significance: "ATH (Jan 29)" },
    { level: 5000, significance: "Psychological round number" },
    { level: 4575, significance: "50-day EMA zone (4550-4600)" },
    { level: 3900, significance: "200-day EMA, bear invalidation" },
  ];

  const scenarios = [
    { 
      name: "Bull Case: New ATH", 
      probability: 50, 
      priceRange: "$5,600-6,000",
      description: "Continued central bank buying, ETF inflows, and inflation hedge demand push gold to new highs"
    },
    { 
      name: "Base Case: Consolidation", 
      probability: 35, 
      priceRange: "$5,000-5,400",
      description: "Range-bound trading as markets digest Fed policy and geopolitical risks"
    },
    { 
      name: "Bear Case: Correction", 
      probability: 15, 
      priceRange: "$4,200-4,600",
      description: "Strong dollar, risk-on sentiment, or reduced central bank buying triggers pullback to 200-day EMA"
    },
  ];

  await client.execute({
    sql: `INSERT INTO gold_analysis (ath, ath_date, key_levels, scenarios, thesis_notes, updated_at)
          VALUES (?, ?, ?, ?, ?, datetime('now'))`,
    args: [
      5600,
      "Jan 29, 2025",
      JSON.stringify(keyLevels),
      JSON.stringify(scenarios),
      `## Gold Investment Thesis

### Key Drivers
- **Central Bank Buying**: Record purchases continuing, especially from China, India, and emerging markets
- **ETF Flows**: Watching GLD/IAU for retail sentiment
- **Real Rates**: Gold inversely correlated with real yields
- **Dollar Strength**: DXY weakness supports gold

### Watch List
- Fed policy trajectory and rate cut timing
- Geopolitical tensions (Middle East, Ukraine, Taiwan)
- China economic data and PBOC gold reserves
- US fiscal situation and debt ceiling

### Strategy
Accumulate on pullbacks to key support levels. 50-day EMA zone is first buy zone.
200-day EMA represents strong support and potential max position entry.`,
    ],
  });

  console.log("Initial data seeded!");
  console.log("Done!");
}

main().catch(console.error);
