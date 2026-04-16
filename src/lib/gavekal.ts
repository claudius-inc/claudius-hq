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
import {
  loadHistoricalRegimeHistory,
  loadHistoricalRatioHistories,
} from "./gavekal-historical";

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

export type TileAction = "own" | "avoid" | "hold";

export interface GavekalQuadrant {
  name: GavekalQuadrantName;
  score: number; // +2, 0, -2
  color: string; // tailwind class
  description: string;
  buySignals: string[];
  sellSignals: string[];
  // Per-quadrant action mapping for the 5-asset-class tile grid in the
  // "What to do now" section. Authoritative quantized version of the
  // narrative buy/sell signals: each tile gets exactly one verdict so the
  // grid can show a clear action badge alongside the historical return.
  // Hardcoded per quadrant rather than runtime-derived from buySignals
  // strings, to keep the mapping explicit and reviewable.
  tileActions: {
    equities: TileAction;
    bonds: TileAction;
    gold: TileAction;
    commodities: TileAction;
    cash: TileAction;
  };
}

export interface GavekalRatio {
  label: string;
  current: number;
  ma7y: number;
  signal: 1 | -1;
  history: { date: string; value: number; ma: number | null }[];
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
  // History of the XLE / SPY relative-strength ratio for sparkline + 7y MA
  xleSpyHistory: { date: string; value: number; ma: number | null }[];
  // Energy sector weight in S&P 500 (e.g. 0.041 for 4.1%) — sourced from
  // SPY topHoldings.sectorWeightings via Yahoo. Anchors the Browne Dynamic
  // Ch. 10 rationale: hedge exists because energy is structurally
  // underweight in the S&P (was ~30% in 1980, now ~4%).
  energyPctOfSp500: number | null;
  // 1-year rolling correlation between XLE weekly returns and WTI weekly
  // returns. Validates that the energy hedge is actually tracking its
  // underlying commodity. Healthy range historically ~0.5–0.85.
  xleWtiCorrelation: number | null;
}

export interface GavekalRegimeReturns {
  equities: number;
  bonds: number;
  gold: number;
  commodities: number;
  cash: number;
}

export interface PortfolioAllocation {
  asset: string;
  vehicle: string;
  weight: string;
}

// Browne Dynamic portfolio (Charles Gave, "The General Theory of Portfolio
// Construction", Chapters 7–10). Five buckets, four held at any time:
//   - Cash (T-bills)
//   - S&P 500
//   - XLE (energy producers — added as a separate bucket because energy is
//     only ~4% of the S&P 500 vs ~30% in 1980, leaving the index unhedged
//     against an oil shock)
//   - Gold OR 10-year US Treasuries (mutually exclusive — switched by the
//     7-year MA of the bond/gold ratio, see buildPortfolioAllocation)
// Equal-weighted at 25% each. The ebook does NOT prescribe per-quadrant
// allocations; the same Browne Dynamic is held in all four quadrants and the
// only regime-driven change is the gold↔bonds switch.
const BROWNE_DYNAMIC_BASE: PortfolioAllocation[] = [
  { asset: "Cash / T-bills", vehicle: "SGOV / BIL / SHV", weight: "25%" },
  { asset: "S&P 500", vehicle: "VOO / SPY", weight: "25%" },
  { asset: "Energy equities", vehicle: "XLE", weight: "25%" },
];

export interface GavekalData {
  quadrant: GavekalQuadrant;
  energyEfficiency: GavekalRatio;
  currencyQuality: GavekalRatio;
  keyRatios: {
    spGold: {
      current: number;
      ma7y: number;
      history: { date: string; value: number; ma: number | null }[];
    };
    goldWti: {
      current: number;
      ma7y: number;
      history: { date: string; value: number; ma: number | null }[];
    };
  };
  regimeHistory: GavekalRegimePoint[];
  xle?: GavekalXleData;
  regimeReturns?: Record<string, GavekalRegimeReturns>;
  portfolioAllocation?: PortfolioAllocation[];
}

