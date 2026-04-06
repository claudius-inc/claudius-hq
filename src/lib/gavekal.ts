/**
 * Gavekal Four Quadrants Framework
 *
 * Charles Gave's (1978, updated Oct 2024) macro framework divides
 * the economic environment into four states using two axes:
 *
 * Horizontal — Energy Efficiency: S&P 500 / WTI vs 7-year MA
 * Vertical   — Currency Quality:  10Y UST total return (IEF) / Gold vs 7-year MA
 *
 * Pipeline features:
 * - DB-backed daily price storage (gavekal_prices table)
 * - Incremental data seeding with 10+ year history
 * - Data validation and anomaly detection
 * - Historical quadrant regime time series
 * - Configurable lookback periods
 * - Per-symbol error isolation with fallback to Yahoo API
 * - S&P/Gold trend analysis
 */

import YahooFinance from "yahoo-finance2";
import { db, gavekalPrices } from "@/db";
import { eq, and, gte, desc } from "drizzle-orm";
import { logger } from "./logger";

const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

const LOG_SRC = "lib/gavekal";

// ── Constants ──────────────────────────────────────────────────────────────

const GAVEKAL_SYMBOLS = ["^GSPC", "CL=F", "GC=F", "IEF"] as const;
type GavekalSymbol = (typeof GAVEKAL_SYMBOLS)[number];

const DEFAULT_MA_WEEKS = 365; // ~7 years in weekly data
const SEED_YEARS = 12; // Fetch 12 years to ensure 10+ years of MA coverage
const RATE_LIMIT_MS = 400;

// ── Types ───────────────────────────────────────────────────────────────────

export type GavekalQuadrantName =
  | "Deflationary Boom"
  | "Inflationary Boom"
  | "Deflationary Bust"
  | "Inflationary Bust";

export interface GavekalQuadrant {
  name: GavekalQuadrantName;
  score: number; // +2, 0, -2
  color: string; // tailwind class
  description: string;
  buySignals: string[];
  sellSignals: string[];
}

export interface GavekalRatio {
  label: string;
  current: number;
  ma7y: number;
  signal: 1 | -1;
  history: { date: string; value: number; ma: number | null }[];
}

export interface GavekalExclusion {
  name: string;
  signal: string;
  description: string;
}

export interface GavekalRegimePoint {
  date: string;
  quadrant: GavekalQuadrantName;
}

export interface GavekalXleData {
  price: number | null;
  changePercent: number | null;
  xleSpyRatio: number | null;
  trailingPE: number | null;
  dividendYield: number | null;
}

export interface GavekalChangeEvent {
  date: string;
  type: "crossover" | "threshold" | "regime_change";
  signal: string;
  description: string;
}

export interface GavekalRegimeReturns {
  equities: number;
  bonds: number;
  gold: number;
  commodities: number;
  cash: number;
}

export interface GavekalDataQuality {
  symbolStatus: Record<string, "ok" | "stale" | "missing">;
  dataPoints: number;
  oldestDate: string;
  newestDate: string;
  source: "db" | "api" | "mixed";
}

export interface GavekalData {
  quadrant: GavekalQuadrant;
  energyEfficiency: GavekalRatio;
  currencyQuality: GavekalRatio;
  keyRatios: {
    spGold: { current: number; ma7y: number };
    goldWti: { current: number; ma7y: number };
  };
  exclusions: GavekalExclusion[];
  regimeHistory: GavekalRegimePoint[];
  dataQuality?: GavekalDataQuality;
  xle?: GavekalXleData;
  changelog?: GavekalChangeEvent[];
  regimeReturns?: Record<string, GavekalRegimeReturns>;
  updatedAt: string;
}

// ── Quadrant definitions ────────────────────────────────────────────────────

