/**
 * Adds 7 new themes with broad Asia coverage + tag updates for existing tickers.
 * Idempotent: skips themes that already exist by name; theme_stocks INSERT OR IGNORE
 * relies on a (theme_id, ticker) check; stock_tags upserts via INSERT OR REPLACE.
 *
 * Run with: npx tsx scripts/seed-themes-2026-05.ts
 */

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
}

const NEW_THEMES: ThemeSpec[] = [
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
  },
  {
    name: "EV Charging Infrastructure",
    description:
      "Pure-play EV charging networks and equipment makers. Capex-heavy buildout, regulatory tailwinds (NEVI, EU AFIR), but unit economics still proving out. Asian exposure mostly via power-conversion equipment makers since charging itself is largely state-grid in China.",
    stocks: [
      "CHPT", "EVGO", "BLNK", "WBX", "ALLG",
      "300693.SZ", "002518.SZ", "002851.SZ",
    ],
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
  },
  {
    name: "Brazil & LATAM",
    description:
      "Latin American champions across Brazil (Petrobras, Itaú, Ambev, Embraer), Mexico (América Móvil, FEMSA, Grupo México), Chile (SQM, Antofagasta), Argentina (Globant, YPF), and the Andes. Currency-sensitive, commodity-linked, demographically favorable.",
    stocks: [
      "PBR", "ITUB", "BBD", "ABEV", "GGB", "ERJ", "VIV",
      "AMX", "KOF", "WMMVY", "GMBXF", "GBOOY",
      "SQM", "ANTO.L", "BSAC",
      "GLOB", "YPF", "BMA",
      "EC", "CIB",
    ],
  },
  {
    name: "Japan Sogo Shosha",
    description:
      "The five Japanese trading houses — Mitsubishi, Mitsui, Itochu, Sumitomo, Marubeni. Buffett's signature Japan bet (~9% of Berkshire). Diversified commodity + industrial cash machines trading at single-digit P/Es with rising shareholder returns.",
    stocks: ["8058.T", "8031.T", "8001.T", "8053.T", "8002.T"],
  },
  {
    name: "Japan Pharma",
    description:
      "Japanese big-pharma — Takeda, Daiichi Sankyo (ADC leader, Enhertu), Astellas, Otsuka, Chugai (Roche subsidiary). Aging-demographic tailwind + globalizing pipelines.",
    stocks: ["4502.T", "4568.T", "4503.T", "4578.T", "4519.T"],
  },
];

