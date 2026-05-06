import { NextRequest, NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";
import { getCache, setCache, CACHE_KEYS } from "@/lib/cache/market-cache";
import { logger } from "@/lib/logger";

const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

export const dynamic = "force-dynamic";

interface QuoteResult {
  regularMarketPrice?: number;
  regularMarketPreviousClose?: number;
  regularMarketChange?: number;
  regularMarketChangePercent?: number;
  fiftyTwoWeekHigh?: number;
  fiftyTwoWeekLow?: number;
  fiftyDayAverage?: number;
  twoHundredDayAverage?: number;
}

interface OilData {
  wti: {
    price: number | null;
    change: number | null;
    changePercent: number | null;
    fiftyTwoWeekHigh: number | null;
    fiftyTwoWeekLow: number | null;
    fiftyDayAvg: number | null;
    twoHundredDayAvg: number | null;
  } | null;
  brent: {
    price: number | null;
    change: number | null;
    changePercent: number | null;
    fiftyTwoWeekHigh: number | null;
    fiftyTwoWeekLow: number | null;
    fiftyDayAvg: number | null;
    twoHundredDayAvg: number | null;
  } | null;
  spread: number | null;
  keyLevels: {
    level: number;
    significance: string;
  }[];
  context: {
    geopolitical: string[];
    supply: string[];
    seasonal: string;
  };
  updatedAt: string;
}

// Key support/resistance levels for WTI
const OIL_KEY_LEVELS = [
  { level: 60, significance: "Major support - recession/demand destruction" },
  { level: 65, significance: "Psychological support - OPEC+ floor target" },
  { level: 70, significance: "Technical support - 2024 range low" },
  { level: 80, significance: "Equilibrium zone - balanced market" },
  { level: 90, significance: "Resistance - inflationary concern" },
  { level: 100, significance: "Major resistance - demand destruction begins" },
  { level: 120, significance: "Crisis level - war/supply shock" },
];

// Seasonal patterns
function getSeasonalContext(): string {
  const month = new Date().getMonth();
  if (month >= 4 && month <= 7) {
    return "Summer driving season - historically bullish for gasoline/crude demand";
  }
  if (month >= 9 && month <= 11) {
    return "Refinery maintenance season - reduced crude demand";
  }
  if (month === 0 || month === 1) {
    return "Winter heating demand - mixed crude impact, supportive for heating oil";
  }
  return "Spring shoulder season - typically lower demand";
}

// Fetch fresh oil data from Yahoo Finance
async function fetchOilData(): Promise<OilData> {
  let wtiData = null;
  let brentData = null;

  try {
    // Fetch WTI Crude (CL=F)
    const wtiQuote = await yahooFinance.quote("CL=F") as QuoteResult;
    if (wtiQuote?.regularMarketPrice) {
      wtiData = {
        price: wtiQuote.regularMarketPrice,
        change: wtiQuote.regularMarketChange || null,
        changePercent: wtiQuote.regularMarketChangePercent || null,
        fiftyTwoWeekHigh: wtiQuote.fiftyTwoWeekHigh || null,
        fiftyTwoWeekLow: wtiQuote.fiftyTwoWeekLow || null,
        fiftyDayAvg: wtiQuote.fiftyDayAverage || null,
        twoHundredDayAvg: wtiQuote.twoHundredDayAverage || null,
      };
    }
  } catch (e) {
    logger.error("api/oil", "Failed to fetch WTI", { error: e });
  }

  try {
    // Fetch Brent Crude (BZ=F)
    const brentQuote = await yahooFinance.quote("BZ=F") as QuoteResult;
    if (brentQuote?.regularMarketPrice) {
      brentData = {
        price: brentQuote.regularMarketPrice,
        change: brentQuote.regularMarketChange || null,
        changePercent: brentQuote.regularMarketChangePercent || null,
        fiftyTwoWeekHigh: brentQuote.fiftyTwoWeekHigh || null,
        fiftyTwoWeekLow: brentQuote.fiftyTwoWeekLow || null,
        fiftyDayAvg: brentQuote.fiftyDayAverage || null,
        twoHundredDayAvg: brentQuote.twoHundredDayAverage || null,
      };
    }
  } catch (e) {
    logger.error("api/oil", "Failed to fetch Brent", { error: e });
  }

  // Calculate Brent-WTI spread
  let spread = null;
  if (wtiData?.price && brentData?.price) {
    spread = brentData.price - wtiData.price;
  }

  // Current geopolitical context (would be updated manually or via news API)
  const geopoliticalFactors = [
    "Middle East tensions - Red Sea shipping disruptions",
    "Russia-Ukraine war - Russian supply under sanctions",
    "US shale production at record highs",
    "OPEC+ maintaining production cuts",
  ];

  const supplyFactors = [
    "US Strategic Petroleum Reserve at 40-year lows",
    "Global refinery capacity constraints",
    "China economic slowdown affecting demand",
  ];

  return {
    wti: wtiData,
    brent: brentData,
    spread,
    keyLevels: OIL_KEY_LEVELS,
    context: {
      geopolitical: geopoliticalFactors,
      supply: supplyFactors,
      seasonal: getSeasonalContext(),
    },
    updatedAt: new Date().toISOString(),
  };
}

export async function GET(request: NextRequest) {
  try {
    const fresh = request.nextUrl.searchParams.get("fresh") === "true";

    // Check cache first (unless forcing fresh)
    if (!fresh) {
      const cached = await getCache<OilData>(CACHE_KEYS.OIL, 300); // 5 min max age
      if (cached && !cached.isStale) {
        return NextResponse.json({
          ...cached.data,
          cached: true,
          cacheAge: cached.updatedAt,
        });
      }

      // Return stale data immediately, refresh in background
      if (cached) {
        // Fire and forget background refresh
        fetchOilData()
          .then((data) => setCache(CACHE_KEYS.OIL, data))
          .catch((e) => logger.error("api/oil", "Background oil refresh failed", { error: e }));

        return NextResponse.json({
          ...cached.data,
          cached: true,
          cacheAge: cached.updatedAt,
          isStale: true,
        });
      }
    }

    // Fetch fresh data
    const data = await fetchOilData();
    
    // Update cache
    await setCache(CACHE_KEYS.OIL, data);

    return NextResponse.json({
      ...data,
      cached: false,
    });
  } catch (e) {
    logger.error("api/oil", "Oil API error", { error: e });
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