const QUADRANTS: Record<string, GavekalQuadrant> = {
  "1,1": {
    name: "Deflationary Boom",
    score: 2,
    color: "bg-emerald-100 border-emerald-300 text-emerald-800",
    description: "Energy efficient + good currency — best for capitalism",
    buySignals: [
      "Growth equities",
      "Long-duration assets",
      "Corporate bonds",
      "Real estate",
    ],
    sellSignals: ["Gold", "Commodities", "Cash"],
  },
  "1,-1": {
    name: "Inflationary Boom",
    score: 0,
    color: "bg-orange-100 border-orange-300 text-orange-800",
    description: "Energy efficient + bad currency — nominal growth, real erosion",
    buySignals: [
      "Gold & commodities",
      "Real estate",
      "Value stocks",
      "EM equities",
    ],
    sellSignals: ["Long-term bonds", "Cash", "Growth equities"],
  },
  "-1,1": {
    name: "Deflationary Bust",
    score: 0,
    color: "bg-blue-100 border-blue-300 text-blue-800",
    description: "Energy inefficient + good currency — recession risk",
    buySignals: [
      "Safe government bonds",
      "Cash",
      "Defensive equities",
    ],
    sellSignals: ["Cyclicals", "Commodities", "Real estate"],
  },
  "-1,-1": {
    name: "Inflationary Bust",
    score: -2,
    color: "bg-red-100 border-red-300 text-red-800",
    description: "Energy inefficient + bad currency — stagflation, worst scenario",
    buySignals: [
      "Cash (safest currency)",
      "Energy stocks",
      "Short-duration TIPS",
    ],
    sellSignals: [
      "All financial assets",
      "Long-duration bonds",
      "Growth equities",
    ],
  },
};

// ── Helpers ─────────────────────────────────────────────────────────────────

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toWeekKey(d: string): string {
  const date = new Date(d);
  const y = date.getFullYear();
  const start = new Date(y, 0, 1);
  const wk = Math.ceil(
    ((date.getTime() - start.getTime()) / 86400000 + start.getDay() + 1) / 7,
  );
  return `${y}-${String(wk).padStart(2, "0")}`;
}

// ── Data validation ────────────────────────────────────────────────────────

function validatePrice(symbol: string, price: number): boolean {
  if (!isFinite(price) || price <= 0) return false;
  const bounds: Record<string, [number, number]> = {
    "^GSPC": [100, 20000],
    "CL=F": [1, 500],
    "GC=F": [100, 10000],
    "IEF": [50, 200],
  };
  const [min, max] = bounds[symbol] ?? [0, Infinity];
  return price >= min && price <= max;
}

// ── Yahoo Finance API fetching ─────────────────────────────────────────────

interface HistoricalRow {
  date: Date;
  close: number | null;
}

interface DailyPrice {
  date: Date;
  close: number;
}

async function fetchDailyHistoryFromApi(
  symbol: string,
  years: number,
): Promise<DailyPrice[]> {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setFullYear(startDate.getFullYear() - years);

  try {
    const chart = (await yahooFinance.chart(symbol, {
      period1: startDate,
      period2: endDate,
      interval: "1d",
    })) as { quotes?: HistoricalRow[] };

    const prices = (chart.quotes || [])
      .filter(
        (q): q is { date: Date; close: number } =>
          q.close !== null && validatePrice(symbol, q.close),
      )
      .map((q) => ({ date: q.date, close: q.close }));

    logger.info(LOG_SRC, `Fetched ${prices.length} daily prices for ${symbol} from Yahoo`);
    return prices;
  } catch (error) {
    logger.error(LOG_SRC, `Failed to fetch ${symbol} history from Yahoo`, { error });
    return [];
  }
}

async function fetchWeeklyHistoryFromApi(
  symbol: string,
  years: number = 10,
): Promise<{ date: Date; close: number }[]> {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setFullYear(startDate.getFullYear() - years);

  try {
    const chart = (await yahooFinance.chart(symbol, {
      period1: startDate,
      period2: endDate,
      interval: "1wk",
    })) as { quotes?: HistoricalRow[] };

    return (chart.quotes || [])
      .filter(
        (q): q is { date: Date; close: number } =>
          q.close !== null && validatePrice(symbol, q.close),
      )
      .map((q) => ({ date: q.date, close: q.close }));
  } catch (error) {
    logger.error(LOG_SRC, `Failed to fetch ${symbol} weekly history`, { error });
    return [];
  }
}

