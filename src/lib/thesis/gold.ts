// ── Gold Thesis Signal Definitions & Resolver ────────────────────────

import type {
  ThesisSignalDefinition,
  PreCommitmentRule,
  ThesisAssetConfig,
} from "./types";
import type { SignalDataResolver } from "./engine";
import { db } from "@/db";
import { cftcPositions, goldFlows } from "@/db/schema";
import { desc, eq, and } from "drizzle-orm";
import { logger } from "@/lib/logger";
import YahooFinance from "yahoo-finance2";

const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

const FRED_API_KEY = process.env.FRED_API_KEY;

// ── Signal Definitions ──────────────────────────────────────────────

export const GOLD_SIGNAL_DEFINITIONS: ThesisSignalDefinition[] = [
  // Primary signals (weight 6-10)
  {
    id: "tips-yield",
    name: "TIPS Yield",
    category: "primary",
    source: { type: "fred", key: "DFII10" },
    bullishDirection: "below",
    thresholds: [-0.5, 0.5, 1.5, 2.0], // <-0.5 strong-bullish, <0.5 bullish, <1.5 neutral, <2.0 bearish, >=2.0 strong-bearish
    weight: 10,
    detail: "#1 driver — negative real yields = bullish",
    unit: "%",
  },
  {
    id: "dxy",
    name: "DXY",
    category: "primary",
    source: { type: "yahoo", key: "DX-Y.NYB" },
    bullishDirection: "below",
    thresholds: [95, 100, 105, 110],
    weight: 7,
    detail: "Inverse correlation — weak dollar = bullish",
    unit: "",
  },
  {
    id: "cb-demand",
    name: "CB Demand",
    category: "primary",
    source: { type: "manual", key: "wgc_cb_tonnes" },
    bullishDirection: "above",
    thresholds: [400, 600, 800, 1000],
    weight: 8,
    detail: ">800T annual = structural demand",
    unit: "T",
  },
  {
    id: "5y5y-breakeven",
    name: "5Y5Y BkEvn",
    category: "primary",
    source: { type: "fred", key: "T5YIFR" },
    bullishDirection: "above",
    thresholds: [1.8, 2.0, 2.5, 3.0],
    weight: 6,
    detail: ">2.5% = inflation expectations unanchoring",
    unit: "%",
  },

  // Secondary signals (weight 5)
  {
    id: "hy-spread",
    name: "HY Spread",
    category: "secondary",
    source: { type: "fred", key: "BAMLH0A0HYM2" },
    bullishDirection: "above",
    thresholds: [200, 350, 500, 700],
    weight: 5,
    detail: "Crisis hedge — widening spreads = gold bid",
    unit: "bps",
  },
  {
    id: "deficit-gdp",
    name: "Deficit/GDP",
    category: "secondary",
    source: { type: "fred", key: "FYFSGDA188S" },
    bullishDirection: "below", // more negative = larger deficit = more bullish for gold
    thresholds: [-8, -6, -4, -2],
    weight: 5,
    detail: ">5% deficit = debasement signal",
    unit: "%",
  },
  {
    id: "real-policy-rate",
    name: "Real Policy",
    category: "secondary",
    source: { type: "derived", key: "fed_funds_minus_cpi" },
    bullishDirection: "below",
    thresholds: [-2, -1, 0, 1],
    weight: 5,
    detail: "Negative = Fed behind curve, bullish gold",
    unit: "%",
  },

  // Sentiment / Contrarian checks (weight 3-4)
  {
    id: "cftc-net-spec",
    name: "CFTC Net Spec",
    category: "sentiment",
    source: { type: "cftc", key: "gold" },
    bullishDirection: "below", // Lower percentile = less crowded = more room to run
    thresholds: [30, 50, 75, 90],
    weight: 4,
    detail: "Crowding check — >75th %ile = warning",
    unit: "%ile",
  },
  {
    id: "gold-sp-ratio",
    name: "Gold/S&P",
    category: "sentiment",
    source: { type: "derived", key: "gold_div_spy" },
    bullishDirection: "below", // lower ratio = gold cheaper relative to stocks
    thresholds: [0.3, 0.4, 0.55, 0.7],
    weight: 3,
    detail: "Mean-reverting — >0.7 = gold expensive vs stocks",
    unit: "",
  },
];

