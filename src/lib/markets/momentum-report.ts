/**
 * Selection logic for the daily "Momentum Gainers" Telegram report.
 *
 * WHY THIS EXISTS AS A MODULE
 * ---------------------------
 * The screen used to live inline in .github/workflows/momentum-report.yml as a
 * `npx tsx -e '...'` string. Single-quote-wrapped shell strings cannot contain
 * apostrophes, which forced every SQL literal into double quotes and relied on
 * SQLite silently reinterpreting unknown identifiers as strings. It was also
 * untypecheckable and untestable. It lives here now.
 *
 * WHAT CHANGED IN THE SCREEN
 * --------------------------
 * The report ranked purely by day-over-day `momentum_score` delta, which is
 * close to information-free. `scoreMomentum` (src/lib/scanner/watchlist.ts) is
 * built from 12-month-anchored components — `calcReturn12mEx1m` reads
 * `closes[len-1-21] / closes[len-1-252]`, so it structurally cannot see the
 * last 21 trading days — and its tier gaps are 8-12 points. A single window
 * roll-off therefore prints a +12 delta with zero price movement today, and a
 * null -> populated data flap prints +16 to +40. `ORDER BY delta DESC LIMIT 10`
 * selected exactly those artifacts.
 *
 * Measured over 22 live report days (220 picks): 51% 5-day win rate, mean
 * +0.32%; 40% of picks had a NEGATIVE trailing 1-week return.
 *
 * Delta is now only a "not going backwards" gate. Ranking is on
 * `technical_score` (MA stack, RSI 50-70, MACD, volume trend, ADX) which was
 * already computed and snapshotted daily but never read by the report.
 */
import { db, rawClient, momentumSnapshots } from "@/db";
import { sql, desc } from "drizzle-orm";

/**
 * Selection thresholds.
 *
 * CALIBRATION NOTE: MOM_MIN / MOM_MAX come from a 22-day in-sample study of
 * live picks (momentum_score 40-69 -> 65% 5d win rate vs a 51% baseline;
 * >=70 -> 36%). That is ONE market regime, and the band was fitted on the same
 * sample it was measured on. Treat these two as a hypothesis under test, not
 * settled truth. `momentum_report_picks` records every candidate that cleared
 * the other gates — including the out-of-band ones, flagged `reported = 0` —
 * precisely so the band can be re-derived on data that was NOT pre-filtered by
 * it. The remaining gates are data-hygiene and structure filters and are not
 * regime-dependent.
 */
export const MOMENTUM_REPORT_CONFIG = {
  techMin: 60, // established uptrend structure
  strongDays: 3, // technical_score >= techMin on >= 3 of the last 5 snapshots
  histDays: 5, // require 5 prior snapshots — excludes new/flapping tickers
  momMin: 40,
  momMax: 69,
  max1w: 10, // not a post-spike chase
  cooldownDays: 5, // no repeat picks within 5 calendar days
  maxDeltaNoMove: 12, // delta > 12 without a >= 10% day is an artifact
  limit: 10,
} as const;

/**
 * Per-currency floors. `ticker_metrics.price` and `.market_cap` are in the
 * listing currency (Yahoo native), so a flat `price >= 1` floor is meaningless
 * for KRW/JPY/IDR — that is how 0606.HK reached the report at HK$0.243. GBp is
 * pence, hence the 100x on the GBP figure.
 */
const PRICE_FLOOR_SQL = `CASE COALESCE(su.currency, 'USD')
  WHEN 'USD' THEN 3    WHEN 'HKD' THEN 1     WHEN 'SGD' THEN 0.5
  WHEN 'JPY' THEN 100  WHEN 'KRW' THEN 1000  WHEN 'IDR' THEN 200
  WHEN 'TWD' THEN 20   WHEN 'CNY' THEN 3     WHEN 'EUR' THEN 3
  WHEN 'GBP' THEN 3    WHEN 'GBp' THEN 300   WHEN 'INR' THEN 50
  WHEN 'AUD' THEN 3    WHEN 'CAD' THEN 3     WHEN 'CHF' THEN 3
  WHEN 'BRL' THEN 5    ELSE 1 END`;

/**
 * ~USD 300M small-cap floor, expressed in each listing currency.
 *
 * GBp is the trap here: Yahoo quotes LSE `price` in PENCE but reports
 * `market_cap` in POUNDS (verified live — ANTO.L price 3990, market_cap 3.92e10
 * ~ GBP 39B). So the GBp market-cap floor is the same magnitude as GBP, NOT
 * 100x it. Only the price and turnover floors below are pence-denominated.
 */