// ── Quadrant definitions ────────────────────────────────────────────────────

const QUADRANTS: Record<string, GavekalQuadrant> = {
  "1,1": {
    name: "Deflationary Boom",
    score: 2,
    color: "bg-emerald-100 border-emerald-300 text-emerald-800",
    description: "Goldilocks — equities & bonds both win, hard assets lag",
    // Gave Ch. 2: "long-duration equities, i.e. growth stocks. Value managers
    // underperform. Government and corporate bonds do well, as does real
    // estate. Basically, any 'long-duration' asset thrives."
    buySignals: [
      "Innovative companies with pricing power",
      "Long-duration assets (growth equities, long bonds)",
    ],
    sellSignals: ["Companies with little pricing power"],
    tileActions: {
      equities: "own",
      bonds: "own",
      gold: "avoid",
      commodities: "avoid",
      cash: "hold",
    },
  },
  "1,-1": {
    name: "Inflationary Boom",
    score: 0,
    color: "bg-orange-100 border-orange-300 text-orange-800",
    description: "Equities advance but inflation eats real returns",
    // Gave Ch. 2: "scarcity assets, with the most obvious being gold, although
    // commodities more broadly usually outperform. Value managers also do
    // well, as do emerging market managers. In an inflationary boom, bonds
    // typically struggle."
    buySignals: [
      "Stores of value (real estate, gold, commodities)",
      "High fixed cost cyclical producers",
    ],
    sellSignals: ["Long-term bonds"],
    tileActions: {
      equities: "hold",
      bonds: "avoid",
      gold: "own",
      commodities: "own",
      cash: "hold",
    },
  },
  "-1,1": {
    name: "Deflationary Bust",
    score: 0,
    color: "bg-blue-100 border-blue-300 text-blue-800",
    description: "Recession risk — bonds and cash beat real assets",
    // Gave Ch. 2: "the only assets that rise are long-dated government bonds."
    buySignals: ["Safe government bonds"],
    sellSignals: ["Everything else"],
    tileActions: {
      equities: "avoid",
      bonds: "own",
      gold: "hold",
      commodities: "avoid",
      cash: "hold",
    },
  },
  "-1,-1": {
    name: "Inflationary Bust",
    score: -2,
    color: "bg-red-100 border-red-300 text-red-800",
    description: "Stocks struggle while oil & gold both run — the worst macro mix",
    // Gave Ch. 2: "very few assets do well. Long-duration assets do especially
    // poorly. Even bonds collapse. At such times, one should own cash, and
    // usually energy since the way the broader economy is often pushed into
    // stagflation is through a spike in energy prices."
    // Gold added per the Browne Dynamic gold/bonds switch (Ch. 8): when the
    // IEF/Gold ratio is below its 7y MA the currency is being debased and
    // gold is the antifragile asset of choice — the typical state during
    // inflationary bust regimes, and historically the best-performing asset
    // class in this quadrant by a wide margin.
    buySignals: [
      "Cash in safest currency",
      "Energy producers",
      "Gold",
    ],
    sellSignals: ["Financial assets"],
    tileActions: {
      equities: "avoid",
      bonds: "avoid",
      gold: "own",
      commodities: "own",
      cash: "own",
    },
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
  symbol: string,
  years: number,
): Promise<{ prices: WeeklyPoint[]; source: "db" | "api" }> {
  const fromDate = new Date();
  fromDate.setFullYear(fromDate.getFullYear() - years);
  const fromDateStr = fromDate.toISOString().split("T")[0];

  // Try DB first
  const dbPrices = await getStoredPrices(symbol, fromDateStr);
  if (dbPrices.length > 52 * Math.max(1, years - 1)) {
    // DB has deep history, but the last row may be stale (seed runs
    // infrequently). Overlay the latest 2 weeks from Yahoo so the
    // quadrant signal reflects current prices, not last-seed prices.
    try {
      const recentPrices = await fetchDailyHistoryFromApi(symbol, 1);
      if (recentPrices.length > 0) {
        const recentWeeks = dailyToWeekly(recentPrices);
        const recentMap = new Map(recentWeeks.map((w) => [w.weekKey, w]));
        const merged = dailyToWeekly(dbPrices).map((w) => {
          const fresh = recentMap.get(w.weekKey);
          return fresh ?? w;
        });
        // Append any new weeks not in the DB
        const dbWeekSet = new Set(merged.map((w) => w.weekKey));
        for (const w of recentWeeks) {
          if (!dbWeekSet.has(w.weekKey)) merged.push(w);
        }
        // Persist the fresh daily prices to DB in background
        storePrices(symbol, recentPrices).catch((e) =>
          logger.error(LOG_SRC, `Background store failed for ${symbol}`, { error: e }),
        );
        return { prices: merged, source: "db" };
      }
    } catch (e) {
      logger.warn(LOG_SRC, `Yahoo recent fetch failed for ${symbol}, using DB only`, { error: e });
    }
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

  // Sample full available history at monthly resolution for payload efficiency.
  // Show ratio for all points; MA is null until the 7-year warmup completes,
  // so the leading 7 years of points carry no regime signal — but they still
  // appear on the ratio chart.
  const history: { date: string; value: number; ma: number | null }[] = [];
  for (let i = 0; i < ratios.length; i += 4) {
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

// ── Regime returns (hardcoded from Gave's published backtests) ─────────────

const REGIME_RETURNS: Record<string, GavekalRegimeReturns> = {
  "Deflationary Boom": { equities: 12, bonds: 6, gold: -2, commodities: -5, cash: 3 },
  "Inflationary Boom": { equities: 5, bonds: -2, gold: 15, commodities: 12, cash: 1 },
  "Deflationary Bust": { equities: -8, bonds: 10, gold: 3, commodities: -15, cash: 4 },
  "Inflationary Bust": { equities: -5, bonds: -8, gold: 20, commodities: 8, cash: 2 },
};

// ── XLE data fetching ─────────────────────────────────────────────────────

/** Fetch live XLE/SPY quotes + the energy sector weight in S&P 500 from
 *  SPY's topHoldings.sectorWeightings. The sector weight anchors the
 *  Browne Dynamic Ch. 10 rationale: the hedge exists because energy is
 *  structurally underweight in the S&P (was ~30% in 1980, now ~4%). */
async function fetchXleData(): Promise<GavekalXleData | undefined> {
  try {
    const [xleQuote, spyQuote, spySummary] = await Promise.all([
      yahooFinance.quote("XLE"),
      yahooFinance.quote("SPY"),
      yahooFinance
        .quoteSummary("SPY", { modules: ["topHoldings"] })
        .catch(() => null),
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

    // Extract the energy sector weight. Yahoo returns sectorWeightings as
    // an array of single-key objects, e.g. [{ energy: 0.0411 }, ...].
    let energyPctOfSp500: number | null = null;
    const sectorWeightings = (
      spySummary as { topHoldings?: { sectorWeightings?: Array<Record<string, number>> } } | null
    )?.topHoldings?.sectorWeightings;
    if (Array.isArray(sectorWeightings)) {
      for (const entry of sectorWeightings) {
        if (entry && typeof entry === "object" && "energy" in entry) {
          const v = entry.energy;
          if (typeof v === "number" && isFinite(v)) {
            energyPctOfSp500 = v;
            break;
          }
        }
      }
    }

    return {
      price: xlePrice ?? null,
      changePercent: changePercent != null ? Math.round(changePercent * 100) / 100 : null,
      xleSpyRatio: xleSpyRatio != null ? Math.round(xleSpyRatio * 10000) / 10000 : null,
      trailingPE: xleTrailingPE ?? null,
      dividendYield: xleDividendYield ?? null,
      // Historical fields are filled in after the main symbol fetch by
      // enrichXleHistorical(); default to empty/null here.
      xleSpyHistory: [],
      energyPctOfSp500,
      xleWtiCorrelation: null,
    };
  } catch (error) {
    logger.error(LOG_SRC, "Failed to fetch XLE data", { error });
    return undefined;
  }
}

/** Fetch XLE + SPY weekly histories and compute (a) the XLE/SPY ratio
 *  history with 7y MA for the sparkline, and (b) the rolling 1-year
 *  correlation between XLE weekly returns and WTI weekly returns. WTI
 *  prices are passed in (already loaded by the main pipeline). */
async function enrichXleHistorical(
  wti: WeeklyPoint[],
  historyYears: number,
  maWeeks: number,
): Promise<{
  xleSpyHistory: { date: string; value: number; ma: number | null }[];
  xleWtiCorrelation: number | null;
}> {
  try {
    const [xleData, spyData] = await Promise.all([
      loadWeeklyPrices("XLE", historyYears).catch(() => ({ prices: [] as WeeklyPoint[] })),
      loadWeeklyPrices("SPY", historyYears).catch(() => ({ prices: [] as WeeklyPoint[] })),
    ]);

    // XLE / SPY ratio history with the same monthly downsampling +
    // 7y MA pattern as buildRatio() so the MiniSparkline gets a clean
    // shape consistent with other ratio charts in the dashboard.
    let xleSpyHistory: { date: string; value: number; ma: number | null }[] = [];
    if (xleData.prices.length && spyData.prices.length) {
      const aligned = alignWeeklySeries(xleData.prices, spyData.prices);
      const xleSpyRatio = buildRatio(aligned, "XLE / SPY", maWeeks);
      xleSpyHistory = xleSpyRatio.history;
    }

    // 1-year rolling correlation between XLE and WTI weekly returns.
    // Healthy structural hedge: ~0.5–0.85. A persistent break below
    // ~0.4 would indicate the hedge has decoupled from its underlying.
    let xleWtiCorrelation: number | null = null;
    if (xleData.prices.length && wti.length) {
      const aligned = alignWeeklySeries(xleData.prices, wti);
      const lookbackWeeks = 52;
      if (aligned.length > lookbackWeeks + 1) {
        const xleReturns: number[] = [];
        const wtiReturns: number[] = [];
        const tail = aligned.slice(-lookbackWeeks - 1);
        for (let i = 1; i < tail.length; i++) {
          xleReturns.push((tail[i].aClose - tail[i - 1].aClose) / tail[i - 1].aClose);
          wtiReturns.push((tail[i].bClose - tail[i - 1].bClose) / tail[i - 1].bClose);
        }
        const meanX = xleReturns.reduce((a, b) => a + b, 0) / xleReturns.length;
        const meanY = wtiReturns.reduce((a, b) => a + b, 0) / wtiReturns.length;
        let cov = 0;
        let varX = 0;
        let varY = 0;
        for (let i = 0; i < xleReturns.length; i++) {
          const dx = xleReturns[i] - meanX;
          const dy = wtiReturns[i] - meanY;
          cov += dx * dy;
          varX += dx * dx;
          varY += dy * dy;
        }
        const denom = Math.sqrt(varX * varY);
        if (denom > 0) {
          xleWtiCorrelation = Math.round((cov / denom) * 100) / 100;
        }
      }
    }

    return { xleSpyHistory, xleWtiCorrelation };
  } catch (error) {
    logger.error(LOG_SRC, "Failed to enrich XLE historical data", { error });
    return { xleSpyHistory: [], xleWtiCorrelation: null };
  }
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
  // 23y is the practical max — IEF (the youngest series) only exists from 2002.
  // After the 7y MA warmup this yields ~16y of regime classification.
  const historyYears = options?.historyYears ?? 23;

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

  const symbolMap = Object.fromEntries(symbolResults.map((r) => [r.symbol, r.prices]));
  const spx = symbolMap["^GSPC"] || [];
  const wti = symbolMap["CL=F"] || [];
  const gold = symbolMap["GC=F"] || [];
  const ief = symbolMap["IEF"] || [];

  // Enrich the live XLE quote payload with historical fields (XLE/SPY
  // sparkline history + XLE/WTI rolling correlation). Done after the main
  // symbol fetch so we can reuse the already-loaded WTI history.
  let enrichedXleData = xleData;
  if (xleData) {
    const xleHistorical = await enrichXleHistorical(wti, historyYears, maWeeks);
    enrichedXleData = { ...xleData, ...xleHistorical };
  }

  // Align and compute ratios
  const energyAligned = alignWeeklySeries(spx, wti);
  const currencyAligned = alignWeeklySeries(ief, gold);
  const spGoldAligned = alignWeeklySeries(spx, gold);
  const goldWtiAligned = alignWeeklySeries(gold, wti);

  const energyEfficiency = buildRatio(energyAligned, "S&P 500 / WTI", maWeeks);
  const currencyQuality = buildRatio(currencyAligned, "10Y UST Total Return / Gold", maWeeks);
  const spGoldRatio = buildRatio(spGoldAligned, "S&P 500 / Gold", maWeeks);
  const goldWtiRatio = buildRatio(goldWtiAligned, "Gold / WTI", maWeeks);

  // Determine quadrant
  const key = `${energyEfficiency.signal},${currencyQuality.signal}`;
  const quadrant = QUADRANTS[key] ?? QUADRANTS["-1,-1"];

  // Prefer the long-history monthly regime computation (1971–present) seeded
  // by scripts/seed-gavekal-historical.ts. Also overwrite the per-ratio
  // history arrays so the RatioChart shows 50+ years instead of just the
  // weekly Yahoo window. The live current/ma7y/signal stay as-is so the
  // displayed quadrant + values remain fresh from today's IEF/Yahoo data.
  let regimeHistory: GavekalRegimePoint[] = await loadHistoricalRegimeHistory();
  const histRatios = await loadHistoricalRatioHistories();
  if (histRatios) {
    energyEfficiency.history = histRatios.energy;
    currencyQuality.history = histRatios.currency;
  }
  if (regimeHistory.length === 0) {
    regimeHistory = buildRegimeHistory(
      energyEfficiency.history,
      currencyQuality.history,
    );
  }

  return {
    quadrant,
    energyEfficiency,
    currencyQuality,
    keyRatios: {
      spGold: {
        current: spGoldRatio.current,
        ma7y: spGoldRatio.ma7y,
        history: spGoldRatio.history,
      },
      goldWti: {
        current: goldWtiRatio.current,
        ma7y: goldWtiRatio.ma7y,
        history: goldWtiRatio.history,
      },
    },
    regimeHistory,
    xle: enrichedXleData,
    regimeReturns: REGIME_RETURNS,
    portfolioAllocation: buildPortfolioAllocation(currencyQuality.signal),
  };
}

// ── Portfolio allocation (Browne Dynamic — gold↔bonds switch) ───────────────
//
// The fourth bucket is Gold OR 10-year US Treasuries, never both. The switch
// follows Charles Gave's rule (Chapter 8): if the IEF/Gold ratio is above its
// 7-year moving average, the bond market is acting as a proper store of value
// and we hold bonds; otherwise, the currency is being debased and we hold
// gold. The same single Browne Dynamic portfolio is held in all four
// quadrants — there are no per-quadrant baskets in the ebook.
function buildPortfolioAllocation(
  currencySignal: 1 | -1,
): PortfolioAllocation[] {
  const switchedRow: PortfolioAllocation =
    currencySignal === 1
      ? { asset: "10y Treasuries", vehicle: "TLT / IEF", weight: "25%" }
      : { asset: "Gold", vehicle: "GLDM / GLD / IAU", weight: "25%" };

  return [...BROWNE_DYNAMIC_BASE, switchedRow];
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
