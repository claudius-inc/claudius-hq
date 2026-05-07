/**
 * Print tickers in scanner_universe whose profile_generated_at IS NULL,
 * formatted as JSON for the backfill workflow. Output goes to stdout.
 *
 *   npx tsx scripts/list-tickers-needing-profile.ts > tmp/backfill-tickers.json
 */
import * as dotenv from "dotenv";
import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import { isNull, asc } from "drizzle-orm";
import * as schema from "../src/db/schema";

dotenv.config({ path: ".env.local" });
dotenv.config();

async function main() {
  const client = createClient({
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN,
  });
  const db = drizzle(client, { schema });

  const rows = await db
    .select({
      ticker: schema.scannerUniverse.ticker,
      market: schema.scannerUniverse.market,
      name: schema.scannerUniverse.name,
    })
    .from(schema.scannerUniverse)
    .where(isNull(schema.scannerUniverse.profileGeneratedAt))
    .orderBy(asc(schema.scannerUniverse.ticker));

  console.log(JSON.stringify({ count: rows.length, tickers: rows }, null, 2));
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