// ── DB operations ──────────────────────────────────────────────────────────

async function getStoredPrices(
  symbol: string,
  fromDate?: string,
): Promise<{ date: string; close: number }[]> {
  try {
    const conditions = [eq(gavekalPrices.symbol, symbol)];
    if (fromDate) {
      conditions.push(gte(gavekalPrices.date, fromDate));
    }
    return await db
      .select({ date: gavekalPrices.date, close: gavekalPrices.close })
      .from(gavekalPrices)
      .where(and(...conditions))
      .orderBy(gavekalPrices.date);
  } catch (error) {
    logger.error(LOG_SRC, `Failed to read stored prices for ${symbol}`, { error });
    return [];
  }
}

async function getLatestStoredDate(symbol: string): Promise<string | null> {
  try {
    const rows = await db
      .select({ date: gavekalPrices.date })
      .from(gavekalPrices)
      .where(eq(gavekalPrices.symbol, symbol))
      .orderBy(desc(gavekalPrices.date))
      .limit(1);
    return rows.length > 0 ? rows[0].date : null;
  } catch (error) {
    logger.error(LOG_SRC, `Failed to get latest date for ${symbol}`, { error });
    return null;
  }
}

async function storePrices(symbol: string, prices: DailyPrice[]): Promise<number> {
  if (prices.length === 0) return 0;
  try {
    const BATCH_SIZE = 200;
    let inserted = 0;
    for (let i = 0; i < prices.length; i += BATCH_SIZE) {
      const batch = prices.slice(i, i + BATCH_SIZE).map((p) => ({
        symbol,
        date: p.date.toISOString().split("T")[0],
        close: p.close,
      }));
      await db.insert(gavekalPrices).values(batch).onConflictDoNothing();
      inserted += batch.length;
    }
    logger.info(LOG_SRC, `Stored ${inserted} prices for ${symbol}`);
    return inserted;
  } catch (error) {
    logger.error(LOG_SRC, `Failed to store prices for ${symbol}`, { error });
    return 0;
  }
}

// ── Data seeding ───────────────────────────────────────────────────────────

/**
 * Seed or incrementally update daily price data for all Gavekal symbols.
 * First run fetches 12 years of daily data; subsequent runs are incremental.
 */
export async function seedGavekalData(): Promise<{
  seeded: Record<string, number>;
  errors: string[];
}> {
  const seeded: Record<string, number> = {};
  const errors: string[] = [];

  for (const symbol of GAVEKAL_SYMBOLS) {
    try {
      const latestDate = await getLatestStoredDate(symbol);

      let yearsToFetch = SEED_YEARS;
      if (latestDate) {
        const daysSinceLast = Math.ceil(
          (Date.now() - new Date(latestDate).getTime()) / (1000 * 60 * 60 * 24),
        );
        if (daysSinceLast <= 1) {
          seeded[symbol] = 0;
          continue;
        }
        yearsToFetch = Math.max(1, Math.ceil(daysSinceLast / 365));
      }

      const prices = await fetchDailyHistoryFromApi(symbol, yearsToFetch);
      if (prices.length === 0) {
        errors.push(`No data returned for ${symbol}`);
        continue;
      }

      const count = await storePrices(symbol, prices);
      seeded[symbol] = count;
      await delay(RATE_LIMIT_MS);
    } catch (error) {
      const msg = `Failed to seed ${symbol}: ${error instanceof Error ? error.message : String(error)}`;
      errors.push(msg);
      logger.error(LOG_SRC, msg, { error });
    }
  }

  return { seeded, errors };
}

// ── Weekly aggregation ─────────────────────────────────────────────────────

interface WeeklyPoint {
  weekKey: string;
  date: string;
  close: number;
}

function dailyToWeekly(prices: { date: string; close: number }[]): WeeklyPoint[] {
  const weekMap = new Map<string, { date: string; close: number }>();
  for (const p of prices) {
    const wk = toWeekKey(p.date);
    weekMap.set(wk, p); // last trading day per week wins
  }
  return Array.from(weekMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([weekKey, p]) => ({ weekKey, date: p.date, close: p.close }));
}

