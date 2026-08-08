/**
 * Seed / refresh the S&P 500 constituent dataset (membership + GICS sector +
 * float weight) from the SPDR daily holdings files.
 *
 *   npx tsx scripts/seed/sp500-constituents.ts
 *
 * Idempotent: upserts every row and prunes names that have left the index, so
 * it doubles as the quarterly-rebalance refresh. Feeds the daily note's
 * within-sector divergence (§5) and index-contribution (§8).
 */
import { notInArray } from "drizzle-orm";
import { db, sp500Constituents } from "@/db";
import { logger } from "@/lib/logger";
import { fetchSp500Constituents } from "@/lib/notes/sources/spdr-holdings";

const SRC = "seed/sp500-constituents";

async function main() {
  const rows = await fetchSp500Constituents();

  // One timestamp for the whole refresh, written on insert AND update, in the
  // same format either way — the note's staleness gate parses this.
  const now = new Date().toISOString();

  const upserts = rows.map((c) =>
    db
      .insert(sp500Constituents)
      .values({
        ticker: c.ticker,
        name: c.name,
        sectorEtf: c.sectorEtf,
        spyWeight: c.spyWeight,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: sp500Constituents.ticker,
        set: { name: c.name, sectorEtf: c.sectorEtf, spyWeight: c.spyWeight, updatedAt: now },
      }),
  );

  // Drop names that have left the index (rebalance / M&A). Safe against a
  // partial fetch: fetchSp500Constituents throws on any empty sector file or a
  // <400 total, so `keep` is never a gutted list.
  const keep = rows.map((r) => r.ticker);
  const prune = db.delete(sp500Constituents).where(notInArray(sp500Constituents.ticker, keep));

  // Atomic + fast: one round trip instead of 500+ sequential ones.
  const statements = [...upserts, prune] as [typeof prune, ...(typeof prune)[]];
  const results = await db.batch(statements);
  const removed = results[results.length - 1] as { rowsAffected?: number };

  const bySector = rows.reduce<Record<string, number>>((acc, r) => {
    acc[r.sectorEtf] = (acc[r.sectorEtf] ?? 0) + 1;
    return acc;
  }, {});

  logger.info(SRC, "Constituent dataset refreshed", {
    upserted: rows.length,
    withWeight: rows.filter((r) => r.spyWeight != null).length,
    removed: removed.rowsAffected ?? 0,
    bySector,
  });
  console.log(`Seeded ${rows.length} constituents across ${Object.keys(bySector).length} sectors.`);
}

main().catch((err) => {
  logger.error(SRC, "Seed failed", { error: err });
  process.exit(1);
});