const MCAP_FLOOR_SQL = `CASE COALESCE(su.currency, 'USD')
  WHEN 'USD' THEN 3e8    WHEN 'HKD' THEN 2.3e9  WHEN 'SGD' THEN 4e8
  WHEN 'JPY' THEN 4.5e10 WHEN 'KRW' THEN 4e11   WHEN 'IDR' THEN 5e12
  WHEN 'TWD' THEN 9e9    WHEN 'CNY' THEN 2.1e9  WHEN 'EUR' THEN 2.8e8
  WHEN 'GBP' THEN 2.4e8  WHEN 'GBp' THEN 2.4e8  WHEN 'INR' THEN 2.5e10
  WHEN 'AUD' THEN 4.5e8  WHEN 'CAD' THEN 4.1e8  WHEN 'CHF' THEN 2.7e8
  WHEN 'BRL' THEN 1.6e9  ELSE 3e8 END`;

/**
 * ~USD 2M/day turnover floor. `avg_dollar_vol_20d` is newly persisted and is
 * NULL until the next scanner run completes, so NULL passes the gate rather
 * than emptying the report during the rollover.
 */
const TURNOVER_FLOOR_SQL = `CASE COALESCE(su.currency, 'USD')
  WHEN 'USD' THEN 2e6    WHEN 'HKD' THEN 1.5e7  WHEN 'SGD' THEN 2.7e6
  WHEN 'JPY' THEN 3e8    WHEN 'KRW' THEN 2.7e9  WHEN 'IDR' THEN 3.3e10
  WHEN 'TWD' THEN 6e7    WHEN 'CNY' THEN 1.4e7  WHEN 'EUR' THEN 1.9e6
  WHEN 'GBP' THEN 1.6e6  WHEN 'GBp' THEN 1.6e8  WHEN 'INR' THEN 1.7e8
  WHEN 'AUD' THEN 3e6    WHEN 'CAD' THEN 2.7e6  WHEN 'CHF' THEN 1.8e6
  WHEN 'BRL' THEN 1.1e7  ELSE 2e6 END`;

export interface MomentumPick {
  ticker: string;
  name: string | null;
  currency: string | null;
  price: number | null;
  momentum_score: number | null;
  technical_score: number | null;
  price_change_1d: number | null;
  price_change_1w: number | null;
  price_change_1m: number | null;
  yesterday_score: number | null;
  momentum_delta: number | null;
}

export interface MomentumReportResult {
  /** The picks actually sent: qualified AND inside the momentum band, top N. */
  gainers: MomentumPick[];
  /**
   * Everything that cleared every gate EXCEPT the momentum band. Recorded in
   * full so the band can be re-derived out-of-sample — a band fitted on data
   * already filtered by that band is unfalsifiable.
   */
  candidates: MomentumPick[];
  count: number;
  priorDate: string | null;
  today: string;
  funnel: { universe: number; ok: number; qualified: number; inBand: number } | null;
}

/** Cap on how many candidates get persisted per day; the band study needs the
 *  shoulders, not the entire universe. */
const CANDIDATE_CAP = 100;

function buildFromClause(cfg: typeof MOMENTUM_REPORT_CONFIG): string {
  return `
    FROM ticker_metrics tm
    JOIN momentum_snapshots ms
      ON ms.ticker = tm.ticker AND ms.snapshot_date = ?
    LEFT JOIN scanner_universe su ON su.ticker = tm.ticker
    LEFT JOIN (
      SELECT ticker,
             COUNT(*) AS n_days,
             SUM(CASE WHEN technical_score >= ${cfg.techMin} THEN 1 ELSE 0 END) AS strong_days
      FROM momentum_snapshots
      WHERE snapshot_date < ? AND snapshot_date >= date(?, '-12 day')
        -- Weekend snapshots are duplicates, not observations. The snapshot job
        -- runs daily (cron '0 0 * * *') but the scanner runs weekdays only, so
        -- the Sat, Sun AND Mon snapshots are three byte-identical copies of
        -- Friday's last scan (verified: 0 differing rows across 08-01/02/03).
        -- Counting them made "strong on >= 3 of the last 5 days" satisfiable
        -- from a single Friday close. Excluding them means n_days counts real
        -- trading days, hence the widened 12-day window to still reach 5.
        AND CAST(strftime('%w', snapshot_date) AS INTEGER) BETWEEN 1 AND 5
      GROUP BY ticker
    ) h ON h.ticker = tm.ticker`;
}

