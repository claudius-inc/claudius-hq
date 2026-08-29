/**
 * Labels recorded perp convergence picks with their realized forward returns.
 *
 * Run with:
 *   npx tsx scripts/pipelines/run-label-perps.ts
 *   npx tsx scripts/pipelines/run-label-perps.ts --dry-run
 *
 * WHY THIS IS A SEPARATE JOB FROM run-label-picks.ts
 * --------------------------------------------------
 * The other labeller runs in CI, where Yahoo and CoinGecko are reachable. This
 * one needs Binance klines, and Binance answers HTTP 451 to GitHub-hosted
 * runners — the same constraint that put the screen itself on a VPS. So this
 * runs on that VPS, right after the screen records the day's picks (see
 * scripts/ops/daily-fetch.sh). Both write into the one `pick_labels` table under
 * different `source` values and share nothing else.
 *
 * Every perp CANDIDATE is labelled, not only the reported ones: the un-sent rows
 * are the control group that lets a later study ask whether the screen's
 * SELECTION — which 8 of the 80 qualifiers it chose to send — carried any skill.
 */
import "dotenv/config";
import { rawClient } from "@/db";
import { labelPerpPick, type PerpLabelBar } from "@/lib/markets/labeling";
import { BINANCE_FAPI } from "@/lib/markets/perp-venues";
import { logger } from "@/lib/logger";

const DRY = process.argv.includes("--dry-run");

/** Calendar-day horizons. Short, because this is a daily "look at this" list
 *  and its edge — if any — lives in the days after it is surfaced, not weeks. */
const HORIZONS = [1, 3, 7];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const H4_MS = 14_400_000;

/**
 * A stored `as_of` to epoch ms.
 *
 * Production writes it as a proper ISO instant, but a SQLite `datetime()` value
 * ("2026-08-28 23:59:59") would be read as LOCAL time by `Date.parse` and land
 * hours off. Normalising the separator and stamping UTC makes both shapes safe.
 */
function asOfToMs(s: string): number {
  const iso = s.includes("T") ? s : s.replace(" ", "T");
  const stamped = /(Z|[+-]\d\d:?\d\d)$/.test(iso) ? iso : iso + "Z";
  return Date.parse(stamped);
}

interface PendingRow {
  pick_id: number;
  symbol: string;
  horizon: number;
  entry_date: string;
  entry_raw: number | null;
  as_of: string | null;
}

/**
 * 4h klines for one symbol from `startMs`, reduced to (closeTime, close).
 *
 * One call covers every pending horizon and date for the symbol: 500 bars at 4h
 * is ~83 days, past the longest horizon plus this project's whole history, and
 * weighted only 2 by Binance (a 1500-bar call is weighted 10 and rate-limit-bans
 * the box on a full re-label). A pick whose entry still falls before this window
 * is left pending by the caller rather than mislabelled.
 *
 * Returns `null` on FAILURE — a rate-limit ban (429/418), a 5xx, a timeout, or a
 * spent retry budget — distinct from an empty array, which only a genuine HTTP
 * 200 with no bars produces. The distinction is the whole point: the caller must
 * leave a failed fetch pending and retry it, and must NEVER burn it to a terminal
 * `no_data`, or a transient ban would delete exactly the collapsed names whose
 * outcomes the record most needs (labeling.ts, rule 2).
 */
async function fetch4h(symbol: string, startMs: number): Promise<PerpLabelBar[] | null> {
  // BINANCE_FAPI from perp-venues is the BASE only (no /fapi/v1), unlike the
  // constant of the same name in perp-positioning-history.ts. The path is added
  // here.
  const url = `${BINANCE_FAPI}/fapi/v1/klines?symbol=${symbol}&interval=4h&startTime=${startMs}&limit=500`;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
      // 418 is the escalated ban Binance returns after ignored 429s; back off
      // harder and retry rather than treating it as "no data".
      if (res.status === 429 || res.status === 418 || res.status >= 500) {
        await sleep(3000 * (attempt + 1));
        continue;
      }
      if (!res.ok) return null;
      const rows = (await res.json()) as unknown[][];
      return rows
        .map((r) => ({ tClose: Number(r[6]), c: Number(r[4]) }))
        .filter((b) => Number.isFinite(b.tClose) && Number.isFinite(b.c));
    } catch {
      await sleep(1500);
    }
  }
  return null;
}

