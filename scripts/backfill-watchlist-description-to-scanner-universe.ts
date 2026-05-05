/**
 * One-shot backfill: copy `watchlist_scores.description` into
 * `scanner_universe.notes` for every ticker that has a description but no
 * existing notes. Idempotent — safe to re-run.
 *
 * Run with:
 *   npx tsx scripts/backfill-watchlist-description-to-scanner-universe.ts
 */
import { createClient } from "@libsql/client";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config(); // also read .env

const db = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

interface Row {
  ticker: string;
  description: string;
}

async function main() {
  // Pull every (ticker, description) pair where description is non-empty.
  const result = await db.execute({
    sql: `
      SELECT ticker, description
      FROM watchlist_scores
      WHERE description IS NOT NULL AND TRIM(description) != ''
    `,
    args: [],
  });

  const rows = result.rows as unknown as Row[];
  console.log(`Found ${rows.length} watchlist_scores rows with descriptions.`);

  let copied = 0;
  let skippedExisting = 0;
  let skippedMissingUniverse = 0;

  for (const { ticker, description } of rows) {
    // Only update when scanner_universe.notes is currently null OR empty.
    // We never overwrite user-written notes.
    const update = await db.execute({
      sql: `
        UPDATE scanner_universe
        SET notes = ?, updated_at = datetime('now')
        WHERE ticker = ? AND (notes IS NULL OR TRIM(notes) = '')
      `,
      args: [description, ticker],
    });

    if (update.rowsAffected > 0) {
      copied++;
      continue;
    }

    // Distinguish "already had notes" from "no scanner_universe row".
    const exists = await db.execute({
      sql: "SELECT 1 FROM scanner_universe WHERE ticker = ? LIMIT 1",
      args: [ticker],
    });
    if (exists.rows.length === 0) {
      skippedMissingUniverse++;
    } else {
      skippedExisting++;
    }
  }

  console.log(`\nDone.`);
  console.log(`  Copied:                 ${copied}`);
  console.log(`  Skipped (notes existed): ${skippedExisting}`);
  console.log(`  Skipped (no universe):   ${skippedMissingUniverse}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
