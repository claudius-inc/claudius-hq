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

import { db, gavekalPrices } from "@/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";
import type { GavekalQuadrantName, GavekalRegimePoint } from "./gavekal";

const LOG_SRC = "lib/gavekal-historical";
const HISTORICAL_MA_MONTHS = 84; // 7 years × 12

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

/**
 * Build the long-history regime change list from the seeded monthly tables.
 * Returns an empty array if any series is missing — caller should fall back
 * to the live (short) regime history.
 */
export async function loadHistoricalRegimeHistory(): Promise<
  GavekalRegimePoint[]
> {
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
    return [];
  }

  const aligned = alignMonthly(spx, wti, gold, ust);
  if (aligned.length < HISTORICAL_MA_MONTHS) return [];

  const energyValues = aligned.map((r) => r.energy);
  const currencyValues = aligned.map((r) => r.currency);
  const energyMA = computeMonthlyMA(energyValues, HISTORICAL_MA_MONTHS);
  const currencyMA = computeMonthlyMA(currencyValues, HISTORICAL_MA_MONTHS);

  const points: GavekalRegimePoint[] = [];
  let lastQuadrant: GavekalQuadrantName | null = null;

  for (let i = 0; i < aligned.length; i++) {
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
    `Built historical regime history: ${points.length} regime changes from ${aligned.length} monthly points`,
  );
  return points;
}