function buildWhereClause(cfg: typeof MOMENTUM_REPORT_CONFIG): string {
  return `
    WHERE tm.data_quality = 'ok'
      AND tm.momentum_score IS NOT NULL
      AND ms.momentum_score IS NOT NULL
      -- Freshness. watchlist-orchestrator's "preserve on failure" branch keeps
      -- a previously healthy row — data_quality included — when a fetch fails,
      -- and bumps computed_at to record the attempt, so computed_at cannot
      -- detect staleness. A permanently failing ticker (delisting, Yahoo
      -- rename) therefore stays 'ok' with frozen scores forever. Under the old
      -- delta ranking a frozen row scored delta 0 and never surfaced; ranking
      -- by technical_score DESC puts one frozen in a strong state at the TOP.
      -- 4 days rather than hours because the scanner is weekdays-only, so a
      -- Monday report legitimately sees Friday's last good scan.
      AND (tm.last_good_scan_at IS NULL
           OR tm.last_good_scan_at >= datetime('now', '-4 days'))
      -- Data sanity. Catches unadjusted splits: MVIS printed
      -- price_change_1d = +1242% and ranked #1 on three separate days.
      AND tm.price_change_1d BETWEEN -30 AND 30
      AND tm.price_change_1w BETWEEN -50 AND 60
      -- Delta demoted from ranking key to a gate, plus an artifact guard: a
      -- real +20% day moves the score ~12-15 points, so a larger jump on a
      -- quiet day is a window roll-off or a null -> populated flap.
      AND (tm.momentum_score - ms.momentum_score) >= 0
      AND NOT ((tm.momentum_score - ms.momentum_score) > ${cfg.maxDeltaNoMove}
               AND tm.price_change_1d < 10)
      -- Structure: a real uptrend, held for several days, not extended.
      AND COALESCE(h.n_days, 0) >= ${cfg.histDays}
      AND tm.technical_score >= ${cfg.techMin}
      AND COALESCE(h.strong_days, 0) >= ${cfg.strongDays}
      AND tm.price_change_1m >= 0
      AND tm.price_change_1w <= ${cfg.max1w}
      -- Liquidity and size, currency-aware.
      AND tm.price >= ${PRICE_FLOOR_SQL}
      AND (tm.market_cap IS NULL OR tm.market_cap >= ${MCAP_FLOOR_SQL})
      AND (tm.avg_dollar_vol_20d IS NULL OR tm.avg_dollar_vol_20d >= ${TURNOVER_FLOOR_SQL})
      -- No repeats inside the cooldown window. Over the prior 22 report days
      -- MDKA.JK appeared 5x, IONQ and ATAI 4x each.
      --
      -- The upper bound excludes TODAY deliberately: picks are recorded
      -- before the send, so without it a same-day re-run (workflow_dispatch,
      -- or a retry after a Telegram failure) would filter out everything it
      -- just wrote and produce a different, near-empty list. The screen must
      -- be idempotent within a day.
      AND NOT EXISTS (
        SELECT 1 FROM momentum_report_picks p
        WHERE p.ticker = tm.ticker
          AND p.reported = 1
          AND p.report_date >= date(?, '-${cfg.cooldownDays} day')
          AND p.report_date < ?
      )`;
}

/**
 * Builds the selection query and its bound arguments.
 *
 * Exported so a test can assert that the `?` count matches the arg count
 * without needing a database. The clauses are assembled from three separate
 * string builders, so a placeholder added in one and not counted in the other
 * would silently shift every subsequent binding — a failure that surfaces as
 * wrong picks rather than an error.
 */
export function buildSelectionQuery(
  priorDate: string,
  today: string,
  cfg: typeof MOMENTUM_REPORT_CONFIG = MOMENTUM_REPORT_CONFIG,
): { from: string; where: string; args: string[] } {
  return {
    from: buildFromClause(cfg),
    where: buildWhereClause(cfg),
    // Order matches the ? placeholders in SQL text order: snapshot join,
    // hist window upper bound, hist window lower bound, cooldown lower bound,
    // cooldown upper bound.
    args: [priorDate, today, today, today, today],
  };
}

/**
 * Runs the screen and returns the qualifying picks, most structurally sound
 * first. Does not send anything and does not write picks — see recordPicks.
 */
