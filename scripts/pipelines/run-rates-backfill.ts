/**
 * Rates back-fill runner. See src/lib/notes/rates-backfill.ts.
 *
 *   npx tsx scripts/pipelines/run-rates-backfill.ts [lookbackDays]
 *
 * Re-checks the US Treasury par-yield feed for recent notes that shipped with
 * provisional Yahoo yields (or none) and swaps in the authoritative curve once
 * the row has published. Idempotent: a note already on the Treasury curve is
 * skipped. Scheduled a few hours after the daily note so the ~6pm ET feed has
 * landed. A clean exit is a valid outcome even when nothing needed filling.
 */
import { logger } from "@/lib/logger";
import { backfillRates } from "@/lib/notes/rates-backfill";
import { alertAdmin } from "@/lib/notes/telegram";

const SRC = "notes/rates-backfill-runner";

async function main() {
  const lookback = Number(process.argv[2]);
  const results = await backfillRates(Number.isFinite(lookback) && lookback > 0 ? lookback : undefined);

  const filled = results.filter((r) => r.outcome === "filled");
  const stillMissing = results.filter((r) => r.outcome === "still-missing");

  logger.info(SRC, "Rates back-fill complete", {
    scanned: results.length,
    filled: filled.length,
    stillMissing: stillMissing.length,
  });

  // Only speak up when something changed. A silent no-op is the normal case —
  // most days the daily note already carried the authoritative curve.
  if (filled.length > 0) {
    const dates = filled.map((r) => `${r.date}${r.edited ? "" : " (note updated; message not edited)"}`).join(", ");
    await alertAdmin(`Rates back-fill: filled ${filled.length} note(s) with the Treasury curve — ${dates}.`);
  }
}

main().catch(async (err) => {
  logger.error(SRC, "Rates back-fill crashed", { error: err });
  await alertAdmin(`FAILED — rates back-fill crashed: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