function apiToWeekly(prices: { date: Date; close: number }[]): WeeklyPoint[] {
  return prices.map((p) => {
    const dateStr = p.date.toISOString().split("T")[0];
    return { weekKey: toWeekKey(dateStr), date: dateStr, close: p.close };
  });
}

// ── Data loading (DB-first with API fallback) ──────────────────────────────

async function loadWeeklyPrices(
  symbol: GavekalSymbol,
  years: number,
): Promise<{ prices: WeeklyPoint[]; source: "db" | "api" }> {
  const fromDate = new Date();
  fromDate.setFullYear(fromDate.getFullYear() - years);
  const fromDateStr = fromDate.toISOString().split("T")[0];

  // Try DB first
  const dbPrices = await getStoredPrices(symbol, fromDateStr);
  if (dbPrices.length > 52 * Math.max(1, years - 1)) {
    return { prices: dailyToWeekly(dbPrices), source: "db" };
  }

  // Fall back to Yahoo weekly API
  logger.info(LOG_SRC, `DB has ${dbPrices.length} rows for ${symbol}, falling back to Yahoo API`);
  const apiPrices = await fetchWeeklyHistoryFromApi(symbol, years);

  if (apiPrices.length > 0) {
    // Store daily data in background for future use
    fetchDailyHistoryFromApi(symbol, years)
      .then((daily) => storePrices(symbol, daily))
      .catch((e) => logger.error(LOG_SRC, `Background store failed for ${symbol}`, { error: e }));

    return { prices: apiToWeekly(apiPrices), source: "api" };
  }

  // Last resort: partial DB data
  if (dbPrices.length > 0) {
    logger.warn(LOG_SRC, `Using partial DB data for ${symbol} (${dbPrices.length} rows)`);
    return { prices: dailyToWeekly(dbPrices), source: "db" };
  }

  return { prices: [], source: "api" };
}

// ── Computation ─────────────────────────────────────────────────────────────

function computeMovingAverage(values: number[], window: number): (number | null)[] {
  const result: (number | null)[] = [];
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= window) sum -= values[i - window];
    result.push(i < window - 1 ? null : sum / window);
  }
  return result;
}

function alignWeeklySeries(
  a: WeeklyPoint[],
  b: WeeklyPoint[],
): { weekKey: string; date: string; aClose: number; bClose: number }[] {
  const bMap = new Map<string, number>();
  for (const row of b) bMap.set(row.weekKey, row.close);

  const aligned: { weekKey: string; date: string; aClose: number; bClose: number }[] = [];
  for (const row of a) {
    const bVal = bMap.get(row.weekKey);
    if (bVal !== undefined) {
      aligned.push({ weekKey: row.weekKey, date: row.date, aClose: row.close, bClose: bVal });
    }
  }
  return aligned;
}

function buildRatio(
  aligned: { weekKey: string; date: string; aClose: number; bClose: number }[],
  label: string,
  maWeeks: number,
): GavekalRatio {
  const ratios = aligned.map((r) => r.aClose / r.bClose);
  const mas = computeMovingAverage(ratios, maWeeks);

  // Build history (last 520 weeks ~ 10 years, sampled monthly for size)
  // Show ratio for all points; MA is null until the 7-year warmup completes
  const history: { date: string; value: number; ma: number | null }[] = [];
  for (let i = Math.max(0, ratios.length - 520); i < ratios.length; i += 4) {
    history.push({
      date: aligned[i].date,
      value: Math.round(ratios[i] * 10000) / 10000,
      ma: mas[i] !== null ? Math.round(mas[i]! * 10000) / 10000 : null,
    });
  }
  // Always include the last point
  const last = ratios.length - 1;
  if (last >= 0) {
    const lastDate = aligned[last].date;
    if (!history.length || history[history.length - 1].date !== lastDate) {
      history.push({
        date: lastDate,
        value: Math.round(ratios[last] * 10000) / 10000,
        ma: mas[last] !== null ? Math.round(mas[last]! * 10000) / 10000 : null,
      });
    }
  }

  const currentRatio = ratios[last] ?? 0;
  const currentMa = mas[last] ?? currentRatio;
  const signal: 1 | -1 = currentRatio > currentMa ? 1 : -1;

  return {
    label,
    current: Math.round(currentRatio * 10000) / 10000,
    ma7y: Math.round(currentMa * 10000) / 10000,
    signal,
    history,
  };
}

