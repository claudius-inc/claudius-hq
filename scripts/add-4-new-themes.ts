import { createClient } from "@libsql/client";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const db = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

const newThemes = [
  {
    name: "Robotaxi & Autonomous Mobility",
    description: "Self-driving taxi fleets, ADAS, LiDAR, and autonomous logistics.",
    tags: ["autonomous", "robotaxi", "mobility", "adtech", "ev"],
    tickers: [
      "TSLA", "GOOGL", "UBER", "LYFT", "BIDU", "LAZR", "MBLY", "AEVA", "MVIS",
      "QCOM", "NVDA", "ZOOX", "AMZN", "GOOG",
    ],
  },
  {
    name: "eVTOL & Advanced Air Mobility",
    description: "Electric vertical take-off and landing aircraft, urban air taxis, and aerial logistics.",
    tags: ["evtol", "aam", "urban-mobility", "aerospace", "batteries"],
    tickers: [
      "JOBY", "ACHR", "LILM", "EH", "EVTL", "HLN", "BA", "AIR.PA", "GE",
      "SAF.PA", "AMBP", "ALB", "QS",
    ],
  },
  {
    name: "Small Modular Reactors (SMR)",
    description: "Next-generation compact nuclear reactors for data centers, remote grids, and industrial power.",
    tags: ["smr", "nuclear", "clean-energy", "data-center", "uranium"],
    tickers: [
      "SMR", "NNE", "BWXT", "CEG", "OKLO", "CCJ", "UUUU", "DNN", "URA",
      "URNM", "LEU", "GE", "SIEGY", "RR.L", "BWC",
    ],
  },
  {
    name: "Edge AI & On-Device Compute",
    description: "AI processing at the edge: NPUs, tinyML, smart sensors, and local inference chips.",
    tags: ["edge-ai", "npu", "iot", "tinyml", "semiconductor"],
    tickers: [
      "QCOM", "AAPL", "NVDA", "ARM", "MRVL", "AVGO", "AMBA", "SOUN", "SGH",
      "INTC", "AMD", "AI", "PLTR",
    ],
  },
];

async function main() {
  for (const theme of newThemes) {
    // Check if theme already exists
    const existing = await db.execute({
      sql: "SELECT id FROM themes WHERE name = ?",
      args: [theme.name],
    });
    if (existing.rows.length > 0) {
      console.log(`Theme "${theme.name}" already exists (id=${existing.rows[0].id}), skipping.`);
      continue;
    }

    // Insert theme
    const result = await db.execute({
      sql: "INSERT INTO themes (name, description, tags) VALUES (?, ?, ?)",
      args: [theme.name, theme.description, JSON.stringify(theme.tags)],
    });
    const themeId = Number(result.lastInsertRowid);
    console.log(`Created theme "${theme.name}" (id=${themeId})`);

    // Insert theme stocks
    for (const ticker of theme.tickers) {
      await db.execute({
        sql: "INSERT OR IGNORE INTO theme_stocks (theme_id, ticker) VALUES (?, ?)",
        args: [themeId, ticker],
      });

      // Merge tags into stock_tags
      const existingTags = await db.execute({
        sql: "SELECT tags FROM stock_tags WHERE ticker = ?",
        args: [ticker],
      });
      let tags: string[] = [];
      if (existingTags.rows.length > 0) {
        try {
          tags = JSON.parse(existingTags.rows[0].tags as string) || [];
        } catch {
          tags = [];
        }
      }
      const merged = Array.from(new Set([...tags, ...theme.tags]));
      await db.execute({
        sql: "INSERT OR REPLACE INTO stock_tags (ticker, tags) VALUES (?, ?)",
        args: [ticker, JSON.stringify(merged)],
      });
    }
    console.log(`  → ${theme.tickers.length} tickers added`);
  }
  console.log("\nDone!");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
