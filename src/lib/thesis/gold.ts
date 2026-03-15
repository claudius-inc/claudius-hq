// ── Gold Thesis Signal Definitions & Resolver ────────────────────────

import type {
  ThesisSignalDefinition,
  PreCommitmentRule,
  ThesisAssetConfig,
} from "./types";
import type { SignalDataResolver } from "./engine";
import { db } from "@/db";
import { cftcPositions } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { logger } from "@/lib/logger";
import YahooFinance from "yahoo-finance2";

const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

const FRED_API_KEY = process.env.FRED_API_KEY;

// ── Signal Definitions ──────────────────────────────────────────────
// Note: CFTC is excluded from composite scoring (warning-only)

export const GOLD_SIGNAL_DEFINITIONS: ThesisSignalDefinition[] = [
  // Primary signals
  {
    id: "tips-yield",
    name: "TIPS Yield",
    category: "primary",
    source: { type: "fred", key: "DFII10" },
    bullishDirection: "below",
    thresholds: [-0.5, 0.5, 1.5, 2.0],
    weight: 12,
    detail: "#1 driver - negative real yields = bullish",
    unit: "%",
  },
  {
    id: "cb-demand",
    name: "CB Demand",
    category: "primary",
    source: { type: "manual", key: "wgc_cb_tonnes" },
    bullishDirection: "above",
    thresholds: [300, 500, 700, 1000],
    weight: 14,
    detail: ">800T annual = structural demand",
    unit: "T",
  },
  {
    id: "m2-gold-ratio",
    name: "M2/Gold Ratio",
    category: "primary",
    source: { type: "derived", key: "m2_gold_ratio" },
    bullishDirection: "above",
    thresholds: [3, 6, 10, 15],
    weight: 8,
    detail: "M2 (billions) / Gold price - higher = gold cheaper",
    unit: "x",
  },

  // Secondary signals
  {
    id: "dxy",
    name: "DXY",
    category: "secondary",
    source: { type: "yahoo", key: "DX-Y.NYB" },
    bullishDirection: "below",
    thresholds: [95, 100, 105, 110],
    weight: 4,
    detail: "Inverse correlation - weak dollar = bullish",
    unit: "",
  },
  {
    id: "deficit-gdp",
    name: "Deficit/GDP",
    category: "secondary",
    source: { type: "fred", key: "FYFSGDA188S" },
    bullishDirection: "below",
    thresholds: [-6, -4.5, -3, -1.5],
    weight: 5,
    detail: "3% stabilizes debt/GDP; >4.5% outside recession is historically abnormal",
    unit: "%",
  },
  // Warning-only signal (excluded from composite score)
  {
    id: "cftc-net-spec",
    name: "CFTC Net Spec",
    category: "warning",
    source: { type: "cftc", key: "gold" },
    bullishDirection: "below",
    thresholds: [25, 50, 75, 90],
    weight: 0, // Excluded from composite scoring
    detail: "Crowding check - >75th or <25th %ile = warning",
    unit: "%ile",
  },
];

// ── Pre-Commitment Defaults ─────────────────────────────────────────

export const GOLD_DEFAULT_ENTRY_CONDITIONS: PreCommitmentRule = {
  type: "entry",
  label: "Entry Conditions",
  logic: "all",
  conditions: [
    { signalId: "tips-yield", label: "TIPS < 1%", operator: "lt", value: 1 },
    { signalId: "cb-demand", label: "WGC > 800T", operator: "gt", value: 800 },
    { signalId: "m2-gold-ratio", label: "M2/Au > 10", operator: "gt", value: 10 },
  ],
};

export const GOLD_DEFAULT_CHANGE_CONDITIONS: PreCommitmentRule = {
  type: "change",
  label: "Thesis Change",
  logic: "any",
  conditions: [
    { signalId: "tips-yield", label: "TIPS > 2% for 2Q", operator: "gt", value: 2, durationQuarters: 2 },
    { signalId: "cb-demand", label: "WGC selling", operator: "lt", value: 400 },
    { signalId: "m2-gold-ratio", label: "M2/Au < 4 (gold expensive)", operator: "lt", value: 4 },
  ],
};

export const GOLD_DEFAULT_REVIEW_TRIGGERS: PreCommitmentRule = {
  type: "review",
  label: "Review Triggers",
  logic: "any",
  conditions: [
    { signalId: "cftc-net-spec", label: "CFTC crowded (>75th)", operator: "gt", value: 75 },
    { signalId: "cftc-net-spec", label: "CFTC washed out (<25th)", operator: "lt", value: 25 },
    { signalId: "dxy", label: "DXY > 110", operator: "gt", value: 110 },
  ],
};

export const GOLD_THESIS_CONFIG: ThesisAssetConfig = {
  asset: "gold",
  name: "Gold Thesis",
  signalDefinitions: GOLD_SIGNAL_DEFINITIONS,
  entryConditions: GOLD_DEFAULT_ENTRY_CONDITIONS,
  thesisChangeConditions: GOLD_DEFAULT_CHANGE_CONDITIONS,
  reviewTriggers: GOLD_DEFAULT_REVIEW_TRIGGERS,
};