function buildRegimeHistory(
  energyHistory: GavekalRatio["history"],
  currencyHistory: GavekalRatio["history"],
): GavekalRegimePoint[] {
  const currencyByDate = new Map<string, { value: number; ma: number | null }>();
  for (const h of currencyHistory) {
    currencyByDate.set(h.date, { value: h.value, ma: h.ma });
  }

  const points: GavekalRegimePoint[] = [];
  let lastQuadrant: GavekalQuadrantName | null = null;

  for (const eh of energyHistory) {
    if (eh.ma === null) continue;
    const ch = currencyByDate.get(eh.date);
    if (!ch || ch.ma === null) continue;

    const eSignal = eh.value > eh.ma ? 1 : -1;
    const cSignal = ch.value > ch.ma ? 1 : -1;
    const key = `${eSignal},${cSignal}`;
    const q = QUADRANTS[key]?.name ?? "Inflationary Bust";

    if (q !== lastQuadrant) {
      points.push({ date: eh.date, quadrant: q });
      lastQuadrant = q;
    }
  }

  return points;
}

// ── Trend analysis for S&P/Gold ────────────────────────────────────────────

function analyzeTrend(
  ratios: number[],
  mas: (number | null)[],
): { direction: "rising" | "falling" | "flat"; strength: number } {
  const lookback = Math.min(13, ratios.length);
  if (lookback < 4) return { direction: "flat", strength: 0 };

  const recent = ratios.slice(-lookback);
  const change = (recent[recent.length - 1] - recent[0]) / recent[0];

  let direction: "rising" | "falling" | "flat";
  if (change > 0.02) direction = "rising";
  else if (change < -0.02) direction = "falling";
  else direction = "flat";

  const strength = Math.min(100, Math.round(Math.abs(change) * 500));
  return { direction, strength };
}

// ── Regime returns (hardcoded from Gave's published backtests) ─────────────

const REGIME_RETURNS: Record<string, GavekalRegimeReturns> = {
  "Deflationary Boom": { equities: 12, bonds: 6, gold: -2, commodities: -5, cash: 3 },
  "Inflationary Boom": { equities: 5, bonds: -2, gold: 15, commodities: 12, cash: 1 },
  "Deflationary Bust": { equities: -8, bonds: 10, gold: 3, commodities: -15, cash: 4 },
  "Inflationary Bust": { equities: -5, bonds: -8, gold: 20, commodities: 8, cash: 2 },
};

// ── XLE data fetching ─────────────────────────────────────────────────────

async function fetchXleData(): Promise<GavekalXleData | undefined> {
  try {
    const [xleQuote, spyQuote] = await Promise.all([
      yahooFinance.quote("XLE"),
      yahooFinance.quote("SPY"),
    ]);

    const xlePrice = (xleQuote as Record<string, unknown>).regularMarketPrice as number | undefined;
    const xlePrevClose = (xleQuote as Record<string, unknown>).regularMarketPreviousClose as number | undefined;
    const spyPrice = (spyQuote as Record<string, unknown>).regularMarketPrice as number | undefined;
    const xleTrailingPE = (xleQuote as Record<string, unknown>).trailingPE as number | undefined;
    const xleDividendYield = (xleQuote as Record<string, unknown>).dividendYield as number | undefined;

    const changePercent =
      xlePrice != null && xlePrevClose != null && xlePrevClose > 0
        ? ((xlePrice - xlePrevClose) / xlePrevClose) * 100
        : null;

    const xleSpyRatio =
      xlePrice != null && spyPrice != null && spyPrice > 0
        ? xlePrice / spyPrice
        : null;

    return {
      price: xlePrice ?? null,
      changePercent: changePercent != null ? Math.round(changePercent * 100) / 100 : null,
      xleSpyRatio: xleSpyRatio != null ? Math.round(xleSpyRatio * 10000) / 10000 : null,
      trailingPE: xleTrailingPE ?? null,
      dividendYield: xleDividendYield ?? null,
    };
  } catch (error) {
    logger.error(LOG_SRC, "Failed to fetch XLE data", { error });
    return undefined;
  }
}