// New ticker → tags. Uses existing 192-tag vocabulary where possible; new tags
// added only where genuinely missing (reinsurance, gene-editing, gene-therapy,
// regenerative-medicine, cdmo, ev-charging, cruise, hotel, casino, online-travel,
// theme-park, trading-house, beverage, australia, netherlands, brazil, mexico,
// chile, argentina, colombia, corporate-treasury, cpu).
const NEW_TICKER_TAGS: Record<string, string[]> = {
  // Insurance & Reinsurance
  "BRK-B": ["insurance", "reinsurance", "conglomerate", "us", "mega-cap"],
  "CB": ["insurance", "us", "mega-cap"],
  "AIG": ["insurance", "us", "mega-cap"],
  "MET": ["insurance", "us", "mega-cap"],
  "PRU": ["insurance", "us", "mega-cap"],
  "AFL": ["insurance", "us", "mega-cap"],
  "TRV": ["insurance", "us", "mega-cap"],
  "PGR": ["insurance", "us", "mega-cap"],
  "ALV.DE": ["insurance", "europe", "germany", "mega-cap"],
  "MUV2.DE": ["insurance", "reinsurance", "europe", "germany", "mega-cap"],
  "HNR1.DE": ["insurance", "reinsurance", "europe", "germany"],
  "AXAHY": ["insurance", "europe", "mega-cap"],
  "ZURVY": ["insurance", "europe", "switzerland", "mega-cap"],
  "8766.T": ["insurance", "japan", "mega-cap"],
  "8725.T": ["insurance", "japan", "mega-cap"],
  "8630.T": ["insurance", "japan"],
  "1299.HK": ["insurance", "china", "mega-cap"],
  "2628.HK": ["insurance", "china", "mega-cap"],
  "2318.HK": ["insurance", "china", "mega-cap", "fintech"],
  "2601.HK": ["insurance", "china"],
  "032830.KS": ["insurance", "korea", "mega-cap"],
  "088350.KS": ["insurance", "korea"],
  "G07.SI": ["insurance", "singapore"],

  // Genomics, Gene & Cell Therapy
  "CRSP": ["biotech", "gene-editing", "us"],
  "NTLA": ["biotech", "gene-editing", "us"],
  "BEAM": ["biotech", "gene-editing", "us"],
  "EDIT": ["biotech", "gene-editing", "us"],
  "BLUE": ["biotech", "gene-therapy", "us"],
  "FATE": ["biotech", "cell-therapy", "us"],
  "SGMO": ["biotech", "gene-editing", "us"],
  "GMAB": ["biotech", "pharma", "oncology", "europe", "mega-cap"],
  "QGEN": ["biotech", "diagnostics", "europe"],
  "4592.T": ["biotech", "cell-therapy", "regenerative-medicine", "japan"],
  "4587.T": ["biotech", "pharma", "japan"],
  "4565.T": ["biotech", "pharma", "japan"],
  "1672.HK": ["biotech", "china", "oncology"],
  "2616.HK": ["biotech", "china", "oncology"],
  "2257.HK": ["biotech", "china", "oncology"],
  "207940.KS": ["biotech", "cdmo", "korea", "mega-cap"],

  // EV Charging
  "CHPT": ["ev", "ev-charging", "us", "clean-energy"],
  "EVGO": ["ev", "ev-charging", "us", "clean-energy"],
  "BLNK": ["ev", "ev-charging", "us"],
  "WBX": ["ev", "ev-charging", "uk"],
  "ALLG": ["ev", "ev-charging", "europe"],
  "300693.SZ": ["ev", "ev-charging", "china", "power"],
  "002518.SZ": ["ev", "ev-charging", "china", "power"],
  "002851.SZ": ["ev", "ev-charging", "china", "power"],

  // Travel, Leisure & Hospitality
  "BKNG": ["travel", "online-travel", "us", "mega-cap"],
  "EXPE": ["travel", "online-travel", "us"],
  "ABNB": ["travel", "online-travel", "us", "mega-cap"],
  "MAR": ["hotel", "travel", "us", "mega-cap"],
  "HLT": ["hotel", "travel", "us", "mega-cap"],
  "H": ["hotel", "travel", "us"],
  "RCL": ["cruise", "travel", "us"],
  "CCL": ["cruise", "travel", "us"],
  "NCLH": ["cruise", "travel", "us"],
  "MGM": ["casino", "gaming", "travel", "us"],
  "IHG.L": ["hotel", "travel", "uk"],
  "4661.T": ["theme-park", "travel", "japan", "mega-cap"],
  "9202.T": ["airline", "travel", "japan", "mega-cap"],
  "9201.T": ["airline", "travel", "japan"],
  "9783.T": ["travel", "japan"],
  "0293.HK": ["airline", "travel", "china"],
  "0670.HK": ["airline", "travel", "china"],
  "0753.HK": ["airline", "travel", "china"],
  "1179.HK": ["hotel", "travel", "china"],
  "0045.HK": ["hotel", "travel", "china"],
  "0027.HK": ["casino", "gaming", "china", "mega-cap"],
  "1928.HK": ["casino", "gaming", "china", "mega-cap"],
  "1128.HK": ["casino", "gaming", "china"],
  "2282.HK": ["casino", "gaming", "china"],
  "6883.HK": ["casino", "gaming", "china"],
  "003490.KS": ["airline", "travel", "korea"],
  "008770.KS": ["hotel", "travel", "korea"],
  "G13.SI": ["casino", "gaming", "singapore"],

  // Brazil & LATAM
  "PBR": ["oil", "gas", "integrated", "brazil", "latam", "mega-cap"],
  "ITUB": ["bank", "financial", "brazil", "latam", "mega-cap"],
  "BBD": ["bank", "financial", "brazil", "latam", "mega-cap"],
  "ABEV": ["consumer", "beverage", "brazil", "latam", "mega-cap"],
  "GGB": ["steel", "industrial", "brazil", "latam"],
  "ERJ": ["aerospace", "industrial", "brazil", "latam"],
  "VIV": ["telecom", "brazil", "latam"],
  "AMX": ["telecom", "mexico", "latam", "mega-cap"],
  "KOF": ["consumer", "beverage", "mexico", "latam"],
  "WMMVY": ["retail", "consumer", "mexico", "latam", "mega-cap"],
  "GMBXF": ["mining", "copper", "mexico", "latam", "mega-cap"],
  "GBOOY": ["bank", "financial", "mexico", "latam"],
  "SQM": ["lithium", "mining", "chile", "latam"],
  "ANTO.L": ["copper", "mining", "chile", "latam", "uk"],
  "BSAC": ["bank", "financial", "chile", "latam"],
  "GLOB": ["software", "it-services", "argentina", "latam"],
  "YPF": ["oil", "gas", "argentina", "latam"],
  "BMA": ["bank", "financial", "argentina", "latam"],
  "EC": ["oil", "gas", "colombia", "latam"],
  "CIB": ["bank", "financial", "colombia", "latam"],

  // Japan Sogo Shosha
  "8058.T": ["trading-house", "conglomerate", "commodities", "japan", "mega-cap"],
  "8031.T": ["trading-house", "conglomerate", "commodities", "japan", "mega-cap"],
  "8001.T": ["trading-house", "conglomerate", "commodities", "japan", "mega-cap"],
  "8053.T": ["trading-house", "conglomerate", "commodities", "japan", "mega-cap"],
  "8002.T": ["trading-house", "conglomerate", "commodities", "japan", "mega-cap"],

  // Japan Pharma
  "4502.T": ["pharma", "japan", "mega-cap"],
  "4568.T": ["pharma", "oncology", "japan", "mega-cap"],
  "4503.T": ["pharma", "japan", "mega-cap"],
  "4578.T": ["pharma", "japan", "mega-cap"],
  "4519.T": ["pharma", "biotech", "japan", "mega-cap"],
};

