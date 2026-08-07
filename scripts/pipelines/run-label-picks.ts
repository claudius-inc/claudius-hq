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
 * Covers both screens. The crypto path carries one subtlety worth knowing:
 * crypto_prices_daily is written from the same top-1000 pull the screen uses,
 * so a coin that COLLAPSES falls below the rank cutoff and stops having rows.
 * Joining only against that spine would silently delete exactly the worst
 * outcomes — amputating the left tail of a breakout screen, which is where such
 * screens actually die. Missing exit prices are therefore backfilled with a
 * direct per-coin fetch before any label is written off as unavailable.
 */
import { rawClient } from "@/db";
import {
  labelPick,
  labelCryptoPick,
  cohortStats,
  quarantineReasonFor,
  type LabelBar,
  type LabelStatus,
  type CryptoPricePoint,
} from "@/lib/markets/labeling";
import { logger } from "@/lib/logger";

const DRY = process.argv.includes("--dry-run");

/** Trading-day horizons for equities. */
const HORIZONS = [5, 20];
/** Calendar-day horizons for crypto, which trades 24/7. */
const CRYPTO_HORIZONS = [7, 30];

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

/**
 * Daily closes for one coin straight from CoinGecko, used when the price spine
 * has no row because the coin fell out of the tracked top 1000.
 *
 * market_chart/range returns [msTimestamp, price] pairs; collapsing them to one
 * point per day matches the spine's granularity.
 */
async function fetchCoinRange(
  coinId: string,
  fromDate: string,
  toDate: string,
  apiKey: string,
): Promise<CryptoPricePoint[]> {
  const from = Math.floor(Date.parse(fromDate) / 1000) - 86_400;
  const to = Math.floor(Date.parse(toDate) / 1000) + 86_400;
  const url =
    `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(coinId)}/market_chart/range` +
    `?vs_currency=usd&from=${from}&to=${to}`;
  const headers: Record<string, string> = { accept: "application/json" };
  if (apiKey) headers["x-cg-demo-api-key"] = apiKey;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { headers });
      if (res.status === 429) {
        await sleep(8000 * (attempt + 1));
        continue;
      }
      // 404 means the coin is genuinely gone from CoinGecko, not a transient
      // failure — return empty so the caller labels at last known price.
      if (!res.ok) return [];
      const json = (await res.json()) as { prices?: [number, number][] };
      const byDay = new Map<string, number>();
      for (const [ms, p] of json.prices ?? []) {
        byDay.set(new Date(ms).toISOString().slice(0, 10), p);
      }
      return Array.from(byDay.entries())
        .map(([d, p]) => ({ d, p }))
        .sort((a, b) => a.d.localeCompare(b.d));
    } catch {
      await sleep(1500);
    }
  }
  return [];
}

async function labelCrypto(startedAt: string): Promise<void> {
  const apiKey = process.env.COINGECKO_API_KEY || "";

  const picksRes = await rawClient.execute(`
    SELECT id, coin_id, sym, run_date, price
    FROM crypto_screen_picks
    ORDER BY run_date, id
  `);
  const picks = picksRes.rows as unknown as {
    id: number; coin_id: string; sym: string; run_date: string; price: number | null;
  }[];
  if (picks.length === 0) {
    logger.info("label-picks", "No crypto picks yet");
    return;
  }

  if (!DRY) {
    const seeds = picks.flatMap((p) =>
      CRYPTO_HORIZONS.map((h) => ({
        sql: `INSERT INTO pick_labels (source, pick_id, ticker, horizon, entry_date, entry_raw, status)
              VALUES ('crypto', ?, ?, ?, ?, ?, 'pending')
              ON CONFLICT(source, pick_id, horizon) DO NOTHING`,
        args: [p.id, p.coin_id, h, p.run_date, p.price] as never[],
      })),
    );
    for (let i = 0; i < seeds.length; i += 200) {
      await rawClient.batch(seeds.slice(i, i + 200), "write");
    }
  }

  const pendingRes = await rawClient.execute(`
    SELECT pick_id, ticker AS coin_id, horizon, entry_date, entry_raw
    FROM pick_labels WHERE source = 'crypto' AND status = 'pending'
    ORDER BY entry_date, ticker
  `);
  const pending = pendingRes.rows as unknown as {
    pick_id: number; coin_id: string; horizon: number; entry_date: string; entry_raw: number | null;
  }[];
  if (pending.length === 0) {
    logger.info("label-picks", "No pending crypto labels", { picks: picks.length });
    return;
  }

  const counts: Record<string, number> = {};
  const updates: { sql: string; args: never[] }[] = [];
  let backfilled = 0;

  for (const row of pending) {
    // Prefer the spine; it costs nothing and covers the common case.
    const spineRes = await rawClient.execute({
      sql: `SELECT date AS d, price AS p FROM crypto_prices_daily
            WHERE coin_id = ? AND date >= ? ORDER BY date`,
      args: [row.coin_id, row.entry_date] as never[],
    });
    let points = spineRes.rows as unknown as CryptoPricePoint[];

    const targetExit = new Date(Date.parse(row.entry_date) + row.horizon * 86_400_000)
      .toISOString()
      .slice(0, 10);
    const elapsed = Math.round((Date.now() - Date.parse(row.entry_date)) / 86_400_000);
    const haveExit = points.some(
      (pt) => Math.abs(Math.round((Date.parse(pt.d) - Date.parse(targetExit)) / 86_400_000)) <= 2,
    );

    // Missing exit past due means the coin left the top 1000 — the case that
    // would otherwise delete the worst outcomes. Go get it directly.
    if (!haveExit && elapsed >= row.horizon) {
      const fetched = await fetchCoinRange(row.coin_id, row.entry_date, targetExit, apiKey);
      if (fetched.length) {
        points = fetched;
        backfilled++;
      }
      await sleep(2500); // demo-tier rate limit
    }

    const res = labelCryptoPick({
      points,
      runDate: row.entry_date,
      horizonDays: row.horizon,
      storedPrice: row.entry_raw,
      today: today(),
    });
    counts[res.status] = (counts[res.status] ?? 0) + 1;
    if (res.status === "pending") continue;

    updates.push({
      sql: `UPDATE pick_labels
            SET status = ?, entry_adj = ?, exit_adj = ?, exit_date = ?, fwd_pct = ?,
                anomaly_note = ?, labeled_at = ?
            WHERE source = 'crypto' AND pick_id = ? AND horizon = ?`,
      args: [
        res.status, res.entryAdj, res.exitAdj, res.exitDate, res.fwdPct,
        res.anomalyNote, startedAt, row.pick_id, row.horizon,
      ] as never[],
    });
  }

  if (DRY) {
    logger.info("label-picks", "Crypto dry run", { counts, backfilled, updates: updates.length });
    return;
  }
  for (let i = 0; i < updates.length; i += 200) {
    await rawClient.batch(updates.slice(i, i + 200), "write");
  }
  logger.info("label-picks", "Crypto done", { counts, backfilled, updates: updates.length });
}

async function labelEquities(startedAt: string): Promise<void> {
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

  logger.info("label-picks", "Equities done", {
    counts,
    updates: updates.length,
    quarantined: quarantines.size,
  });
}

async function main() {
  const startedAt = new Date().toISOString();
  // Both screens are labelled every run, and a failure in one must not stop
  // the other — they share nothing but the table.
  await labelEquities(startedAt);
  await labelCrypto(startedAt);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    logger.error("label-picks", "Labelling failed", { error: err });
    process.exit(1);
  });
