/**
 * Read-only: report any duplicate (theme_id, ticker) pairs in `theme_stocks`.
 */
import { createClient } from "@libsql/client";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config();

const db = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

async function run() {
  const result = await db.execute(`
    SELECT theme_id, ticker, COUNT(*) AS n
    FROM theme_stocks
    GROUP BY theme_id, ticker
    HAVING COUNT(*) > 1
    ORDER BY n DESC, theme_id, ticker
  `);
  console.log(`Duplicate (theme_id, ticker) pairs: ${result.rows.length}`);
  for (const r of result.rows.slice(0, 30)) console.log(r);

  const total = await db.execute(
    "SELECT COUNT(*) AS n FROM theme_stocks",
  );
  console.log(`\nTotal theme_stocks rows: ${total.rows[0].n}`);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