// Tag additions for existing tickers — augment, don't overwrite.
const TAG_ADDITIONS: Record<string, string[]> = {
  MSTR: ["corporate-treasury"],
  "3350.T": ["corporate-treasury"],
  LMT: ["space"],
  VST: ["nuclear", "data-center", "ai-power"],
  PEG: ["nuclear"],
  HUT: ["data-center", "ai-power"],
  BHP: ["australia"],
  RIO: ["australia", "uk"],
  ASML: ["netherlands"],
  VALE: ["brazil", "latam"],
  GLEN: ["uk", "switzerland"],
  INTC: ["cpu", "data-center"],
  "9688.HK": ["mega-cap"],
};

async function main() {
  // 1. Insert themes (skip if name already exists), capture id mapping.
  const existing = await db.execute("SELECT id, name FROM themes");
  const existingByName = new Map<string, number>(
    existing.rows.map((r) => [r.name as string, r.id as number]),
  );

  const themeIdByName = new Map<string, number>();
  for (const theme of NEW_THEMES) {
    if (existingByName.has(theme.name)) {
      console.log(`  ↻ theme exists: ${theme.name} (id=${existingByName.get(theme.name)})`);
      themeIdByName.set(theme.name, existingByName.get(theme.name)!);
      continue;
    }
    const res = await db.execute({
      sql: "INSERT INTO themes (name, description, tags) VALUES (?, ?, '[]') RETURNING id",
      args: [theme.name, theme.description],
    });
    const id = res.rows[0].id as number;
    themeIdByName.set(theme.name, id);
    console.log(`  ✚ created theme: ${theme.name} (id=${id})`);
  }

  // 2. Insert theme_stocks (skip duplicates per (theme_id, ticker)).
  for (const theme of NEW_THEMES) {
    const tid = themeIdByName.get(theme.name)!;
    const existingStocks = await db.execute({
      sql: "SELECT ticker FROM theme_stocks WHERE theme_id = ?",
      args: [tid],
    });
    const have = new Set(existingStocks.rows.map((r) => r.ticker as string));
    let added = 0;
    for (const ticker of theme.stocks) {
      if (have.has(ticker)) continue;
      await db.execute({
        sql: "INSERT INTO theme_stocks (theme_id, ticker) VALUES (?, ?)",
        args: [tid, ticker],
      });
      added++;
    }
    console.log(`  ✚ ${theme.name}: ${added} stocks added (${theme.stocks.length} total in spec)`);
  }

  // 3. Upsert stock_tags for new tickers.
  let newTagRows = 0;
  for (const [ticker, tags] of Object.entries(NEW_TICKER_TAGS)) {
    const existingRow = await db.execute({
      sql: "SELECT tags FROM stock_tags WHERE ticker = ?",
      args: [ticker],
    });
    if (existingRow.rows.length === 0) {
      await db.execute({
        sql: "INSERT INTO stock_tags (ticker, tags) VALUES (?, ?)",
        args: [ticker, JSON.stringify(tags)],
      });
      newTagRows++;
    } else {
      // Merge — don't drop tags that already exist on this ticker.
      const current: string[] = JSON.parse(existingRow.rows[0].tags as string);
      const merged = Array.from(new Set([...current, ...tags]));
      if (merged.length !== current.length) {
        await db.execute({
          sql: "UPDATE stock_tags SET tags = ?, updated_at = datetime('now') WHERE ticker = ?",
          args: [JSON.stringify(merged), ticker],
        });
        console.log(`  ↻ merged tags for existing ticker ${ticker}: +${merged.length - current.length}`);
      }
    }
  }
  console.log(`  ✚ ${newTagRows} new stock_tags rows`);

  // 4. Tag additions for existing tickers — augment.
  let updated = 0;
  for (const [ticker, additions] of Object.entries(TAG_ADDITIONS)) {
    const row = await db.execute({
      sql: "SELECT tags FROM stock_tags WHERE ticker = ?",
      args: [ticker],
    });
    if (row.rows.length === 0) {
      console.warn(`  ! TAG_ADDITIONS: ticker ${ticker} not in stock_tags — skipping`);
      continue;
    }
    const current: string[] = JSON.parse(row.rows[0].tags as string);
    const merged = Array.from(new Set([...current, ...additions]));
    if (merged.length === current.length) {
      console.log(`  = ${ticker}: no new tags to add`);
      continue;
    }
    await db.execute({
      sql: "UPDATE stock_tags SET tags = ?, updated_at = datetime('now') WHERE ticker = ?",
      args: [JSON.stringify(merged), ticker],
    });
    updated++;
    console.log(`  ↻ ${ticker}: ${current.join(",")} → ${merged.join(",")}`);
  }
  console.log(`  ✚ ${updated} existing-ticker tag rows updated`);

  console.log("\nDone.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
