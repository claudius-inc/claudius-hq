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
  // CAPE for the US row when multpl.com fetch succeeds; TTM_PE everywhere
  // else (and as the US fallback if the Shiller fetch fails).
  metric: "CAPE" | "TTM_PE";
  value: number | null;
  historicalMean: number;
  historicalRange: { min: number; max: number };
  thresholds: { undervalued: number; overvalued: number };
  zone: "UNDERVALUED" | "FAIR" | "OVERVALUED";
  percentOfMean: number;
  dividendYield: number | null;
  priceToBook: number | null;
  price: number | null;
  change24h: number | null;
  secondaryIndex?: SecondaryIndex;
  // Optional tactical bias for the US row only — populated client-side
  // by merging /api/valuation/expected-returns into the strip. Other
  // markets will always have this undefined. The strip renders a small
  // Bull / Bear pill when this is non-neutral.
  tacticalBias?: "bullish" | "neutral" | "bearish";
}

const ZONES = {
  US: {
    undervalued: 14,
    overvalued: 22,
    mean: 17,
    range: { min: 5, max: 45 },
  },
  JAPAN: {
    undervalued: 12,
    overvalued: 18,
    mean: 15,
    range: { min: 8, max: 35 },
  },
  SINGAPORE: {
    undervalued: 11,
    overvalued: 15,
    mean: 13,
    range: { min: 8, max: 25 },
  },
  CHINA: {
    undervalued: 10,
    overvalued: 14,
    mean: 12,
    range: { min: 6, max: 30 },
  },
  HONG_KONG: {
    undervalued: 11,
    overvalued: 17,
    mean: 15,
    range: { min: 6, max: 30 },
  },
};

function getZone(
  value: number,
  thresholds: { undervalued: number; overvalued: number }
): MarketValuation["zone"] {
  if (value < thresholds.undervalued) return "UNDERVALUED";
  if (value < thresholds.overvalued) return "FAIR";
  return "OVERVALUED";
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

/**
 * Fetch the real Shiller CAPE Ratio (Cyclically Adjusted P/E, 10-year
 * trailing real earnings) from multpl.com — the canonical free source.
 *
 * Why multpl.com: FRED does not publish Shiller CAPE as a series; the
 * authoritative source is Robert Shiller's Yale dataset, which multpl.com
 * mirrors and updates daily. multpl.com has been stable for years and
 * requires no API key. The page is server-rendered and has a known
 * "Current S&P 500 Shiller CAPE Ratio" element near the top.
 *
 * Strategy: GET the page once a day (Shiller PE updates monthly anyway),
 * try multiple regex patterns for resilience against minor markup tweaks,
 * sanity-bound the result to a plausible CAPE range (5–100), and return
 * `null` on any failure so the caller can fall back to TTM P/E.
 */
async function fetchShillerCape(): Promise<number | null> {
  try {
    const res = await fetch("https://www.multpl.com/shiller-pe", {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; claudius-hq/1.0; valuation strip)",
      },
      next: { revalidate: 86400 }, // 24h — Shiller updates monthly
    });
    if (!res.ok) {
      console.error(
        `multpl.com Shiller PE fetch failed with status ${res.status}`,
      );
      return null;
    }
    const html = await res.text();
    // Try several patterns in order of specificity. multpl.com renders
    // the current value inside a div near the top of the page; the exact
    // markup has shifted over the years so we cast a wide net.
    const patterns: RegExp[] = [
      /Current[^<]*Shiller[^<]*[:\s]*<[^>]*>\s*<[^>]*>\s*([0-9]{1,2}\.[0-9]{1,2})/i,
      /id=["']current["'][\s\S]{0,500}?([0-9]{2}\.[0-9]{1,2})/i,
      /Shiller PE Ratio[\s\S]{0,500}?<b[^>]*>\s*([0-9]{1,2}\.[0-9]{1,2})/i,
      /Shiller PE Ratio[\s\S]{0,800}?>\s*([0-9]{2}\.[0-9]{1,2})\s*</i,
    ];
    for (const re of patterns) {
      const m = html.match(re);
      if (m) {
        const v = parseFloat(m[1]);
        if (isFinite(v) && v > 5 && v < 100) {
          return Math.round(v * 100) / 100;
        }
      }
    }
    console.error(
      "multpl.com Shiller PE: no pattern matched — markup may have changed",
    );
    return null;
  } catch (e) {
    console.error("Error fetching Shiller CAPE from multpl.com:", e);
    return null;
  }
}

export async function fetchValuationData(): Promise<{ valuations: MarketValuation[]; updatedAt: string }> {
  const [usData, jpData, sgData, cnData, hsiData, shillerCape, spyTtmPe, jpPE, sgPE, cnPE, hsiPE] = await Promise.all([
    fetchMarketData("SPY"),
    fetchMarketData("^N225"),
    fetchMarketData("^STI"),
    fetchMarketData("000300.SS"),
    fetchMarketData("^HSI"),
    fetchShillerCape(),
    fetchETFPE("SPY"),
    fetchETFPE("EWJ"),
    fetchETFPE("EWS"),
    fetchETFPE("ASHR"),
    fetchETFPE("EWH"),
  ]);

  // Real Shiller CAPE if multpl.com responded; otherwise honest TTM P/E.
  // The metric label flips with the data so the strip never lies about
  // what it's showing.
  const usMetric: "CAPE" | "TTM_PE" = shillerCape != null ? "CAPE" : "TTM_PE";
  const usValue: number | null = shillerCape ?? spyTtmPe;

  const valuations: MarketValuation[] = [
    {
      market: "US",
      country: "United States",
      flag: "🇺🇸",
      index: "S&P 500",
      ticker: "SPY",
      metric: usMetric,
      value: usValue,
      historicalMean: ZONES.US.mean,
      historicalRange: ZONES.US.range,
      thresholds: { undervalued: ZONES.US.undervalued, overvalued: ZONES.US.overvalued },
      zone: usValue != null ? getZone(usValue, ZONES.US) : "FAIR",
      percentOfMean: usValue != null ? Math.round((usValue / ZONES.US.mean) * 100) : 100,
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
      thresholds: { undervalued: ZONES.JAPAN.undervalued, overvalued: ZONES.JAPAN.overvalued },
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
      thresholds: { undervalued: ZONES.SINGAPORE.undervalued, overvalued: ZONES.SINGAPORE.overvalued },
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
      thresholds: { undervalued: ZONES.CHINA.undervalued, overvalued: ZONES.CHINA.overvalued },
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
      thresholds: { undervalued: ZONES.HONG_KONG.undervalued, overvalued: ZONES.HONG_KONG.overvalued },
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
