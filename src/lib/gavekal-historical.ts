/**
 * Historical Gavekal regime computation using monthly data 1928–present.
 *
 * Reads `_M`-suffixed monthly series from gavekal_prices (seeded by
 * scripts/seed-gavekal-historical.ts) and computes the four-quadrant regime
 * classification using an 84-month (~7-year) moving average — same window
 * as the live weekly pipeline, just at monthly resolution.
 *
 * Returns regime change points suitable for the RegimeTimeline UI.
 */

import { db, gavekalPrices, gavekalHistoricalSnapshot } from "@/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";
import type { GavekalQuadrantName, GavekalRegimePoint } from "./gavekal";

const LOG_SRC = "lib/gavekal-historical";
const HISTORICAL_MA_MONTHS = 84; // 7 years × 12
// Pre-1971 the bond/gold ratio is structurally degenerate (gold was at fixed
// legal price under Bretton Woods, so the "currency quality" axis can't
// signal currency debasement). We start the warmup window in 1964-01 so the
// 84-month MA produces its first valid value at 1971-01 — clean post-Bretton
// Woods cutoff for both the regime timeline and the ratio charts.
const HISTORY_START_DATE = "1964-01-01";
const DISPLAY_START_DATE = "1971-01-01";

const QUADRANT_BY_KEY: Record<string, GavekalQuadrantName> = {
  "1,1": "Deflationary Boom",
  "1,-1": "Inflationary Boom",
  "-1,1": "Deflationary Bust",
  "-1,-1": "Inflationary Bust",
};

interface MonthlyPoint {
  date: string; // YYYY-MM-DD
  close: number;
}

async function loadMonthly(symbol: string): Promise<MonthlyPoint[]> {
  try {
    return await db
      .select({ date: gavekalPrices.date, close: gavekalPrices.close })
      .from(gavekalPrices)
      .where(eq(gavekalPrices.symbol, symbol))
      .orderBy(gavekalPrices.date);
  } catch (error) {
    logger.error(LOG_SRC, `Failed to load ${symbol}`, { error });
    return [];
  }
}

function computeMonthlyMA(values: number[], window: number): (number | null)[] {
  const result: (number | null)[] = [];
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= window) sum -= values[i - window];
    result.push(i < window - 1 ? null : sum / window);
  }
  return result;
}

interface AlignedRow {
  date: string;
  energy: number; // S&P 500 / WTI
  currency: number; // UST10Y / Gold
}

/**
 * Align the four monthly series by date. Drops months where any series is
 * missing (e.g., the very first / last month boundaries).
 */
function alignMonthly(
  spx: MonthlyPoint[],
  wti: MonthlyPoint[],
  gold: MonthlyPoint[],
  ust: MonthlyPoint[],
): AlignedRow[] {
  const wtiMap = new Map(wti.map((p) => [p.date, p.close]));
  const goldMap = new Map(gold.map((p) => [p.date, p.close]));
  const ustMap = new Map(ust.map((p) => [p.date, p.close]));

  const out: AlignedRow[] = [];
  for (const sp of spx) {
    if (sp.date < HISTORY_START_DATE) continue;
    const w = wtiMap.get(sp.date);
    const g = goldMap.get(sp.date);
    const u = ustMap.get(sp.date);
    if (w == null || g == null || u == null) continue;
    if (w <= 0 || g <= 0 || u <= 0) continue;
    out.push({
      date: sp.date,
      energy: sp.close / w,
      currency: u / g,
    });
  }
  return out;
}

interface ComputedHistoricalSeries {
  aligned: AlignedRow[];
  energyValues: number[];
  currencyValues: number[];
  energyMA: (number | null)[];
  currencyMA: (number | null)[];
}

