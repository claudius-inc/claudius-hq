/**
 * Regime panel data — extracted from src/app/api/markets/regime/route.ts so
 * it can be called directly from a Server Component during SSR.
 *
 * Aggregates crowding scores across major market ETFs + sector ETFs into
 * the shape consumed by `MarketMood`'s positioning tab.
 */
import {
  getCrowdingScores,
  aggregateCrowdingScores,
  getCrowdingDescription,
  type CrowdingScore,
  type CrowdingLevel,
} from "@/lib/markets/crowding";
import { logger } from "@/lib/logger";

const MARKET_ETFS = [
  "SPY",
  "QQQ",
  "IWM",
  "EFA",
  "EEM",
  "VTI",
  "VXUS",
  "AGG",
  "GLD",
  "TLT",
];

const SECTOR_ETFS = [
  { ticker: "XLK", name: "Technology" },
  { ticker: "XLF", name: "Financials" },
  { ticker: "XLE", name: "Energy" },
  { ticker: "XLV", name: "Healthcare" },
  { ticker: "XLY", name: "Consumer Disc" },
  { ticker: "XLP", name: "Consumer Stap" },
  { ticker: "XLI", name: "Industrials" },
  { ticker: "XLB", name: "Materials" },
  { ticker: "XLU", name: "Utilities" },
  { ticker: "XLRE", name: "Real Estate" },
];

const ETF_NAMES: Record<string, string> = {
  SPY: "S&P 500",
  QQQ: "Nasdaq 100",
  IWM: "Russell 2000",
  EFA: "Developed ex-US",
  EEM: "Emerging Markets",
  VTI: "Total US Market",
  VXUS: "Total International",
  AGG: "US Aggregate Bonds",
  GLD: "Gold",
  TLT: "20+ Year Treasury",
};

export interface RegimePanelData {
  overall: {
    score: number;
    level: CrowdingLevel;
    description: string;
    components: {
      ownership: number;
      analyst: number;
      positioning: number;
    };
  };
  breakdown: {
    ticker: string;
    name: string;
    score: number;
    level: CrowdingLevel;
  }[];
  sectors: {
    ticker: string;
    name: string;
    score: number;
    level: CrowdingLevel;
  }[];
  timestamp: string;
}

export async function fetchRegimePanelData(): Promise<RegimePanelData | null> {
  try {
    const allTickers = [
      ...MARKET_ETFS,
      ...SECTOR_ETFS.map((s) => s.ticker),
    ];
    const crowdingMap = await getCrowdingScores(allTickers);

    const marketScores = MARKET_ETFS
      .map((ticker) => crowdingMap.get(ticker))
      .filter((s): s is CrowdingScore => s !== undefined);

    const overall = aggregateCrowdingScores(marketScores);

    const breakdown = MARKET_ETFS.map((ticker) => {
      const score = crowdingMap.get(ticker);
      return {
        ticker,
        name: ETF_NAMES[ticker] ?? ticker,
        score: score?.score ?? 50,
        level: score?.level ?? ("forming" as CrowdingLevel),
      };
    });

    const sectors = SECTOR_ETFS.map(({ ticker, name }) => {
      const score = crowdingMap.get(ticker);
      return {
        ticker,
        name,
        score: score?.score ?? 50,
        level: score?.level ?? ("forming" as CrowdingLevel),
      };
    });

    return {
      overall: {
        score: overall.score,
        level: overall.level,
        description: getCrowdingDescription(overall.level),
        components: overall.components,
      },
      breakdown,
      sectors,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    logger.error("lib/regime-panel", "Failed to build regime panel data", {
      error,
    });
    return null;
  }
}
