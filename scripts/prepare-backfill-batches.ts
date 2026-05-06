/**
 * Prepare batch files for the Claude-driven profile backfill.
 *
 * Filters scanner_universe to the meaningful subset (in any theme, in
 * portfolio_holdings, has tags, or source='user') with profile_generated_at
 * IS NULL, then splits the list into N batch JSON files at tmp/batches/.
 * Each batch file holds the input rows the corresponding sub-agent will
 * profile.
 *
 * Usage:
 *   npx tsx scripts/prepare-backfill-batches.ts [--batches 10]
 */
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";
import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import { sql } from "drizzle-orm";
import * as schema from "../src/db/schema";

dotenv.config({ path: ".env.local" });
dotenv.config({ quiet: true });

const args = process.argv.slice(2);
const BATCH_IDX = args.indexOf("--batches");
const BATCH_COUNT =
  BATCH_IDX >= 0 && args[BATCH_IDX + 1] ? parseInt(args[BATCH_IDX + 1], 10) : 10;

async function main() {
  const client = createClient({
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN,
  });
  const db = drizzle(client, { schema });

  const r = await db.run(sql`
    SELECT u.ticker, u.market, u.name, u.sector
    FROM scanner_universe u
    WHERE u.profile_generated_at IS NULL
      AND (
        u.ticker IN (SELECT ticker FROM theme_stocks)
        OR u.ticker IN (SELECT ticker FROM portfolio_holdings)
        OR u.ticker IN (SELECT ticker FROM ticker_tags)
        OR u.source = 'user'
      )
    ORDER BY u.ticker
  `);

  const rows = r.rows.map((row) => ({
    ticker: row.ticker as string,
    market: row.market as string,
    name: row.name as string | null,
    sector: row.sector as string | null,
  }));

  console.log(`Total tickers to backfill: ${rows.length}`);

  const outDir = path.join("tmp", "batches");
  fs.mkdirSync(outDir, { recursive: true });

  // Clear any prior batch files.
  for (const f of fs.readdirSync(outDir)) {
    if (f.startsWith("batch-") && f.endsWith(".json")) {
      fs.unlinkSync(path.join(outDir, f));
    }
  }

  const batchSize = Math.ceil(rows.length / BATCH_COUNT);
  for (let i = 0; i < BATCH_COUNT; i++) {
    const start = i * batchSize;
    const slice = rows.slice(start, start + batchSize);
    if (slice.length === 0) break;
    const file = path.join(
      outDir,
      `batch-${String(i + 1).padStart(2, "0")}.json`,
    );
    fs.writeFileSync(file, JSON.stringify(slice, null, 2));
    console.log(`  ${file}: ${slice.length} tickers (${slice[0].ticker}…${slice[slice.length - 1].ticker})`);
  }

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