async function computeHistoricalSeries(): Promise<ComputedHistoricalSeries | null> {
  const [spx, wti, gold, ust] = await Promise.all([
    loadMonthly("^GSPC_M"),
    loadMonthly("WTI_M"),
    loadMonthly("GOLD_M"),
    loadMonthly("UST10Y_M"),
  ]);

  if (
    spx.length < HISTORICAL_MA_MONTHS ||
    wti.length < HISTORICAL_MA_MONTHS ||
    gold.length < HISTORICAL_MA_MONTHS ||
    ust.length < HISTORICAL_MA_MONTHS
  ) {
    logger.warn(
      LOG_SRC,
      `Insufficient historical data: spx=${spx.length} wti=${wti.length} gold=${gold.length} ust=${ust.length}`,
    );
    return null;
  }

  const aligned = alignMonthly(spx, wti, gold, ust);
  if (aligned.length < HISTORICAL_MA_MONTHS) return null;

  const energyValues = aligned.map((r) => r.energy);
  const currencyValues = aligned.map((r) => r.currency);
  const energyMA = computeMonthlyMA(energyValues, HISTORICAL_MA_MONTHS);
  const currencyMA = computeMonthlyMA(currencyValues, HISTORICAL_MA_MONTHS);

  return { aligned, energyValues, currencyValues, energyMA, currencyMA };
}

// ── Materialized snapshot (read/write) ─────────────────────────────────────
//
// `computeHistoricalSeries()` is purely a function of immutable past prices,
// so we cache its output in `gavekal_historical_snapshot`. The read paths
// below try the snapshot first; on miss they call `backfillHistoricalSnapshot`
// which runs the live computation once and persists the result. Subsequent
// requests serve from the table directly.

interface SnapshotRow {
  date: string;
  energyRatio: number;
  currencyRatio: number;
  energyMa: number | null;
  currencyMa: number | null;
  regime: GavekalQuadrantName;
}

async function loadSnapshot(): Promise<SnapshotRow[] | null> {
  try {
    const rows = await db
      .select()
      .from(gavekalHistoricalSnapshot)
      .orderBy(gavekalHistoricalSnapshot.date);
    if (rows.length === 0) return null;
    return rows.map((r) => ({
      date: r.date,
      energyRatio: r.energyRatio,
      currencyRatio: r.currencyRatio,
      energyMa: r.energyMa,
      currencyMa: r.currencyMa,
      regime: r.regime as GavekalQuadrantName,
    }));
  } catch (error) {
    logger.error(LOG_SRC, "Failed to load historical snapshot", { error });
    return null;
  }
}

/**
 * Compute the historical series from raw monthly prices and persist the
 * full output to `gavekal_historical_snapshot`. Idempotent: clears the
 * table first, then bulk-inserts. Safe to re-run any time.
 *
 * Returns the rows that were written, or null if the source monthly
 * tables aren't seeded yet (caller should fall back to live computation).
 */
export async function backfillHistoricalSnapshot(): Promise<
  SnapshotRow[] | null
> {
  try {
    const series = await computeHistoricalSeries();
    if (!series) {
      logger.warn(
        LOG_SRC,
        "Cannot backfill snapshot: source monthly tables are missing or sparse",
      );
      return null;
    }

    const { aligned, energyValues, currencyValues, energyMA, currencyMA } =
      series;

    const rows: SnapshotRow[] = [];
    for (let i = 0; i < aligned.length; i++) {
      if (aligned[i].date < DISPLAY_START_DATE) continue;
      const eMa = energyMA[i];
      const cMa = currencyMA[i];

      let regime: GavekalQuadrantName = "Inflationary Bust";
      if (eMa !== null && cMa !== null) {
        const eSignal = energyValues[i] > eMa ? 1 : -1;
        const cSignal = currencyValues[i] > cMa ? 1 : -1;
        regime =
          QUADRANT_BY_KEY[`${eSignal},${cSignal}`] ?? "Inflationary Bust";
      }

      rows.push({
        date: aligned[i].date,
        energyRatio: Math.round(energyValues[i] * 10000) / 10000,
        currencyRatio: Math.round(currencyValues[i] * 10000) / 10000,
        energyMa: eMa !== null ? Math.round(eMa * 10000) / 10000 : null,
        currencyMa: cMa !== null ? Math.round(cMa * 10000) / 10000 : null,
        regime,
      });
    }

    if (rows.length === 0) {
      logger.warn(LOG_SRC, "Backfill produced 0 rows — nothing to persist");
      return null;
    }

    // Clear-and-insert (simpler than upsert; the dataset is ~700 rows so
    // the cost is negligible and idempotency is bulletproof).
    await db.delete(gavekalHistoricalSnapshot);

    // SQLite max bound parameters is ~999 per statement. 6 fields × 100 rows
    // = 600 params per batch — well under the limit.
    const BATCH_SIZE = 100;
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      await db.insert(gavekalHistoricalSnapshot).values(batch);
    }

    logger.info(
      LOG_SRC,
      `Backfilled ${rows.length} rows into historical snapshot`,
    );
    return rows;
  } catch (error) {
    logger.error(LOG_SRC, "backfillHistoricalSnapshot failed", { error });
    return null;
  }
}

