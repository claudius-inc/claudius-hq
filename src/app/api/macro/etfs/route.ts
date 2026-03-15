import { NextRequest, NextResponse } from "next/server";
import { checkApiAuth, unauthorizedResponse } from "@/lib/api-auth";
import YahooFinance from "yahoo-finance2";
import { getCache, setCache, CACHE_KEYS } from "@/lib/market-cache";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

interface EtfConfig {
  ticker: string;
  name: string;
  description: string;
  whyItMatters: string;
  ranges: Array<{
    label: string;
    min: number | null;
    max: number | null;
    meaning: string;
    color: string;
  }>;
  affectedAssets: string[];
  invertedSignal?: boolean; // true = price up means yields down
}

const MARKET_ETFS: EtfConfig[] = [
  {
    ticker: "TLT",
    name: "TLT (20+ Year Treasury Bonds)",
    description:
      "iShares 20+ Year Treasury Bond ETF. Tracks long-duration US government bonds. Inverse proxy for long-term yield expectations.",
    whyItMatters:
      "TLT falling = long-term yields rising = tighter financial conditions = headwind for growth stocks. TLT rising = yields dropping = either flight to safety or Fed dovishness. Watch TLT relative to its 52-week range for regime signals.",
    ranges: [
      {
        label: "Bond Rally",
        min: 94,
        max: null,
        meaning: "Yields dropping sharply — recession fears or Fed pivot",
        color: "blue",
      },
      {
        label: "Neutral",
        min: 88,
        max: 94,
        meaning: "Range-bound — no strong conviction on rates",
        color: "gray",
      },
      {
        label: "Yield Pressure",
        min: 83,
        max: 88,
        meaning: "Yields elevated — tight money, growth headwind",
        color: "amber",
      },
      {
        label: "Bond Selloff",
        min: null,
        max: 83,
        meaning: "Yields surging — danger zone for all risk assets",
        color: "red",
      },
    ],
    affectedAssets: [
      "Growth stocks",
      "Real estate",
      "Utilities",
      "Mortgage rates",
      "Corporate bonds",
    ],
    invertedSignal: true,
  },
  {
    ticker: "ITA",
    name: "ITA (Aerospace & Defense)",
    description:
      "iShares U.S. Aerospace & Defense ETF. Tracks major defense contractors — Lockheed Martin, RTX, Northrop Grumman, etc.",
    whyItMatters:
      "ITA surging signals geopolitical risk premium — defense spending expectations rising. Often leads during military escalation, conflicts, or increased global tension. Watch ITA vs XLI for pure defense momentum.",
    ranges: [
      {
        label: "Defense Rally",
        min: null,
        max: null,
        meaning: "Near 52w high — strong defense premium",
        color: "green",
      },
      {
        label: "Neutral",
        min: null,
        max: null,
        meaning: "Range-bound — baseline defense spending",
        color: "gray",
      },
      {
        label: "Weakness",
        min: null,
        max: null,
        meaning: "Below average — peace dividend / rotation out",
        color: "amber",
      },
    ],
    affectedAssets: [
      "Defense contractors",
      "Cybersecurity",
      "Government services",
      "Aerospace suppliers",
    ],
  },
];

function interpretEtf(
  config: EtfConfig,
  price: number
): { label: string; meaning: string; color: string } | null {
  for (const range of config.ranges) {
    const aboveMin = range.min === null || price >= range.min;
    const belowMax = range.max === null || price < range.max;
    if (aboveMin && belowMax) {
      return { label: range.label, meaning: range.meaning, color: range.color };
    }
  }
  return null;
}

async function fetchMacroEtfData() {
  const yf = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

  const results = await Promise.all(
    MARKET_ETFS.map(async (etf) => {
      try {
        const quote = (await yf.quote(etf.ticker)) as {
          regularMarketPrice?: number;
          regularMarketChange?: number;
          regularMarketChangePercent?: number;
          regularMarketPreviousClose?: number;
          fiftyTwoWeekLow?: number;
          fiftyTwoWeekHigh?: number;
          fiftyDayAverage?: number;
          twoHundredDayAverage?: number;
        };

        const price = quote.regularMarketPrice ?? 0;
        const interpretation = interpretEtf(etf, price);

        // Position within 52w range (0-100%)
        const low52 = quote.fiftyTwoWeekLow ?? price;
        const high52 = quote.fiftyTwoWeekHigh ?? price;
        const rangePosition =
          high52 !== low52
            ? Math.round(((price - low52) / (high52 - low52)) * 100)
            : 50;

        return {
          ticker: etf.ticker,
          name: etf.name,
          description: etf.description,
          whyItMatters: etf.whyItMatters,
          ranges: etf.ranges,
          affectedAssets: etf.affectedAssets,
          data: {
            price,
            change: quote.regularMarketChange ?? 0,
            changePercent: quote.regularMarketChangePercent ?? 0,
            previousClose: quote.regularMarketPreviousClose ?? 0,
            fiftyTwoWeekLow: low52,
            fiftyTwoWeekHigh: high52,
            fiftyDayAvg: quote.fiftyDayAverage ?? 0,
            twoHundredDayAvg: quote.twoHundredDayAverage ?? 0,
            rangePosition,
          },
          interpretation,
        };
      } catch (err) {
        logger.error("api/macro/etfs", `Error fetching ${etf.ticker}`, { error: err });
        return {
          ticker: etf.ticker,
          name: etf.name,
          description: etf.description,
          whyItMatters: etf.whyItMatters,
          ranges: etf.ranges,
          affectedAssets: etf.affectedAssets,
          data: null,
          interpretation: null,
        };
      }
    })
  );

  return { etfs: results, lastUpdated: new Date().toISOString() };
}

export async function GET(request: NextRequest) {
  if (!checkApiAuth(request)) return unauthorizedResponse();
  try {
  if (!checkApiAuth(request)) return unauthorizedResponse();
    const fresh = request.nextUrl.searchParams.get("fresh") === "true";

    if (!fresh) {
      const cached = await getCache<Record<string, unknown>>(CACHE_KEYS.MACRO_ETFS, 300);
      if (cached && !cached.isStale) {
        return NextResponse.json({
          ...cached.data,
          cached: true,
          cacheAge: cached.updatedAt,
        });
      }
      if (cached) {
        fetchMacroEtfData()
          .then((data) => setCache(CACHE_KEYS.MACRO_ETFS, data))
          .catch((e) => logger.error("api/macro/etfs", "Background macro ETF refresh failed", { error: e }));
        return NextResponse.json({
          ...cached.data,
          cached: true,
          cacheAge: cached.updatedAt,
          isStale: true,
        });
      }
    }

    const data = await fetchMacroEtfData();
    await setCache(CACHE_KEYS.MACRO_ETFS, data);
    return NextResponse.json({ ...data, cached: false });
  } catch (err) {
    logger.error("api/macro/etfs", "ETF fetch error", { error: err });
    return NextResponse.json({ etfs: [], lastUpdated: new Date().toISOString() });
  }
}