// ── Changelog extraction ──────────────────────────────────────────────────

function extractChangelog(
  energyHistory: GavekalRatio["history"],
  currencyHistory: GavekalRatio["history"],
  goldWtiHistory: GavekalRatio["history"],
  regimeHistory: GavekalRegimePoint[],
): GavekalChangeEvent[] {
  const events: GavekalChangeEvent[] = [];

  // Detect energy efficiency crossovers (S&P/WTI vs 7yr MA)
  for (let i = 1; i < energyHistory.length; i++) {
    const prev = energyHistory[i - 1];
    const curr = energyHistory[i];
    if (prev.ma === null || curr.ma === null) continue;

    const prevAbove = prev.value > prev.ma;
    const currAbove = curr.value > curr.ma;
    if (prevAbove !== currAbove) {
      events.push({
        date: curr.date,
        type: "crossover",
        signal: currAbove ? "S&P/WTI above 7yr MA" : "S&P/WTI below 7yr MA",
        description: currAbove
          ? "Energy efficiency turned positive — favors equities over commodities"
          : "Energy efficiency turned negative — energy costs weighing on profits",
      });
    }
  }

  // Detect currency quality crossovers (IEF/Gold vs 7yr MA)
  for (let i = 1; i < currencyHistory.length; i++) {
    const prev = currencyHistory[i - 1];
    const curr = currencyHistory[i];
    if (prev.ma === null || curr.ma === null) continue;

    const prevAbove = prev.value > prev.ma;
    const currAbove = curr.value > curr.ma;
    if (prevAbove !== currAbove) {
      events.push({
        date: curr.date,
        type: "crossover",
        signal: currAbove ? "IEF/Gold above 7yr MA" : "IEF/Gold below 7yr MA",
        description: currAbove
          ? "Currency quality improved — bonds preferred over gold"
          : "Currency quality deteriorated — gold preferred over bonds",
      });
    }
  }

  // Detect Gold/WTI recession threshold crossings (1.2x MA)
  for (let i = 1; i < goldWtiHistory.length; i++) {
    const prev = goldWtiHistory[i - 1];
    const curr = goldWtiHistory[i];
    if (prev.ma === null || curr.ma === null) continue;

    const prevAboveThreshold = prev.value > prev.ma * 1.2;
    const currAboveThreshold = curr.value > curr.ma * 1.2;
    if (prevAboveThreshold !== currAboveThreshold) {
      events.push({
        date: curr.date,
        type: "threshold",
        signal: currAboveThreshold
          ? "Gold/WTI above recession threshold"
          : "Gold/WTI below recession threshold",
        description: currAboveThreshold
          ? "Gold/WTI ratio exceeded 1.2x its 7yr MA — recession warning activated"
          : "Gold/WTI ratio fell below 1.2x its 7yr MA — recession warning cleared",
      });
    }
  }

  // Detect regime changes
  for (const point of regimeHistory) {
    events.push({
      date: point.date,
      type: "regime_change",
      signal: `Regime → ${point.quadrant}`,
      description: `Quadrant shifted to ${point.quadrant}`,
    });
  }

  // Sort by date descending and return last 10
  events.sort((a, b) => b.date.localeCompare(a.date));
  return events.slice(0, 10);
}

// ── Main entry point ────────────────────────────────────────────────────────

export interface ComputeGavekalOptions {
  maWeeks?: number;
  historyYears?: number;
}