async function main() {
  const startedAt = new Date().toISOString();

  // Seed a label row per candidate per horizon. Idempotent: a re-run on the
  // same day inserts nothing new and re-labels only what is still pending.
  const picksRes = await rawClient.execute(`
    SELECT id, symbol, run_date, price
    FROM perp_convergence_picks
    ORDER BY run_date, id
  `);
  const picks = picksRes.rows as unknown as {
    id: number; symbol: string; run_date: string; price: number | null;
  }[];
  if (picks.length === 0) {
    logger.info("label-perps", "No perp picks recorded yet");
    return;
  }

  if (!DRY) {
    // A same-day re-run of the report does delete-then-insert on the picks table
    // with fresh ids, so any label seeded against a superseded id is now an
    // orphan that would sit pending forever. Drop orphans before re-seeding.
    await rawClient.execute(
      `DELETE FROM pick_labels WHERE source = 'perp'
         AND pick_id NOT IN (SELECT id FROM perp_convergence_picks)`,
    );
    const seeds = picks.flatMap((p) =>
      HORIZONS.map((h) => ({
        sql: `INSERT INTO pick_labels (source, pick_id, ticker, horizon, entry_date, entry_raw, status)
              VALUES ('perp', ?, ?, ?, ?, ?, 'pending')
              ON CONFLICT(source, pick_id, horizon) DO NOTHING`,
        args: [p.id, p.symbol, h, p.run_date, p.price] as never[],
      })),
    );
    for (let i = 0; i < seeds.length; i += 200) {
      await rawClient.batch(seeds.slice(i, i + 200), "write");
    }
  }

  // Everything still awaiting an outcome, with the precise entry bar-close.
  const pendingRes = await rawClient.execute(`
    SELECT l.pick_id, l.ticker AS symbol, l.horizon, l.entry_date, l.entry_raw, p.as_of
    FROM pick_labels l
    JOIN perp_convergence_picks p ON p.id = l.pick_id
    WHERE l.source = 'perp' AND l.status = 'pending'
    ORDER BY l.entry_date, l.ticker
  `);
  const pending = pendingRes.rows as unknown as PendingRow[];
  if (pending.length === 0) {
    logger.info("label-perps", "No pending perp labels", { picks: picks.length });
    return;
  }

  // One fetch per symbol covers all of its pending rows.
  const bySymbol = new Map<string, PendingRow[]>();
  for (const row of pending) {
    const arr = bySymbol.get(row.symbol) ?? [];
    arr.push(row);
    bySymbol.set(row.symbol, arr);
  }

  logger.info("label-perps", "Labelling", {
    pendingLabels: pending.length,
    symbols: bySymbol.size,
    dryRun: DRY,
  });

  const symbols = Array.from(bySymbol.keys());
  const updates: { sql: string; args: never[] }[] = [];
  const counts: Record<string, number> = {};
  const nowMs = Date.now();
  let cursor = 0;

  const worker = async () => {
    while (cursor < symbols.length) {
      const symbol = symbols[cursor++];
      const rows = bySymbol.get(symbol)!;
      const earliest = rows.reduce(
        (a, b) => (a.as_of && b.as_of ? (a.as_of < b.as_of ? a : b) : a),
        rows[0],
      );
      const anchorMs = earliest.as_of
        ? asOfToMs(earliest.as_of)
        : Date.parse(earliest.entry_date + "T00:00:00Z");
      const startMs = anchorMs - 3 * H4_MS;
      const bars = await fetch4h(symbol, startMs);
      // A failed fetch (rate-limit ban, 5xx, timeout) must not resolve anything:
      // leave every one of the symbol's rows pending and retry next run.
      if (bars === null) {
        counts["fetch_failed"] = (counts["fetch_failed"] ?? 0) + rows.length;
        continue;
      }
      // Binance returns klines ascending, so the first bar is the window start.
      const firstClose = bars.length ? bars[0].tClose : Infinity;

      for (const row of rows) {
        const asOfMs = row.as_of ? asOfToMs(row.as_of) : Date.parse(row.entry_date + "T00:00:00Z");
        // The single fetch window did not reach back to this entry — an unusually
        // old pick on a first backfill. Leave it pending for a later run; do NOT
        // let labelPerpPick read the gap as a delisting and burn it to no_data.
        if (bars.length && asOfMs < firstClose - H4_MS) {
          counts["pending"] = (counts["pending"] ?? 0) + 1;
          continue;
        }
        const res = labelPerpPick({
          bars,
          asOfMs,
          horizonDays: row.horizon,
          storedPrice: row.entry_raw,
          nowMs,
        });
        counts[res.status] = (counts[res.status] ?? 0) + 1;
        if (res.status === "pending") continue;
        updates.push({
          sql: `UPDATE pick_labels
                SET status = ?, entry_adj = ?, exit_adj = ?, exit_date = ?, fwd_pct = ?,
                    anomaly_note = ?, labeled_at = ?
                WHERE source = 'perp' AND pick_id = ? AND horizon = ?`,
          args: [
            res.status, res.entryAdj, res.exitAdj, res.exitDate, res.fwdPct,
            res.anomalyNote, startedAt, row.pick_id, row.horizon,
          ] as never[],
        });
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(3, symbols.length) }, worker));

  if (DRY) {
    logger.info("label-perps", "Dry run complete", { counts, updates: updates.length });
    return;
  }
  for (let i = 0; i < updates.length; i += 200) {
    await rawClient.batch(updates.slice(i, i + 200), "write");
  }
  logger.info("label-perps", "Perps done", { counts, updates: updates.length });
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    logger.error("label-perps", "Labelling failed", { error: err });
    process.exit(1);
  });
