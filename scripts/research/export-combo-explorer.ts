/**
 * Builds the browser payload for the combination explorer and writes it to the DB.
 *
 * Run with:
 *   npx tsx scripts/research/export-combo-explorer.ts
 *   npx tsx scripts/research/export-combo-explorer.ts --horizon 18 --stride 4
 *
 * WHY THIS RUNS HERE AND NOT ON THE WEB APP
 * -----------------------------------------
 * Same reason as every other perp job: Binance answers HTTP 451 to datacenter IP
 * ranges, so nothing rendered on Vercel can reach the venue, and the research
 * panel is a 47 MB local binary besides. This script runs where the data is,
 * quantizes it, and writes the result to the database. The page reads only the
 * database — no geographic dependency, no venue call, no panel on the server.
 *
 * WHAT `--stride` COSTS
 * ---------------------
 * Every Nth timestamp is kept. At stride 4 the payload is ~1 MB and the numbers
 * are computed from a quarter of the cross-sections, so they wobble relative to
 * the full run. That is the whole trade: the explorer exists to FIND candidates
 * interactively, and `run-perp-combo-search.ts` exists to confirm them against
 * the full panel, the sealed holdout and the bootstrap null. The header carries
 * the stride and the page prints it.
 */
import "dotenv/config";
import {
  loadOrBuildPanel,
  coveredSignals,
  rowsByTimestamp,
  STUDY_CONFIG,
  type PanelConfig,
} from "@/lib/markets/perp-panel";
import { buildRankCache, commonMask } from "@/lib/markets/perp-evaluate";
import { PERP_SIGNALS, SIGNAL_BY_NAME } from "@/lib/markets/perp-signals";
import {
  encodePayload,
  quantizeRank,
  type ExplorerHeader,
} from "@/lib/markets/combo-explorer";

const argOf = (flag: string, fallback: string): string => {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};

const HORIZON = Number(argOf("--horizon", "6"));
const STRIDE = Number(argOf("--stride", "4"));
const DRY_RUN = process.argv.includes("--dry-run");

/** Chunk size for the blob table. Comfortably under any row-size limit. */
const CHUNK_BYTES = 400_000;

async function main() {
  const cfg: PanelConfig = { ...STUDY_CONFIG, horizon: HORIZON, entryLag: 1 };
  const panel = loadOrBuildPanel(cfg, PERP_SIGNALS);

  const covered = coveredSignals(panel, 0.5);
  const cache = buildRankCache(panel);
  const mask = commonMask(panel, covered);

  // Downsample in TIME, never in symbols: dropping symbols would shrink each
  // cross-section, which changes what a rank-z means — the exact quantity being
  // exported. Dropping whole timestamps leaves every survivor intact.
  const allGroups = rowsByTimestamp(panel);
  const kept = allGroups.filter((_, i) => i % STRIDE === 0);

  const rows: number[] = [];
  const rowsPerTimestamp: number[] = [];
  for (const group of kept) {
    const usable = group.filter((r) => mask[r] === 1);
    if (usable.length < 20) continue;
    rowsPerTimestamp.push(usable.length);
    rows.push(...usable);
  }

  const nRows = rows.length;
  const nSig = covered.length;
  const ranks = new Int16Array(nSig * nRows);
  const returns = new Float64Array(nRows);

  covered.forEach((name, s) => {
    const src = panel.signalNames.indexOf(name);
    for (let i = 0; i < nRows; i++) {
      ranks[s * nRows + i] = quantizeRank(cache.z[src * panel.nRows + rows[i]]);
    }
  });
  for (let i = 0; i < nRows; i++) returns[i] = panel.fwdNet[rows[i]];

  const cryptoIdx = panel.categories.indexOf("crypto");
  const cryptoRows = rows.filter((r) => panel.rowCategory[r] === cryptoIdx).length;

  const header: ExplorerHeader = {
    version: 1,
    runDate: new Date().toISOString().slice(0, 10),
    horizon: HORIZON,
    signals: covered,
    polarities: covered.map((n) => SIGNAL_BY_NAME.get(n)?.polarity ?? "directional"),
    groups: covered.map((n) => SIGNAL_BY_NAME.get(n)?.group ?? "unknown"),
    nRows,
    nTimestamps: rowsPerTimestamp.length,
    rowsPerTimestamp,
    timeStride: STRIDE,
    fullTimestamps: allGroups.length,
    cryptoShare: nRows ? cryptoRows / nRows : 0,
  };

  const payload = encodePayload(header, ranks, returns);

  console.log(
    `\nPayload: ${(payload.length / 1_048_576).toFixed(2)} MB · ${nSig} signals · ` +
      `${nRows.toLocaleString()} rows · ${header.nTimestamps}/${header.fullTimestamps} timestamps ` +
      `(stride ${STRIDE}) · ${(100 * header.cryptoShare).toFixed(1)}% crypto`,
  );

  if (DRY_RUN) {
    console.log("--dry-run: nothing written.");
    return;
  }

  const { rawClient } = await import("@/db");
  const chunks: Uint8Array[] = [];
  for (let off = 0; off < payload.length; off += CHUNK_BYTES) {
    chunks.push(payload.subarray(off, Math.min(off + CHUNK_BYTES, payload.length)));
  }

  // Delete-then-insert per (run_date, horizon): a re-run must replace, never
  // merge, or the concatenated blob would interleave two different exports.
  await rawClient.batch(
    [
      {
        sql: "DELETE FROM perp_explorer_panel WHERE run_date = ? AND horizon = ?",
        args: [header.runDate, HORIZON] as never[],
      },
      ...chunks.map((c, i) => ({
        sql: `INSERT INTO perp_explorer_panel (run_date, horizon, chunk_index, chunk)
              VALUES (?,?,?,?)`,
        args: [header.runDate, HORIZON, i, c] as never[],
      })),
      {
        sql: `INSERT INTO perp_explorer_meta (run_date, horizon, header, n_chunks, bytes)
              VALUES (?,?,?,?,?)
              ON CONFLICT(run_date, horizon) DO UPDATE SET
                header=excluded.header, n_chunks=excluded.n_chunks, bytes=excluded.bytes`,
        args: [
          header.runDate,
          HORIZON,
          JSON.stringify(header),
          chunks.length,
          payload.length,
        ] as never[],
      },
    ],
    "write",
  );

  console.log(`Wrote ${chunks.length} chunks for ${header.runDate} h=${HORIZON}.`);
}

main().catch((err) => {
  console.error("Explorer export failed:", err);
  process.exit(1);
});
