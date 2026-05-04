import { createClient } from "@libsql/client";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const db = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

interface ThemeSpec {
  name: string;
  description: string;
  stocks: string[];
  tags: string[];
}

const THEMES_TO_ADD: ThemeSpec[] = [
  {
    name: "Insurance & Reinsurance",
    description:
      "Global insurance and reinsurance carriers — US life/P&C, European reinsurance, Japan/Korea life carriers, and Asian giants AIA / Ping An / China Life. Beneficiaries of higher rates on float income and disciplined underwriting cycles.",
    stocks: [
      "BRK-B", "CB", "AIG", "MET", "PRU", "AFL", "TRV", "PGR",
      "ALV.DE", "MUV2.DE", "HNR1.DE", "AXAHY", "ZURVY",
      "8766.T", "8725.T", "8630.T",
      "1299.HK", "2628.HK", "2318.HK", "2601.HK",
      "032830.KS", "088350.KS",
      "G07.SI",
    ],
    tags: ["insurance", "reinsurance", "financials", "dividend", "value"],
  },
  {
    name: "Genomics, Gene & Cell Therapy",
    description:
      "Gene editing platforms (CRISPR/base/prime), cell therapies, regenerative medicine, and CDMOs enabling them. Long-duration platform bets — high R&D, binary clinical readouts.",
    stocks: [
      "CRSP", "NTLA", "BEAM", "EDIT", "BLUE", "FATE", "SGMO", "VRTX",
      "GMAB", "QGEN",
      "4592.T", "4587.T", "4565.T",
      "1672.HK", "2616.HK", "2257.HK",
      "207940.KS",
    ],
    tags: ["biotech", "genomics", "gene-therapy", "healthcare", "platform"],
  },
  {
    name: "Travel, Leisure & Hospitality",
    description:
      "Online travel, hotels, cruise lines, airlines, theme parks, and Macau casinos. Reopening + secular Asian outbound travel + post-COVID structural shifts to experiences.",
    stocks: [
      "BKNG", "EXPE", "ABNB", "MAR", "HLT", "H", "RCL", "CCL", "NCLH", "MGM",
      "IHG.L",
      "4661.T", "9202.T", "9201.T", "9783.T",
      "0293.HK", "0670.HK", "0753.HK", "1179.HK", "0045.HK",
      "0027.HK", "1928.HK", "1128.HK", "2282.HK", "6883.HK",
      "003490.KS", "008770.KS",
      "G13.SI",
    ],
    tags: ["travel", "leisure", "hospitality", "consumer", "reopening"],
  },
  {
    name: "Japan Sogo Shosha",
    description:
      "The five Japanese trading houses — Mitsubishi, Mitsui, Itochu, Sumitomo, Marubeni. Buffett's signature Japan bet (~9% of Berkshire). Diversified commodity + industrial cash machines trading at single-digit P/Es with rising shareholder returns.",
    stocks: ["8058.T", "8031.T", "8001.T", "8053.T", "8002.T"],
    tags: ["japan", "trading-house", "value", "buffett", "commodity"],
  },
  {
    name: "Japan Pharma",
    description:
      "Japanese big-pharma — Takeda, Daiichi Sankyo (ADC leader, Enhertu), Astellas, Otsuka, Chugai (Roche subsidiary). Aging-demographic tailwind + globalizing pipelines.",
    stocks: ["4502.T", "4568.T", "4503.T", "4578.T", "4519.T"],
    tags: ["japan", "pharma", "healthcare", "biotech", "dividend"],
  },
];

async function main() {
  for (const theme of THEMES_TO_ADD) {
    // Check if theme already exists
    const existing = await db.execute({
      sql: "SELECT id FROM themes WHERE name = ?",
      args: [theme.name],
    });

    if (existing.rows.length > 0) {
      console.log(`Theme "${theme.name}" already exists (id=${existing.rows[0].id}), skipping...`);
      continue;
    }

    // Insert theme
    const result = await db.execute({
      sql: "INSERT INTO themes (name, description, tags) VALUES (?, ?, ?)",
      args: [theme.name, theme.description, JSON.stringify(theme.tags)],
    });
    const themeId = Number(result.lastInsertRowid);
    console.log(`Created theme "${theme.name}" (id=${themeId})`);

    // Insert stocks
    for (const ticker of theme.stocks) {
      await db.execute({
        sql: "INSERT OR IGNORE INTO theme_stocks (theme_id, ticker) VALUES (?, ?)",
        args: [themeId, ticker],
      });
    }
    console.log(`  Added ${theme.stocks.length} stocks`);

    // Upsert stock_tags for each ticker
    for (const ticker of theme.stocks) {
      const existingTag = await db.execute({
        sql: "SELECT tags FROM stock_tags WHERE ticker = ?",
        args: [ticker],
      });

      let currentTags: string[] = [];
      if (existingTag.rows.length > 0) {
        try {
          currentTags = JSON.parse(existingTag.rows[0].tags as string);
        } catch {
          currentTags = [];
        }
      }

      // Merge tags, deduplicate
      const mergedTags = Array.from(new Set([...currentTags, ...theme.tags]));
      await db.execute({
        sql: "INSERT OR REPLACE INTO stock_tags (ticker, tags) VALUES (?, ?)",
        args: [ticker, JSON.stringify(mergedTags)],
      });
    }
    console.log(`  Updated stock_tags for ${theme.stocks.length} tickers`);
  }

  console.log("\nDone!");
}

main().catch(console.error);
