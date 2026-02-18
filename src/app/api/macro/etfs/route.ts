import { NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";

export const revalidate = 300; // 5 min cache

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

export async function GET() {
  try {
    const yf = new YahooFinance();

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
          console.error(`Error fetching ${etf.ticker}:`, err);
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

    return NextResponse.json({ etfs: results, lastUpdated: new Date().toISOString() });
  } catch (err) {
    console.error("ETF fetch error:", err);
    return NextResponse.json({ etfs: [], lastUpdated: new Date().toISOString() });
  }
}