export async function computeGavekalQuadrant(
  options?: ComputeGavekalOptions,
): Promise<GavekalData> {
  const maWeeks = options?.maWeeks ?? DEFAULT_MA_WEEKS;
  const historyYears = options?.historyYears ?? 10;

  // Fetch all four series with per-symbol error isolation, plus XLE in parallel
  const [symbolResults, xleData] = await Promise.all([
    Promise.all(
      GAVEKAL_SYMBOLS.map(async (symbol) => {
        try {
          return { symbol, ...(await loadWeeklyPrices(symbol, historyYears)) };
        } catch (error) {
          logger.error(LOG_SRC, `Error loading ${symbol}`, { error });
          return { symbol, prices: [] as WeeklyPoint[], source: "api" as const };
        }
      }),
    ),
    fetchXleData(),
  ]);

  // Build data quality report
  const symbolStatus: Record<string, "ok" | "stale" | "missing"> = {};
  let oldestDate = "";
  let newestDate = "";
  let totalPoints = 0;
  const sources = new Set<string>();

  for (const { symbol, prices, source } of symbolResults) {
    sources.add(source);
    if (prices.length === 0) {
      symbolStatus[symbol] = "missing";
    } else {
      const lastDate = prices[prices.length - 1].date;
      const daysSince = Math.ceil(
        (Date.now() - new Date(lastDate).getTime()) / (1000 * 60 * 60 * 24),
      );
      symbolStatus[symbol] = daysSince > 7 ? "stale" : "ok";
      const firstDate = prices[0].date;
      if (!oldestDate || firstDate < oldestDate) oldestDate = firstDate;
      if (!newestDate || lastDate > newestDate) newestDate = lastDate;
      totalPoints += prices.length;
    }
  }

  const overallSource: "db" | "api" | "mixed" =
    sources.has("db") && sources.has("api") ? "mixed" : sources.has("db") ? "db" : "api";

  const symbolMap = Object.fromEntries(symbolResults.map((r) => [r.symbol, r.prices]));
  const spx = symbolMap["^GSPC"] || [];
  const wti = symbolMap["CL=F"] || [];
  const gold = symbolMap["GC=F"] || [];
  const ief = symbolMap["IEF"] || [];

  // Align and compute ratios
  const energyAligned = alignWeeklySeries(spx, wti);
  const currencyAligned = alignWeeklySeries(ief, gold);
  const spGoldAligned = alignWeeklySeries(spx, gold);
  const goldWtiAligned = alignWeeklySeries(gold, wti);

  const energyEfficiency = buildRatio(energyAligned, "S&P 500 / WTI", maWeeks);
  const currencyQuality = buildRatio(currencyAligned, "10Y UST (IEF) / Gold", maWeeks);
  const spGoldRatio = buildRatio(spGoldAligned, "S&P 500 / Gold", maWeeks);
  const goldWtiRatio = buildRatio(goldWtiAligned, "Gold / WTI", maWeeks);

  // Determine quadrant
  const key = `${energyEfficiency.signal},${currencyQuality.signal}`;
  const quadrant = QUADRANTS[key] ?? QUADRANTS["-1,-1"];

  // Exclusion rules (Browne Permanent Portfolio)
  const exclusions: GavekalExclusion[] = [];

  if (currencyQuality.signal === 1) {
    exclusions.push({
      name: "Bonds vs Gold",
      signal: "Own bonds",
      description: "UST/Gold above 7yma — bonds are proper store of value",
    });
  } else {
    exclusions.push({
      name: "Bonds vs Gold",
      signal: "Own gold",
      description: "UST/Gold below 7yma — currency being debased, gold outperforms",
    });
  }

  if (energyEfficiency.signal === 1) {
    exclusions.push({
      name: "Equities vs Cash",
      signal: "Own equities",
      description: "S&P/WTI above 7yma — energy transformation profitable",
    });
  } else {
    exclusions.push({
      name: "Equities vs Cash",
      signal: "Own cash",
      description: "S&P/WTI below 7yma — energy transformation unprofitable",
    });
  }

  // Gold/WTI recession indicator
  if (goldWtiRatio.current > goldWtiRatio.ma7y * 1.2) {
    exclusions.push({
      name: "Recession Indicator",
      signal: "Warning",
      description: "Gold/WTI ratio elevated — historically precedes recessions",
    });
  }

  // S&P 500/Gold trend analysis
  const spGoldRatios = spGoldAligned.map((r) => r.aClose / r.bClose);
  const spGoldMas = computeMovingAverage(spGoldRatios, maWeeks);
  const spGoldTrend = analyzeTrend(spGoldRatios, spGoldMas);

  if (spGoldTrend.direction === "falling" && spGoldTrend.strength > 30) {
    exclusions.push({
      name: "S&P/Gold Trend",
      signal: "Caution",
      description: `S&P/Gold ratio falling (strength ${spGoldTrend.strength}/100) — real returns deteriorating`,
    });
  }

  // Build regime history from the sampled ratio history points
  const regimeHistory = buildRegimeHistory(
    energyEfficiency.history,
    currencyQuality.history,
  );

  // Extract changelog events from ratio histories
  const changelog = extractChangelog(
    energyEfficiency.history,
    currencyQuality.history,
    goldWtiRatio.history,
    regimeHistory,
  );

  return {
    quadrant,
    energyEfficiency,
    currencyQuality,
    keyRatios: {
      spGold: { current: spGoldRatio.current, ma7y: spGoldRatio.ma7y },
      goldWti: { current: goldWtiRatio.current, ma7y: goldWtiRatio.ma7y },
    },
    exclusions,
    regimeHistory,
    dataQuality: {
      symbolStatus,
      dataPoints: totalPoints,
      oldestDate,
      newestDate,
      source: overallSource,
    },
    xle: xleData,
    changelog,
    regimeReturns: REGIME_RETURNS,
    updatedAt: new Date().toISOString(),
  };
}