/**
 * Build the long-history regime change list. Snapshot-first; on miss, runs
 * the live computation once via `backfillHistoricalSnapshot()` and serves
 * the result from the resulting in-memory rows. Falls back to a direct live
 * computation only if the snapshot can't be built (e.g. source tables sparse).
 */
export async function loadHistoricalRegimeHistory(): Promise<
  GavekalRegimePoint[]
> {
  let snapshot = await loadSnapshot();
  if (!snapshot) {
    snapshot = await backfillHistoricalSnapshot();
  }
  if (snapshot) {
    return collapseToRegimePoints(snapshot);
  }

  // Fallback: live computation if snapshot couldn't be built at all.
  const series = await computeHistoricalSeries();
  if (!series) return [];

  const { aligned, energyValues, currencyValues, energyMA, currencyMA } =
    series;
  const points: GavekalRegimePoint[] = [];
  let lastQuadrant: GavekalQuadrantName | null = null;

  for (let i = 0; i < aligned.length; i++) {
    if (aligned[i].date < DISPLAY_START_DATE) continue;
    const eMa = energyMA[i];
    const cMa = currencyMA[i];
    if (eMa === null || cMa === null) continue;

    const eSignal = energyValues[i] > eMa ? 1 : -1;
    const cSignal = currencyValues[i] > cMa ? 1 : -1;
    const key = `${eSignal},${cSignal}`;
    const q = QUADRANT_BY_KEY[key] ?? "Inflationary Bust";

    if (q !== lastQuadrant) {
      points.push({ date: aligned[i].date, quadrant: q });
      lastQuadrant = q;
    }
  }

  logger.info(
    LOG_SRC,
    `Built historical regime history (live fallback): ${points.length} regime changes from ${aligned.length} monthly points`,
  );
  return points;
}

function collapseToRegimePoints(snapshot: SnapshotRow[]): GavekalRegimePoint[] {
  const points: GavekalRegimePoint[] = [];
  let lastQuadrant: GavekalQuadrantName | null = null;
  for (const row of snapshot) {
    if (row.date < DISPLAY_START_DATE) continue;
    if (row.energyMa === null || row.currencyMa === null) continue;
    if (row.regime !== lastQuadrant) {
      points.push({ date: row.date, quadrant: row.regime });
      lastQuadrant = row.regime;
    }
  }
  return points;
}

/**
 * Build long-history monthly history arrays for the energy and currency
 * ratios, suitable for use as `GavekalRatio.history` in the RatioChart UI.
 * Snapshot-first; on miss, runs the live computation via
 * `backfillHistoricalSnapshot()`. Returns null only if the snapshot can't
 * be built at all (e.g. source monthly tables aren't seeded).
 */
export async function loadHistoricalRatioHistories(): Promise<{
  energy: { date: string; value: number; ma: number | null }[];
  currency: { date: string; value: number; ma: number | null }[];
} | null> {
  let snapshot = await loadSnapshot();
  if (!snapshot) {
    snapshot = await backfillHistoricalSnapshot();
  }
  if (!snapshot) return null;

  const energy: { date: string; value: number; ma: number | null }[] = [];
  const currency: { date: string; value: number; ma: number | null }[] = [];

  for (const row of snapshot) {
    if (row.date < DISPLAY_START_DATE) continue;
    energy.push({
      date: row.date,
      value: row.energyRatio,
      ma: row.energyMa,
    });
    currency.push({
      date: row.date,
      value: row.currencyRatio,
      ma: row.currencyMa,
    });
  }

  logger.info(
    LOG_SRC,
    `Loaded historical ratio histories from snapshot: ${energy.length} monthly points each`,
  );
  return { energy, currency };
}