export async function selectMomentumPicks(
  cfg: typeof MOMENTUM_REPORT_CONFIG = MOMENTUM_REPORT_CONFIG,
): Promise<MomentumReportResult> {
  const today = new Date().toISOString().split("T")[0];

  const dates = await db
    .select({ date: momentumSnapshots.snapshotDate })
    .from(momentumSnapshots)
    .where(sql`snapshot_date < ${today}`)
    .groupBy(momentumSnapshots.snapshotDate)
    .orderBy(desc(momentumSnapshots.snapshotDate))
    .limit(1);

  if (dates.length === 0) {
    return { gainers: [], candidates: [], count: 0, priorDate: null, today, funnel: null };
  }

  const priorDate = dates[0].date;
  const { from, where, args } = buildSelectionQuery(priorDate, today, cfg);

  // Deterministic ordering. The old query had no tie-break at all, so with
  // integer-rounded deltas the top-10 composition varied arbitrarily run to run.
  //
  // The band is applied AFTER this query rather than inside it. Because the
  // band is a filter and not a sort key, filtering-then-ordering and
  // ordering-then-filtering give the same top N — but doing it this way lets a
  // single query return both the reported picks and the wider candidate set.
  const orderBy = `
    ORDER BY tm.technical_score DESC,
             tm.momentum_score DESC,
             tm.price_change_1m DESC,
             tm.ticker ASC
    LIMIT ${CANDIDATE_CAP}`;

  const selectCols = `
    tm.ticker,
    su.name AS name,
    su.currency AS currency,
    tm.price,
    tm.momentum_score,
    tm.technical_score,
    tm.price_change_1d,
    tm.price_change_1w,
    tm.price_change_1m,
    ms.momentum_score AS yesterday_score,
    (tm.momentum_score - ms.momentum_score) AS momentum_delta`;

  const rows = await rawClient.execute({
    sql: `SELECT ${selectCols} ${from} ${where} ${orderBy}`,
    args,
  });

  const candidates = rows.rows as unknown as MomentumPick[];
  const inBand = (p: MomentumPick) =>
    p.momentum_score !== null &&
    p.momentum_score >= cfg.momMin &&
    p.momentum_score <= cfg.momMax;
  const gainers = candidates.filter(inBand).slice(0, cfg.limit);

  // Funnel counts, so an empty list is distinguishable from a broken pipeline.
  const scalar = async (s: string, a: unknown[] = []) =>
    Number((await rawClient.execute({ sql: s, args: a as never[] })).rows[0].n ?? 0);

  const funnel = {
    universe: await scalar("SELECT COUNT(*) n FROM ticker_metrics"),
    ok: await scalar("SELECT COUNT(*) n FROM ticker_metrics WHERE data_quality = 'ok'"),
    qualified: await scalar(`SELECT COUNT(*) n ${from} ${where}`, args),
    inBand: candidates.filter(inBand).length,
  };

  return { gainers, candidates, count: gainers.length, priorDate, today, funnel };
}

/**
 * Persists the day's candidates, flagging which ones were actually sent.
 *
 * Must run BEFORE the Telegram send so a messaging failure cannot cost the
 * record, and so the cooldown gate sees today's selections. `price` is the
 * forward-return anchor.
 *
 * Delete-then-insert in one transaction so a same-day re-run is last-run-wins.
 * `ticker_metrics` is rewritten hourly by the scanner, so a retry an hour later
 * selects from different data; an upsert would merge the two runs, leaving
 * stale ranks and stranding `reported = 1` on names the retry dropped —
 * corrupting exactly the forward-return record this table exists to provide.
 */
export async function recordPicks(
  candidates: MomentumPick[],
  reported: MomentumPick[],
  reportDate: string,
): Promise<void> {
  const reportedTickers = new Set(reported.map((p) => p.ticker));
  const reportedRank = new Map(reported.map((p, i) => [p.ticker, i + 1]));

  await rawClient.batch(
    [
      {
        sql: "DELETE FROM momentum_report_picks WHERE report_date = ?",
        args: [reportDate] as never[],
      },
      ...candidates.map((p, i) => ({
        sql: `INSERT INTO momentum_report_picks
                (ticker, report_date, rank, reported, momentum_score, technical_score,
                 momentum_delta, price, currency, price_change_1d,
                 price_change_1w, price_change_1m)
              VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
        args: [
          p.ticker, reportDate,
          reportedRank.get(p.ticker) ?? i + 1,
          reportedTickers.has(p.ticker) ? 1 : 0,
          p.momentum_score ?? null, p.technical_score ?? null, p.momentum_delta ?? null,
          p.price ?? null, p.currency ?? null,
          p.price_change_1d ?? null, p.price_change_1w ?? null, p.price_change_1m ?? null,
        ] as never[],
      })),
    ],
    "write",
  );
}
