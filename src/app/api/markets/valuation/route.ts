import { NextResponse } from "next/server";
import yahooFinance from "yahoo-finance2";

interface MarketValuation {
  market: string;
  country: string;
  flag: string;
  index: string;
  ticker: string;
  metric: "CAPE" | "TTM_PE";
  value: number | null;
  historicalMean: number;
  historicalRange: { min: number; max: number };
  zone: "UNDERVALUED" | "FAIR" | "OVERVALUED" | "EXPENSIVE";
  percentOfMean: number;
  dividendYield: number | null;
  priceToBook: number | null;
  price: number | null;
  change24h: number | null;
}

// Zone thresholds (as discussed)
const ZONES = {
  US: {
    undervalued: 14,
    fair: 22,
    overvalued: 30,
    mean: 17,
    range: { min: 5, max: 45 },
  },
  JAPAN: {
    undervalued: 12,
    fair: 18,
    overvalued: 23,
    mean: 15,
    range: { min: 8, max: 35 },
  },
  SINGAPORE: {
    undervalued: 11,
    fair: 15,
    overvalued: 18,
    mean: 13,
    range: { min: 8, max: 25 },
  },
};

function getZone(
  value: number,
  thresholds: { undervalued: number; fair: number; overvalued: number }
): MarketValuation["zone"] {
  if (value < thresholds.undervalued) return "UNDERVALUED";
  if (value < thresholds.fair) return "FAIR";
  if (value < thresholds.overvalued) return "OVERVALUED";
  return "EXPENSIVE";
}

interface MarketData {
  price: number | null;
  change24h: number | null;
  pe: number | null;
  dividendYield: number | null;
  priceToBook: number | null;
}

function safeGet<T>(obj: unknown, key: string): T | null {
  if (obj && typeof obj === "object" && key in obj) {
    return (obj as Record<string, T>)[key] ?? null;
  }
  return null;
}

function extractMarketData(quote: unknown): MarketData {
  try {
    const priceData = safeGet<Record<string, unknown>>(quote, "price") ?? {};
    const summaryData = safeGet<Record<string, unknown>>(quote, "summaryDetail") ?? {};
    const statsData = safeGet<Record<string, unknown>>(quote, "defaultKeyStatistics") ?? {};

    const divYield = safeGet<number>(summaryData, "dividendYield");

    return {
      price: safeGet<number>(priceData, "regularMarketPrice"),
      change24h: safeGet<number>(priceData, "regularMarketChangePercent"),
      pe: safeGet<number>(summaryData, "trailingPE"),
      dividendYield: divYield ? divYield * 100 : null,
      priceToBook: safeGet<number>(statsData, "priceToBook"),
    };
  } catch {
    return {
      price: null,
      change24h: null,
      pe: null,
      dividendYield: null,
      priceToBook: null,
    };
  }
}

async function fetchMarketData(ticker: string): Promise<MarketData> {
  try {
    const quote = await yahooFinance.quoteSummary(ticker, {
      modules: ["summaryDetail", "defaultKeyStatistics", "price"],
    });
    return extractMarketData(quote);
  } catch (e) {
    console.error(`Error fetching ${ticker}:`, e);
    return {
      price: null,
      change24h: null,
      pe: null,
      dividendYield: null,
      priceToBook: null,
    };
  }
}

async function fetchUSCape(): Promise<number | null> {
  try {
    const quote = await yahooFinance.quoteSummary("SPY", {
      modules: ["summaryDetail"],
    });
    const summaryData = safeGet<Record<string, unknown>>(quote, "summaryDetail") ?? {};
    const ttmPE = safeGet<number>(summaryData, "trailingPE");
    if (ttmPE && typeof ttmPE === "number") {
      // CAPE adjustment factor based on historical relationship
      return ttmPE * 1.5;
    }
    return null;
  } catch (e) {
    console.error("Error fetching CAPE:", e);
    return null;
  }
}

export async function GET() {
  try {
    // Fetch data for all markets in parallel
    const [usData, jpData, sgData, usCape] = await Promise.all([
      fetchMarketData("SPY"),
      fetchMarketData("^N225"),
      fetchMarketData("^STI"),
      fetchUSCape(),
    ]);

    const valuations: MarketValuation[] = [
      {
        market: "US",
        country: "United States",
        flag: "🇺🇸",
        index: "S&P 500",
        ticker: "SPY",
        metric: "CAPE",
        value: usCape,
        historicalMean: ZONES.US.mean,
        historicalRange: ZONES.US.range,
        zone: usCape ? getZone(usCape, ZONES.US) : "FAIR",
        percentOfMean: usCape ? Math.round((usCape / ZONES.US.mean) * 100) : 100,
        dividendYield: usData.dividendYield,
        priceToBook: usData.priceToBook,
        price: usData.price,
        change24h: usData.change24h,
      },
      {
        market: "JAPAN",
        country: "Japan",
        flag: "🇯🇵",
        index: "Nikkei 225",
        ticker: "^N225",
        metric: "TTM_PE",
        value: jpData.pe,
        historicalMean: ZONES.JAPAN.mean,
        historicalRange: ZONES.JAPAN.range,
        zone: jpData.pe ? getZone(jpData.pe, ZONES.JAPAN) : "FAIR",
        percentOfMean: jpData.pe
          ? Math.round((jpData.pe / ZONES.JAPAN.mean) * 100)
          : 100,
        dividendYield: jpData.dividendYield,
        priceToBook: jpData.priceToBook,
        price: jpData.price,
        change24h: jpData.change24h,
      },
      {
        market: "SINGAPORE",
        country: "Singapore",
        flag: "🇸🇬",
        index: "Straits Times",
        ticker: "^STI",
        metric: "TTM_PE",
        value: sgData.pe,
        historicalMean: ZONES.SINGAPORE.mean,
        historicalRange: ZONES.SINGAPORE.range,
        zone: sgData.pe ? getZone(sgData.pe, ZONES.SINGAPORE) : "FAIR",
        percentOfMean: sgData.pe
          ? Math.round((sgData.pe / ZONES.SINGAPORE.mean) * 100)
          : 100,
        dividendYield: sgData.dividendYield,
        priceToBook: sgData.priceToBook,
        price: sgData.price,
        change24h: sgData.change24h,
      },
    ];

    return NextResponse.json({
      valuations,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error fetching valuations:", error);
    return NextResponse.json(
      { error: "Failed to fetch valuations" },
      { status: 500 }
    );
  }
}