// ── Historical quadrant time series (full resolution) ──────────────────────

export interface GavekalHistoricalEntry {
  date: string;
  quadrantName: GavekalQuadrantName;
  score: number;
  energySignal: 1 | -1;
  currencySignal: 1 | -1;
  energyRatio: number;
  currencyRatio: number;
}

export async function computeGavekalHistory(
  options?: ComputeGavekalOptions,
): Promise<GavekalHistoricalEntry[]> {
  const maWeeks = options?.maWeeks ?? DEFAULT_MA_WEEKS;
  const historyYears = options?.historyYears ?? 10;

  const [spxData, wtiData, goldData, iefData] = await Promise.all(
    GAVEKAL_SYMBOLS.map((s) => loadWeeklyPrices(s, historyYears)),
  );

  const energyAligned = alignWeeklySeries(spxData.prices, wtiData.prices);
  const currencyAligned = alignWeeklySeries(iefData.prices, goldData.prices);

  if (energyAligned.length === 0 || currencyAligned.length === 0) return [];

  const energyRatios = energyAligned.map((r) => r.aClose / r.bClose);
  const currencyRatios = currencyAligned.map((r) => r.aClose / r.bClose);
  const energyMas = computeMovingAverage(energyRatios, maWeeks);
  const currencyMas = computeMovingAverage(currencyRatios, maWeeks);

  const currencyByWeek = new Map<string, { ratio: number; ma: number | null }>();
  for (let i = 0; i < currencyAligned.length; i++) {
    currencyByWeek.set(currencyAligned[i].weekKey, {
      ratio: currencyRatios[i],
      ma: currencyMas[i],
    });
  }

  const entries: GavekalHistoricalEntry[] = [];
  for (let i = maWeeks - 1; i < energyAligned.length; i += 4) {
    const eMa = energyMas[i];
    if (eMa === null) continue;

    const eSignal: 1 | -1 = energyRatios[i] > eMa ? 1 : -1;
    const cData = currencyByWeek.get(energyAligned[i].weekKey);
    if (!cData || cData.ma === null) continue;

    const cSignal: 1 | -1 = cData.ratio > cData.ma ? 1 : -1;
    const qKey = `${eSignal},${cSignal}`;
    const q = QUADRANTS[qKey] ?? QUADRANTS["-1,-1"];

    entries.push({
      date: energyAligned[i].date,
      quadrantName: q.name,
      score: q.score,
      energySignal: eSignal,
      currencySignal: cSignal,
      energyRatio: Math.round(energyRatios[i] * 10000) / 10000,
      currencyRatio: Math.round(cData.ratio * 10000) / 10000,
    });
  }

  return entries;
}
