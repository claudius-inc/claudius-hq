/**
 * Gavekal Four Quadrants Framework
 *
 * Charles Gave's (1978, updated Oct 2024) macro framework divides
 * the economic environment into four states using two axes:
 *
 * Horizontal — Energy Efficiency: S&P 500 / WTI vs 7-year MA
 * Vertical   — Currency Quality:  10Y UST total return (IEF) / Gold vs 7-year MA
 */

import YahooFinance from "yahoo-finance2";
import { logger } from "./logger";

const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

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
  history: { date: string; value: number; ma: number }[];
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

// ── Data fetching ───────────────────────────────────────────────────────────

interface HistoricalRow {
  date: Date;
  close: number | null;
}

async function fetchWeeklyHistory(
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
      .filter((q): q is { date: Date; close: number } => q.close !== null)
      .map((q) => ({ date: q.date, close: q.close }));
  } catch (error) {
    logger.error("lib/gavekal", `Failed to fetch ${symbol} history`, { error });
    return [];
  }
}

// ── Computation ─────────────────────────────────────────────────────────────

function computeMovingAverage(values: number[], window: number): (number | null)[] {
  const result: (number | null)[] = [];
  for (let i = 0; i < values.length; i++) {
    if (i < window - 1) {
      result.push(null);
    } else {
      const slice = values.slice(i - window + 1, i + 1);
      result.push(slice.reduce((a, b) => a + b, 0) / window);
    }
  }
  return result;
}

function alignSeries(
  a: { date: Date; close: number }[],
  b: { date: Date; close: number }[],
): { date: Date; aClose: number; bClose: number }[] {
  // Build a map of b by week key (YYYY-WW)
  const weekKey = (d: Date) => {
    const y = d.getFullYear();
    const start = new Date(y, 0, 1);
    const wk = Math.ceil(((d.getTime() - start.getTime()) / 86400000 + start.getDay() + 1) / 7);
    return `${y}-${wk}`;
  };

  const bMap = new Map<string, number>();
  for (const row of b) {
    bMap.set(weekKey(row.date), row.close);
  }

  const aligned: { date: Date; aClose: number; bClose: number }[] = [];
  for (const row of a) {
    const key = weekKey(row.date);
    const bVal = bMap.get(key);
    if (bVal !== undefined) {
      aligned.push({ date: row.date, aClose: row.close, bClose: bVal });
    }
  }
  return aligned;
}

function buildRatio(
  aligned: { date: Date; aClose: number; bClose: number }[],
  label: string,
  maWeeks: number, // 7 years ~ 365 weeks
): GavekalRatio {
  const ratios = aligned.map((r) => r.aClose / r.bClose);
  const mas = computeMovingAverage(ratios, maWeeks);

  // Build history (last 520 weeks ~ 10 years, sampled monthly for size)
  const history: { date: string; value: number; ma: number }[] = [];
  for (let i = Math.max(0, ratios.length - 520); i < ratios.length; i += 4) {
    if (mas[i] !== null) {
      history.push({
        date: aligned[i].date.toISOString().split("T")[0],
        value: Math.round(ratios[i] * 10000) / 10000,
        ma: Math.round(mas[i]! * 10000) / 10000,
      });
    }
  }
  // Always include the last point
  const last = ratios.length - 1;
  if (last >= 0 && mas[last] !== null) {
    const lastDate = aligned[last].date.toISOString().split("T")[0];
    if (!history.length || history[history.length - 1].date !== lastDate) {
      history.push({
        date: lastDate,
        value: Math.round(ratios[last] * 10000) / 10000,
        ma: Math.round(mas[last]! * 10000) / 10000,
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
  // Build a map of currency history by date
  const currencyByDate = new Map<string, { value: number; ma: number }>();
  for (const h of currencyHistory) {
    currencyByDate.set(h.date, { value: h.value, ma: h.ma });
  }

  const points: GavekalRegimePoint[] = [];
  let lastQuadrant: GavekalQuadrantName | null = null;

  for (const eh of energyHistory) {
    const ch = currencyByDate.get(eh.date);
    if (!ch) continue;

    const eSignal = eh.value > eh.ma ? 1 : -1;
    const cSignal = ch.value > ch.ma ? 1 : -1;
    const key = `${eSignal},${cSignal}`;
    const q = QUADRANTS[key]?.name ?? "Inflationary Bust";

    // Only record when regime changes (or first point)
    if (q !== lastQuadrant) {
      points.push({ date: eh.date, quadrant: q });
      lastQuadrant = q;
    }
  }

  return points;
}

// ── Main entry point ────────────────────────────────────────────────────────

export async function computeGavekalQuadrant(): Promise<GavekalData> {
  const MA_WEEKS = 365; // ~7 years in weekly data

  // Fetch all four series in parallel
  const [spx, wti, gold, ief] = await Promise.all([
    fetchWeeklyHistory("^GSPC", 10),
    fetchWeeklyHistory("CL=F", 10),
    fetchWeeklyHistory("GC=F", 10),
    fetchWeeklyHistory("IEF", 10),
  ]);

  // Align and compute ratios
  const energyAligned = alignSeries(spx, wti);
  const currencyAligned = alignSeries(ief, gold);
  const spGoldAligned = alignSeries(spx, gold);
  const goldWtiAligned = alignSeries(gold, wti);

  const energyEfficiency = buildRatio(energyAligned, "S&P 500 / WTI", MA_WEEKS);
  const currencyQuality = buildRatio(currencyAligned, "10Y UST (IEF) / Gold", MA_WEEKS);

  // Key supplementary ratios
  const spGoldRatio = buildRatio(spGoldAligned, "S&P 500 / Gold", MA_WEEKS);
  const goldWtiRatio = buildRatio(goldWtiAligned, "Gold / WTI", MA_WEEKS);

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

  // Build regime history from the sampled ratio history points
  const regimeHistory = buildRegimeHistory(
    energyEfficiency.history,
    currencyQuality.history,
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
    updatedAt: new Date().toISOString(),
  };
}
