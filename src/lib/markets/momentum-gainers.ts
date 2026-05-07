import { db, rawClient, tickerMetrics, momentumSnapshots } from "@/db";
import { sql, desc } from "drizzle-orm";

interface SnapshotResult {
  tickersSnapshotted: number;
  snapshotDate: string;
}

interface MomentumGainer {
  ticker: string;
  momentumScore: number | null;
  momentumDelta: number | null; // today's score - yesterday's score
  technicalScore: number | null;
  price: number | null;
  yesterdayScore: number | null;
}

/**
 * Takes a daily snapshot of current tickerMetrics momentum/technical scores.
 * Writes them to momentum_snapshots for today's date.
 */
export async function takeMomentumSnapshot(): Promise<SnapshotResult> {
  const today = new Date().toISOString().split("T")[0];

  const metrics = await db
    .select({
      ticker: tickerMetrics.ticker,
      momentumScore: tickerMetrics.momentumScore,
      technicalScore: tickerMetrics.technicalScore,
    })
    .from(tickerMetrics);

  if (metrics.length === 0) {
    return { tickersSnapshotted: 0, snapshotDate: today };
  }

  // Batch upsert via raw SQL — one transaction, one round-trip.
  // Build a VALUES list with all tickers and use ON CONFLICT upsert.
  const placeholders = metrics.map(() => "(?, ?, ?, ?)").join(", ");
  const args: (string | number | null)[] = [];
  for (const m of metrics) {
    args.push(m.ticker, m.momentumScore ?? null, m.technicalScore ?? null, today);
  }

  await rawClient.execute({
    sql: `INSERT INTO momentum_snapshots (ticker, momentum_score, technical_score, snapshot_date) VALUES ${placeholders} ON CONFLICT(ticker, snapshot_date) DO UPDATE SET momentum_score = excluded.momentum_score, technical_score = excluded.technical_score`,
    args,
  });

  return { tickersSnapshotted: metrics.length, snapshotDate: today };
}

/**
 * Returns the top N gainers by day-over-day momentumScore delta.
 * Compares today's snapshot with the most recent prior snapshot.
 */
export async function getMomentumGainers(
  limit: number = 20,
): Promise<MomentumGainer[]> {
  const today = new Date().toISOString().split("T")[0];

  // Find the most recent prior snapshot date
  const priorDates = await db
    .select({ date: momentumSnapshots.snapshotDate })
    .from(momentumSnapshots)
    .where(sql`snapshot_date < ${today}`)
    .orderBy(desc(momentumSnapshots.snapshotDate))
    .limit(1);

  if (priorDates.length === 0) {
    return []; // No prior snapshot to compare against
  }

  const priorDate = priorDates[0].date;

  // Join today's metrics with the prior snapshot
  const rows = await rawClient.execute({
    sql: `
      SELECT 
        tm.ticker,
        tm.momentum_score,
        tm.price,
        tm.technical_score,
        ms.momentum_score AS yesterday_score,
        (tm.momentum_score - ms.momentum_score) AS momentum_delta
      FROM ticker_metrics tm
      JOIN momentum_snapshots ms ON ms.ticker = tm.ticker
      WHERE ms.snapshot_date = ?
        AND tm.momentum_score IS NOT NULL
        AND ms.momentum_score IS NOT NULL
      ORDER BY momentum_delta DESC
      LIMIT ?
    `,
    args: [priorDate, limit],
  });

  return rows.rows as unknown as MomentumGainer[];
}

/**
 * Returns momentum deltas (today - yesterday) for ALL tickers in a Map.
 * Tickers with no prior snapshot have null delta/yesterdayScore.
 */
export async function getMomentumDeltas(): Promise<
  Map<
    string,
    {
      momentumDelta: number | null;
      todayScore: number | null;
      yesterdayScore: number | null;
    }
  >
> {
  const today = new Date().toISOString().split("T")[0];

  // Get the most recent prior snapshot date
  const dates = await db
    .select({ date: momentumSnapshots.snapshotDate })
    .from(momentumSnapshots)
    .where(sql`snapshot_date < ${today}`)
    .orderBy(desc(momentumSnapshots.snapshotDate))
    .limit(1);

  if (dates.length === 0) return new Map();
  const priorDate = dates[0].date;

  const rows = await rawClient.execute({
    sql: `
      SELECT 
        tm.ticker,
        tm.momentum_score AS today_score,
        ms.momentum_score AS yesterday_score,
        (tm.momentum_score - ms.momentum_score) AS momentum_delta
      FROM ticker_metrics tm
      LEFT JOIN momentum_snapshots ms ON ms.ticker = tm.ticker AND ms.snapshot_date = ?
    `,
    args: [priorDate],
  });

  const map = new Map<
    string,
    {
      momentumDelta: number | null;
      todayScore: number | null;
      yesterdayScore: number | null;
    }
  >();
  for (const row of rows.rows as any[]) {
    map.set(row.ticker, {
      momentumDelta: row.momentum_delta ?? null,
      todayScore: row.today_score ?? null,
      yesterdayScore: row.yesterday_score ?? null,
    });
  }
  return map;
}
