import { NextRequest, NextResponse } from "next/server";
import {
  getCrowdingScores,
  aggregateCrowdingScores,
  getCrowdingDescription,
  CrowdingScore,
  CrowdingLevel,
} from "@/lib/crowding";
import { logger } from "@/lib/logger";

// Major ETFs to aggregate for market-wide crowding
const MARKET_ETFS = [
  "SPY",    // S&P 500
  "QQQ",    // Nasdaq 100
  "IWM",    // Russell 2000
  "EFA",    // EAFE (Developed ex-US)
  "EEM",    // Emerging Markets
  "VTI",    // Total US Market
  "VXUS",   // Total International
  "AGG",    // US Aggregate Bond
  "GLD",    // Gold
  "TLT",    // 20+ Year Treasury
];

// Sector ETFs for sector breakdown
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

export interface RegimeResponse {
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

// Cache for 15 minutes
export const revalidate = 900;

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    // Fetch crowding for market ETFs and sector ETFs in parallel
    const allTickers = [...MARKET_ETFS, ...SECTOR_ETFS.map(s => s.ticker)];
    const crowdingMap = await getCrowdingScores(allTickers);

    // Get market ETF scores
    const marketScores = MARKET_ETFS
      .map(ticker => crowdingMap.get(ticker))
      .filter((s): s is CrowdingScore => s !== undefined);

    // Aggregate overall market crowding
    const overall = aggregateCrowdingScores(marketScores);

    // Build breakdown for market ETFs
    const breakdown = MARKET_ETFS.map(ticker => {
      const score = crowdingMap.get(ticker);
      return {
        ticker,
        name: getEtfName(ticker),
        score: score?.score ?? 50,
        level: score?.level ?? "forming" as CrowdingLevel,
      };
    });

    // Build sector breakdown
    const sectors = SECTOR_ETFS.map(({ ticker, name }) => {
      const score = crowdingMap.get(ticker);
      return {
        ticker,
        name,
        score: score?.score ?? 50,
        level: score?.level ?? "forming" as CrowdingLevel,
      };
    });

    const response: RegimeResponse = {
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

    return NextResponse.json(response, {
      headers: {
        "Cache-Control": "public, s-maxage=900, stale-while-revalidate=1800",
      },
    });
  } catch (error) {
    logger.error("api/markets/regime", "Failed to get regime data", { error });
    return NextResponse.json(
      { error: "Failed to fetch regime data" },
      { status: 500 }
    );
  }
}

function getEtfName(ticker: string): string {
  const names: Record<string, string> = {
    SPY: "S&P 500",
    QQQ: "Nasdaq 100",
    IWM: "Russell 2000",
    EFA: "EAFE",
    EEM: "Emerging Mkts",
    VTI: "Total US",
    VXUS: "Intl Stocks",
    AGG: "US Bonds",
    GLD: "Gold",
    TLT: "Long Treasury",
  };
  return names[ticker] || ticker;
}
