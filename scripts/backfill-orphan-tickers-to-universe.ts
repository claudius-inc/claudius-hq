/**
 * One-shot pre-migration backfill: for every ticker that has a row in
 * `watchlist_scores` but NO row in `scanner_universe`, create the registry
 * row with name/market/description copied across. Idempotent.
 *
 * Run BEFORE applying drizzle/0008 — the migration drops the description
 * column from ticker_metrics, so any description not already preserved in
 * scanner_universe.notes would be lost.
 *
 *   npx tsx scripts/backfill-orphan-tickers-to-universe.ts
 */
import { createClient } from "@libsql/client";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config();

const db = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

interface Row {
  ticker: string;
  name: string;
  market: string;
  description: string | null;
}

async function main() {
  const result = await db.execute(`
    SELECT ws.ticker, ws.name, ws.market, ws.description
    FROM watchlist_scores ws
    LEFT JOIN scanner_universe su ON su.ticker = ws.ticker
    WHERE su.ticker IS NULL
  `);

  const rows = result.rows as unknown as Row[];
  console.log(`Found ${rows.length} watchlist tickers with no scanner_universe row.`);

  let inserted = 0;
  for (const r of rows) {
    try {
      await db.execute({
        sql: `
          INSERT INTO scanner_universe (ticker, market, name, source, notes, enabled)
          VALUES (?, ?, ?, 'discovered', ?, 1)
        `,
        args: [r.ticker, r.market, r.name, r.description ?? null],
      });
      inserted++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`  ${r.ticker}: ${msg}`);
    }
  }

  console.log(`\nDone. Inserted ${inserted} scanner_universe rows.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
