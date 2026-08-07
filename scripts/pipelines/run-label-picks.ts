/**
 * Labels recorded screen picks with their realized forward returns.
 *
 * Run with:
 *   npx tsx scripts/pipelines/run-label-picks.ts
 *   npx tsx scripts/pipelines/run-label-picks.ts --dry-run
 *
 * Fully autonomous — no human input. Picks already carry an entry price and
 * date, so this only has to join them to prices and write the outcome.
 *
 * Scope: equities (momentum_report_picks). Crypto labelling is deliberately NOT
 * here yet: a coin that collapses drops out of the CoinGecko top-1000 and stops
 * appearing in crypto_prices_daily, so a naive SQL join would silently delete
 * exactly the worst outcomes and bias the crypto screen's measured performance
 * upward. That needs a direct per-coin price fetch for open labels, which is a
 * separate change.
 */
import { rawClient } from "@/db";
import {
  labelPick,
  cohortStats,
  quarantineReasonFor,
  type LabelBar,
  type LabelStatus,
} from "@/lib/markets/labeling";
import { logger } from "@/lib/logger";

const DRY = process.argv.includes("--dry-run");

/** Trading-day horizons to label every pick at. */
const HORIZONS = [5, 20];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const today = () => new Date().toISOString().slice(0, 10);

interface PickRow {
  id: number;
  ticker: string;
  report_date: string;
  price: number | null;
  reported: number;
}

/** Daily bars with both raw and adjusted closes. Adjusted is what the labels
 *  use; raw is kept solely so the two can be checked against each other. */
