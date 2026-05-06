import * as dotenv from "dotenv";
import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import { sql } from "drizzle-orm";
import * as schema from "../src/db/schema";

dotenv.config({ path: ".env.local" });
dotenv.config({ quiet: true });

async function main() {
  const client = createClient({
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN,
  });
  const db = drizzle(client, { schema });

  const r = await db.run(sql`
    SELECT
      (SELECT COUNT(*) FROM scanner_universe) AS total,
      (SELECT COUNT(*) FROM scanner_universe WHERE profile_generated_at IS NULL) AS unprofiled,
      (SELECT COUNT(DISTINCT u.ticker) FROM scanner_universe u
         WHERE u.profile_generated_at IS NULL
         AND (
           u.ticker IN (SELECT ticker FROM theme_stocks)
           OR u.ticker IN (SELECT ticker FROM portfolio_holdings)
           OR u.ticker IN (SELECT ticker FROM ticker_tags)
           OR u.source = 'user'
         )
      ) AS user_tracked
  `);
  console.log(JSON.stringify(r.rows[0]));
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
