import YahooFinance from "yahoo-finance2";

const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

interface SecondaryIndex {
  name: string;
  ticker: string;
  pe: number | null;
  change24h: number | null;
}

export interface MarketValuation {
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
  secondaryIndex?: SecondaryIndex;
}

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
  CHINA: {
    undervalued: 10,
    fair: 14,
    overvalued: 18,
    mean: 12,
    range: { min: 6, max: 30 },
  },
  HONG_KONG: {
    undervalued: 11,
    fair: 17,
    overvalued: 22,
    mean: 15,
    range: { min: 6, max: 30 },
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

async function fetchMarketData(ticker: string): Promise<MarketData> {
  try {
    const quote = await yahooFinance.quoteSummary(ticker, {
      modules: ["summaryDetail", "defaultKeyStatistics", "price"],
    });

    const priceData = quote.price;
    const summaryData = quote.summaryDetail;
    const statsData = quote.defaultKeyStatistics;

    const divYield = summaryData?.dividendYield;

    return {
      price: priceData?.regularMarketPrice ?? null,
      change24h: priceData?.regularMarketChangePercent ?? null,
      pe: summaryData?.trailingPE ?? null,
      dividendYield: divYield ? Number(divYield) * 100 : null,
      priceToBook: statsData?.priceToBook ?? null,
    };
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

async function fetchETFPE(ticker: string): Promise<number | null> {
  try {
    const quote = await yahooFinance.quoteSummary(ticker, {
      modules: ["summaryDetail"],
    });
    return quote.summaryDetail?.trailingPE ?? null;
  } catch (e) {
    console.error(`Error fetching ETF PE for ${ticker}:`, e);
    return null;
  }
}

async function fetchUSCape(): Promise<number | null> {
  try {
    const quote = await yahooFinance.quoteSummary("SPY", {
      modules: ["summaryDetail"],
    });
    const ttmPE = quote.summaryDetail?.trailingPE;
    if (ttmPE && typeof ttmPE === "number") {
      return ttmPE * 1.5;
    }
    return null;
  } catch (e) {
    console.error("Error fetching CAPE:", e);
    return null;
  }
}

export async function fetchValuationData(): Promise<{ valuations: MarketValuation[]; updatedAt: string }> {
  const [usData, jpData, sgData, cnData, hsiData, usCape, jpPE, sgPE, cnPE, hsiPE] = await Promise.all([
    fetchMarketData("SPY"),
    fetchMarketData("^N225"),
    fetchMarketData("^STI"),
    fetchMarketData("000300.SS"),
    fetchMarketData("^HSI"),
    fetchUSCape(),
    fetchETFPE("EWJ"),
    fetchETFPE("EWS"),
    fetchETFPE("ASHR"),
    fetchETFPE("EWH"),
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
      value: jpPE,
      historicalMean: ZONES.JAPAN.mean,
      historicalRange: ZONES.JAPAN.range,
      zone: jpPE ? getZone(jpPE, ZONES.JAPAN) : "FAIR",
      percentOfMean: jpPE ? Math.round((jpPE / ZONES.JAPAN.mean) * 100) : 100,
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
      value: sgPE,
      historicalMean: ZONES.SINGAPORE.mean,
      historicalRange: ZONES.SINGAPORE.range,
      zone: sgPE ? getZone(sgPE, ZONES.SINGAPORE) : "FAIR",
      percentOfMean: sgPE ? Math.round((sgPE / ZONES.SINGAPORE.mean) * 100) : 100,
      dividendYield: sgData.dividendYield,
      priceToBook: sgData.priceToBook,
      price: sgData.price,
      change24h: sgData.change24h,
    },
    {
      market: "CHINA",
      country: "China",
      flag: "🇨🇳",
      index: "CSI 300",
      ticker: "000300.SS",
      metric: "TTM_PE",
      value: cnPE,
      historicalMean: ZONES.CHINA.mean,
      historicalRange: ZONES.CHINA.range,
      zone: cnPE ? getZone(cnPE, ZONES.CHINA) : "FAIR",
      percentOfMean: cnPE ? Math.round((cnPE / ZONES.CHINA.mean) * 100) : 100,
      dividendYield: cnData.dividendYield,
      priceToBook: cnData.priceToBook,
      price: cnData.price,
      change24h: cnData.change24h,
    },
    {
      market: "HONG_KONG",
      country: "Hong Kong",
      flag: "🇭🇰",
      index: "Hang Seng",
      ticker: "^HSI",
      metric: "TTM_PE",
      value: hsiPE,
      historicalMean: ZONES.HONG_KONG.mean,
      historicalRange: ZONES.HONG_KONG.range,
      zone: hsiPE ? getZone(hsiPE, ZONES.HONG_KONG) : "FAIR",
      percentOfMean: hsiPE ? Math.round((hsiPE / ZONES.HONG_KONG.mean) * 100) : 100,
      dividendYield: hsiData.dividendYield,
      priceToBook: hsiData.priceToBook,
      price: hsiData.price,
      change24h: hsiData.change24h,
    },
  ];

  return { valuations, updatedAt: new Date().toISOString() };
}