// ── Hardcoded Data (updated manually from WGC reports) ──────────────
// Source: World Gold Council quarterly demand reports
// Key: annual central bank net purchases in tonnes
// Last updated: Q4 2025 (full year). Update when new WGC report is published.
const HARDCODED_CB_DEMAND: Record<number, number> = {
  2021: 450.1,
  2022: 1080.0,
  2023: 1050.8,
  2024: 1092.4,
  2025: 863.3,
};

function getLatestCbDemand(): { current: number; previous: number | null } {
  const years = Object.keys(HARDCODED_CB_DEMAND).map(Number).sort((a, b) => b - a);
  const current = HARDCODED_CB_DEMAND[years[0]];
  const previous = years.length > 1 ? HARDCODED_CB_DEMAND[years[1]] : null;
  return { current, previous };
}

// ── Signal Data Resolver ────────────────────────────────────────────

async function fetchFredValues(seriesId: string, count: number = 1): Promise<number[]> {
  if (!FRED_API_KEY) return [];
  try {
    const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${seriesId}&api_key=${FRED_API_KEY}&file_type=json&sort_order=desc&limit=20`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return [];
    const data = await res.json();
    const valid = (data.observations ?? [])
      .filter((o: { value: string }) => o.value !== ".")
      .map((o: { value: string; date: string }) => ({ value: parseFloat(o.value), date: o.date }));
    return valid.slice(0, count).map((v: { value: number }) => v.value);
  } catch (e) {
    logger.error("thesis/gold", `FRED fetch failed for ${seriesId}`, { error: e });
    return [];
  }
}

async function fetchFredValue(seriesId: string): Promise<number | null> {
  const vals = await fetchFredValues(seriesId, 1);
  return vals[0] ?? null;
}

async function fetchFredYoYChange(seriesId: string): Promise<number | null> {
  if (!FRED_API_KEY) return null;
  try {
    const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${seriesId}&api_key=${FRED_API_KEY}&file_type=json&sort_order=desc&limit=15`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    const data = await res.json();
    const obs = (data.observations ?? [])
      .filter((o: { value: string }) => o.value !== ".")
      .map((o: { value: string; date: string }) => ({ value: parseFloat(o.value), date: o.date }));
    
    if (obs.length < 13) return null;
    const current = obs[0].value;
    const yearAgo = obs[12].value;
    if (yearAgo === 0) return null;
    return ((current - yearAgo) / yearAgo) * 100;
  } catch (e) {
    logger.error("thesis/gold", `FRED YoY fetch failed for ${seriesId}`, { error: e });
    return null;
  }
}

async function fetchYahooPrice(ticker: string): Promise<number | null> {
  try {
    const quote = await yahooFinance.quote(ticker);
    return (quote as { regularMarketPrice?: number }).regularMarketPrice ?? null;
  } catch (e) {
    logger.error("thesis/gold", `Yahoo fetch failed for ${ticker}`, { error: e });
    return null;
  }
}

export class GoldSignalDataResolver implements SignalDataResolver {
  async resolve(signalId: string, source: { type: string; key: string }): Promise<number | null> {
    switch (source.type) {
      case "fred": {
        return fetchFredValue(source.key);
      }

      case "fred_yoy": {
        return fetchFredYoYChange(source.key);
      }

      case "yahoo":
        return fetchYahooPrice(source.key);

      case "cftc":
        return this.resolveCftcPercentile(source.key);

      case "derived":
        return this.resolveDerived(source.key);

      case "manual": {
        if (source.key === "wgc_cb_tonnes") return getLatestCbDemand().current;
        return null;
      }

      default:
        return null;
    }
  }

  async resolvePrevious(signalId: string, source: { type: string; key: string }): Promise<number | null> {
    switch (source.type) {
      case "fred": {
        const vals = await fetchFredValues(source.key, 2);
        return vals[1] ?? null;
      }
      case "fred_yoy": {
        // Previous YoY would require more complex calculation, skip for now
        return null;
      }
      case "yahoo": {
        try {
          const quote = await yahooFinance.quote(source.key);
          return (quote as { regularMarketPreviousClose?: number }).regularMarketPreviousClose ?? null;
        } catch { return null; }
      }
      case "manual": {
        if (source.key === "wgc_cb_tonnes") return getLatestCbDemand().previous;
        return null;
      }
      default:
        return null;
    }
  }

  private async resolveDerived(key: string): Promise<number | null> {
    if (key === "m2_gold_ratio") {
      const [m2, goldPrice] = await Promise.all([
        fetchFredValue("M2SL"),
        fetchYahooPrice("GC=F"),
      ]);
      if (!m2 || !goldPrice) return null;
      return Math.round((m2 / goldPrice) * 10) / 10;
    }
    return null;
  }

  private async resolveCftcPercentile(commodity: string): Promise<number | null> {
    try {
      const rows = await db
        .select()
        .from(cftcPositions)
        .where(eq(cftcPositions.commodity, commodity))
        .orderBy(desc(cftcPositions.reportDate))
        .limit(52);

      if (rows.length < 2) return null;

      const latest = rows[0].netSpeculative;
      if (latest === null) return null;

      const values = rows
        .map((r) => r.netSpeculative)
        .filter((v): v is number => v !== null)
        .sort((a, b) => a - b);

      const below = values.filter((v) => v < latest).length;
      return Math.round((below / values.length) * 100);
    } catch (e) {
      logger.error("thesis/gold", "CFTC percentile resolve failed", { error: e });
      return null;
    }
  }

}