async function fetchBars(ticker: string, fromDate: string): Promise<LabelBar[]> {
  const period1 = Math.floor(Date.parse(fromDate) / 1000) - 7 * 86_400;
  const url =
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}` +
    `?period1=${period1}&period2=${Math.floor(Date.now() / 1000)}&interval=1d&events=div%2Csplit`;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
      if (res.status === 429) {
        await sleep(4000 * (attempt + 1));
        continue;
      }
      if (!res.ok) return [];
      const json = (await res.json()) as { chart?: { result?: Array<Record<string, unknown>> } };
      const r = json.chart?.result?.[0] as
        | {
            timestamp?: number[];
            indicators?: {
              quote?: Array<{ high?: (number | null)[]; low?: (number | null)[]; close?: (number | null)[] }>;
              adjclose?: Array<{ adjclose?: (number | null)[] }>;
            };
          }
        | undefined;
      if (!r?.timestamp) return [];

      const q = r.indicators?.quote?.[0] ?? {};
      const adj = r.indicators?.adjclose?.[0]?.adjclose;
      const out: LabelBar[] = [];
      for (let i = 0; i < r.timestamp.length; i++) {
        const c = q.close?.[i];
        const h = q.high?.[i];
        const l = q.low?.[i];
        if (c == null || h == null || l == null) continue;
        out.push({
          d: new Date(r.timestamp[i] * 1000).toISOString().slice(0, 10),
          h, l, c,
          a: adj?.[i] ?? c,
        });
      }
      // The last bar can be an in-progress session (this job runs while Asian
      // markets are open). Using a partial bar as an exit would compare a
      // mid-session print against a close, so drop it.
      const t = today();
      return out.filter((b) => b.d < t);
    } catch {
      await sleep(1000);
    }
  }
  return [];
}

async function main() {
  const startedAt = new Date().toISOString();

  // Seed label rows for any pick that has none yet.
  const picksRes = await rawClient.execute(`
    SELECT id, ticker, report_date, price, reported
    FROM momentum_report_picks
    ORDER BY report_date, id
  `);
  const picks = picksRes.rows as unknown as PickRow[];

  if (picks.length === 0) {
    logger.info("label-picks", "No recorded picks yet; nothing to label");
    return;
  }

  const seedStmts = picks.flatMap((p) =>
    HORIZONS.map((h) => ({
      sql: `INSERT INTO pick_labels (source, pick_id, ticker, horizon, entry_date, entry_raw, status)
            VALUES ('momentum', ?, ?, ?, ?, ?, 'pending')
            ON CONFLICT(source, pick_id, horizon) DO NOTHING`,
      args: [p.id, p.ticker, h, p.report_date, p.price] as never[],
    })),
  );
  if (!DRY) {
    for (let i = 0; i < seedStmts.length; i += 200) {
      await rawClient.batch(seedStmts.slice(i, i + 200), "write");
    }
  }

  // Everything still awaiting an outcome.
  const pendingRes = await rawClient.execute(`
    SELECT l.source, l.pick_id, l.ticker, l.horizon, l.entry_date, l.entry_raw
    FROM pick_labels l
    WHERE l.status = 'pending'
    ORDER BY l.entry_date, l.ticker
  `);
  const pending = pendingRes.rows as unknown as {
    source: string;
    pick_id: number;
    ticker: string;
    horizon: number;
    entry_date: string;
    entry_raw: number | null;
  }[];

  if (pending.length === 0) {
    logger.info("label-picks", "No pending labels", { picks: picks.length });
    return;
  }

  // One fetch per ticker covers every pending horizon and date for that name.
  const byTicker = new Map<string, typeof pending>();
  for (const row of pending) {
    const arr = byTicker.get(row.ticker) ?? [];
    arr.push(row);
    byTicker.set(row.ticker, arr);
  }

  logger.info("label-picks", "Labelling", {
    pendingLabels: pending.length,
    tickers: byTicker.size,
    dryRun: DRY,
  });

  const updates: { sql: string; args: never[] }[] = [];
  const quarantines = new Map<string, { reason: string; note: string; expiresInDays: number | null }>();
  const counts: Record<string, number> = {};
  const tickers = Array.from(byTicker.keys());

  for (let i = 0; i < tickers.length; i++) {
    const ticker = tickers[i];
    const rows = byTicker.get(ticker)!;
    const earliest = rows.reduce((a, b) => (a.entry_date < b.entry_date ? a : b)).entry_date;
    const bars = await fetchBars(ticker, earliest);

    for (const row of rows) {
      const res = labelPick({
        bars,
        entryDate: row.entry_date,
        horizon: row.horizon,
        storedPrice: row.entry_raw,
        today: today(),
      });
      counts[res.status] = (counts[res.status] ?? 0) + 1;
      if (res.status === "pending") continue;

      updates.push({
        sql: `UPDATE pick_labels
              SET status = ?, entry_adj = ?, exit_adj = ?, exit_date = ?, fwd_pct = ?,
                  anomaly_note = ?, labeled_at = ?
              WHERE source = ? AND pick_id = ? AND horizon = ?`,
        args: [
          res.status, res.entryAdj, res.exitAdj, res.exitDate, res.fwdPct,
          res.anomalyNote, startedAt,
          row.source, row.pick_id, row.horizon,
        ] as never[],
      });

      const q = quarantineReasonFor(res.status, res.anomalyNote);
      if (q) {
        quarantines.set(ticker, {
          reason: q.reason,
          note: res.anomalyNote ?? res.status,
          expiresInDays: q.expiresInDays,
        });
      }
    }

    if ((i + 1) % 25 === 0) logger.info("label-picks", `progress ${i + 1}/${tickers.length}`);
    await sleep(150);
  }

  if (DRY) {
    logger.info("label-picks", "Dry run complete", { counts, quarantines: quarantines.size, updates: updates.length });
    return;
  }

  for (let i = 0; i < updates.length; i += 200) {
    await rawClient.batch(updates.slice(i, i + 200), "write");
  }

  // Quarantine only CONFIRMED defects — see labeling.ts for why magnitude is
  // never a trigger.
  for (const [ticker, q] of Array.from(quarantines.entries())) {
    const expires =
      q.expiresInDays === null
        ? null
        : new Date(Date.now() + q.expiresInDays * 86_400_000).toISOString().slice(0, 10);
    await rawClient.execute({
      sql: `INSERT INTO ticker_quarantine (ticker, reason, evidence, expires_at)
            VALUES (?,?,?,?)
            ON CONFLICT(ticker) DO UPDATE SET
              reason = excluded.reason,
              evidence = excluded.evidence,
              last_seen = datetime('now'),
              expires_at = excluded.expires_at`,
      args: [ticker, q.reason, JSON.stringify({ note: q.note }), expires] as never[],
    });
  }

  // Drop expired quarantines so a transient artifact does not ban a name
  // forever. Permanent rows have expires_at IS NULL and are untouched.
  await rawClient.execute(
    `DELETE FROM ticker_quarantine WHERE expires_at IS NOT NULL AND expires_at < date('now')`,
  );

  // Cohort statistics per (entry_date, horizon), computed after labelling so
  // every outcome that exists is included. partial_delist rows count; defect
  // rows do not, and their share is reported as attrition.
  const groupsRes = await rawClient.execute(`
    SELECT DISTINCT entry_date, horizon FROM pick_labels
    WHERE source = 'momentum' AND status IN ('labeled','partial_delist')
  `);
  for (const g of groupsRes.rows as unknown as { entry_date: string; horizon: number }[]) {
    const rows = await rawClient.execute({
      sql: `SELECT status, fwd_pct FROM pick_labels
            WHERE source = 'momentum' AND entry_date = ? AND horizon = ?`,
      args: [g.entry_date, g.horizon] as never[],
    });
    // SQL is snake_case; cohortStats takes camelCase. Map explicitly rather
    // than casting, or every fwdPct arrives undefined and the mean is null.
    const stats = cohortStats(
      (rows.rows as unknown as { status: LabelStatus; fwd_pct: number | null }[]).map((r) => ({
        status: r.status,
        fwdPct: r.fwd_pct,
      })),
    );
    if (stats.mean === null) continue;
    await rawClient.execute({
      sql: `UPDATE pick_labels
            SET cohort_n = ?, cohort_mean_pct = ?, excess_pct = fwd_pct - ?
            WHERE source = 'momentum' AND entry_date = ? AND horizon = ?
              AND status IN ('labeled','partial_delist')`,
      args: [stats.n, stats.mean, stats.mean, g.entry_date, g.horizon] as never[],
    });
  }

  logger.info("label-picks", "Done", {
    counts,
    updates: updates.length,
    quarantined: quarantines.size,
  });
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    logger.error("label-picks", "Labelling failed", { error: err });
    process.exit(1);
  });