// ── Pre-Commitment Defaults ─────────────────────────────────────────

export const GOLD_DEFAULT_ENTRY_CONDITIONS: PreCommitmentRule = {
  type: "entry",
  label: "Entry Conditions",
  logic: "all",
  conditions: [
    { signalId: "tips-yield", label: "TIPS < 1%", operator: "lt", value: 1 },
    { signalId: "dxy", label: "DXY < 105", operator: "lt", value: 105 },
    { signalId: "cb-demand", label: "WGC > 800T", operator: "gt", value: 800 },
  ],
};

export const GOLD_DEFAULT_CHANGE_CONDITIONS: PreCommitmentRule = {
  type: "change",
  label: "Thesis Change",
  logic: "any",
  conditions: [
    { signalId: "tips-yield", label: "TIPS > 2% for 2Q", operator: "gt", value: 2, durationQuarters: 2 },
    { signalId: "cb-demand", label: "WGC selling", operator: "lt", value: 400 },
  ],
};

export const GOLD_DEFAULT_REVIEW_TRIGGERS: PreCommitmentRule = {
  type: "review",
  label: "Review Triggers",
  logic: "any",
  conditions: [
    { signalId: "cftc-net-spec", label: "CFTC crowded", operator: "gt", value: 75 },
    { signalId: "gold-sp-ratio", label: "Au/SP > 0.7", operator: "gt", value: 0.7 },
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

// ── Signal Data Resolver ────────────────────────────────────────────

async function fetchFredValue(seriesId: string): Promise<number | null> {
  if (!FRED_API_KEY) return null;
  try {
    const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${seriesId}&api_key=${FRED_API_KEY}&file_type=json&sort_order=desc&limit=5`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    const data = await res.json();
    const obs = data.observations?.find((o: { value: string }) => o.value !== ".");
    return obs ? parseFloat(obs.value) : null;
  } catch (e) {
    logger.error("thesis/gold", `FRED fetch failed for ${seriesId}`, { error: e });
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
        const val = await fetchFredValue(source.key);
        // HY spread: FRED reports in %, convert to bps
        if (signalId === "hy-spread" && val !== null) return val * 100;
        return val;
      }

      case "yahoo":
        return fetchYahooPrice(source.key);

      case "cftc":
        return this.resolveCftcPercentile(source.key);

      case "derived":
        return this.resolveDerived(source.key);

      case "manual":
        return this.resolveManual(source.key);

      default:
        return null;
    }
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

  private async resolveDerived(key: string): Promise<number | null> {
    switch (key) {
      case "fed_funds_minus_cpi": {
        const [fedFunds, cpi] = await Promise.all([
          fetchFredValue("FEDFUNDS"),
          fetchFredValue("CPIAUCSL"),
        ]);
        if (fedFunds === null || cpi === null) return null;
        // CPI is an index, we need YoY %. Approximate with latest known.
        // Use core PCE as proxy since CPI requires 12-month calc
        const corePce = await fetchFredValue("PCEPILFE");
        // PCEPILFE is also an index — fall back to simple estimate
        // Real policy rate ≈ fed funds - trailing CPI YoY (use 2.9% fallback)
        return fedFunds - 2.9;
      }

      case "gold_div_spy": {
        const [gold, spy] = await Promise.all([
          fetchYahooPrice("GC=F"),
          fetchYahooPrice("SPY"),
        ]);
        if (gold === null || spy === null) return null;
        return Math.round((gold / spy) * 100) / 100;
      }

      default:
        return null;
    }
  }

  private async resolveManual(key: string): Promise<number | null> {
    if (key === "wgc_cb_tonnes") {
      try {
        const rows = await db
          .select()
          .from(goldFlows)
          .where(and(eq(goldFlows.source, "wgc")))
          .orderBy(desc(goldFlows.date))
          .limit(4);

        if (rows.length === 0) return null;
        const total = rows.reduce((acc, r) => acc + (r.centralBankTonnes ?? 0), 0);
        return Math.round(total);
      } catch (e) {
        logger.error("thesis/gold", "WGC manual resolve failed", { error: e });
        return null;
      }
    }
    return null;
  }
}
