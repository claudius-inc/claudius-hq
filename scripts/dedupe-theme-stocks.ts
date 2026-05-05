/**
 * One-shot cleanup: delete any duplicate (theme_id, ticker) rows from
 * `theme_stocks`, keeping the row with the lowest id. Then add a unique
 * index so the table can never carry duplicates again.
 *
 * Run with:
 *   npx tsx scripts/dedupe-theme-stocks.ts
 */
import { createClient } from "@libsql/client";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config();

const db = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

async function main() {
  const before = await db.execute(`
    SELECT theme_id, ticker, COUNT(*) AS n
    FROM theme_stocks
    GROUP BY theme_id, ticker
    HAVING COUNT(*) > 1
  `);
  console.log(`Duplicate (theme_id, ticker) pairs before: ${before.rows.length}`);

  const del = await db.execute(`
    DELETE FROM theme_stocks
    WHERE id NOT IN (
      SELECT MIN(id)
      FROM theme_stocks
      GROUP BY theme_id, ticker
    )
  `);
  console.log(`Deleted: ${del.rowsAffected}`);

  process.stdout.write("Adding UNIQUE INDEX idx_theme_stocks_unique... ");
  try {
    await db.execute(
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_theme_stocks_unique ON theme_stocks(theme_id, ticker)",
    );
    console.log("OK");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.log(`ERR: ${msg}`);
  }

  const after = await db.execute(`
    SELECT theme_id, ticker, COUNT(*) AS n
    FROM theme_stocks
    GROUP BY theme_id, ticker
    HAVING COUNT(*) > 1
  `);
  console.log(`Duplicate (theme_id, ticker) pairs after:  ${after.rows.length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
