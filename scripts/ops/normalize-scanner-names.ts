/**
 * One-shot migration: normalize scanner_universe.name to canonical Title Case.
 * Applies the curated override map first, then the algorithmic title-caser.
 *
 * Default = dry-run (prints diff, no writes).
 *   npx tsx scripts/ops/normalize-scanner-names.ts
 *
 * Apply the changes:
 *   npx tsx scripts/ops/normalize-scanner-names.ts --apply
 */
import * as dotenv from "dotenv";
import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import { eq, isNotNull, asc } from "drizzle-orm";
import * as schema from "../../src/db/schema";
import { normalizeScannerName } from "../../src/lib/text/normalize-scanner-name";

dotenv.config({ path: ".env.local" });
dotenv.config();

async function main() {
  const apply = process.argv.includes("--apply");

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
    .where(isNotNull(schema.scannerUniverse.name))
    .orderBy(asc(schema.scannerUniverse.market), asc(schema.scannerUniverse.ticker));

  type Diff = { ticker: string; market: string; before: string; after: string };
  const changes: Diff[] = [];
  for (const row of rows) {
    const before = row.name as string;
    const after = normalizeScannerName(row.ticker, before);
    if (after !== before) {
      changes.push({ ticker: row.ticker, market: row.market, before, after });
    }
  }

  // Print grouped by market
  const byMarket = changes.reduce<Record<string, Diff[]>>((acc, d) => {
    (acc[d.market] ||= []).push(d);
    return acc;
  }, {});

  const tickerWidth = 12;
  const beforeWidth = 42;
  for (const market of Object.keys(byMarket).sort()) {
    const list = byMarket[market];
    console.log(`\n=== ${market} (${list.length} changes) ===`);
    for (const d of list) {
      const t = d.ticker.padEnd(tickerWidth);
      const b = d.before.padEnd(beforeWidth);
      console.log(`  ${t} | ${b} -> ${d.after}`);
    }
  }

  console.log(
    `\nTotal: ${changes.length} changes across ${Object.keys(byMarket).length} markets (of ${rows.length} non-null rows)`
  );

  if (!apply) {
    console.log("\nDRY RUN — pass --apply to write changes.");
    process.exit(0);
  }

  console.log("\nApplying changes...");
  let written = 0;
  for (const d of changes) {
    await db
      .update(schema.scannerUniverse)
      .set({ name: d.after })
      .where(eq(schema.scannerUniverse.ticker, d.ticker));
    written++;
    if (written % 50 === 0) process.stdout.write(`  ${written}/${changes.length}\r`);
  }
  console.log(`\nDone — wrote ${written} rows.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
