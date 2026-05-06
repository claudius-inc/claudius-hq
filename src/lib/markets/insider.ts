/**
 * Insider trades aggregation — extracted from
 * src/app/api/markets/insider/route.ts so it can be called directly during
 * SSR from the markets page.
 */
import { db, insiderTrades } from "@/db";
import { desc, gte } from "drizzle-orm";
import { logger } from "@/lib/logger";

export interface InsiderClusterBuy {
  ticker: string;
  buys: number;
  sells: number;
  buyValue: number;
  sellValue: number;
}

export interface InsiderData {
  buyCount: number;
  sellCount: number;
  buyValue: number;
  sellValue: number;
  ratio: number;
  valueRatio: number;
  level: "bullish" | "neutral" | "bearish";
  totalTrades: number;
  clusterBuys: InsiderClusterBuy[];
  recentTrades: {
    date: string | null;
    company: string | null;
    ticker: string;
    insider: string | null;
    title: string | null;
    type: string;
    shares: number | null;
    price: number | null;
    value: number | null;
  }[];
  source: string;
  note?: string;
  error?: string;
}

interface SentimentInput {
  transactionType: string;
  value: number | null;
}

function calculateSentiment(trades: SentimentInput[]) {
  const buys = trades.filter((t) => t.transactionType === "buy");
  const sells = trades.filter((t) => t.transactionType === "sell");

  const buyValue = buys.reduce((sum, t) => sum + (t.value || 0), 0);
  const sellValue = sells.reduce((sum, t) => sum + (t.value || 0), 0);

  const buyCount = buys.length;
  const sellCount = sells.length;

  const ratio = sellCount > 0 ? buyCount / sellCount : buyCount > 0 ? 2 : 1;
  const valueRatio =
    sellValue > 0 ? buyValue / sellValue : buyValue > 0 ? 2 : 1;

  // Insiders typically sell more than they buy (compensation-related), so
  // thresholds are lower than for congress trades.
  let level: "bullish" | "neutral" | "bearish";
  if (ratio > 0.6 || valueRatio > 0.5) level = "bullish";
  else if (ratio < 0.2 || valueRatio < 0.1) level = "bearish";
  else level = "neutral";

  return {
    buyCount,
    sellCount,
    buyValue: Math.round(buyValue),
    sellValue: Math.round(sellValue),
    ratio: Math.round(ratio * 100) / 100,
    valueRatio: Math.round(valueRatio * 100) / 100,
    level,
  };
}

export async function fetchInsiderData(): Promise<InsiderData> {
  try {
    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
    const dateStr = fourteenDaysAgo.toISOString().split("T")[0];

    const trades = await db
      .select()
      .from(insiderTrades)
      .where(gte(insiderTrades.transactionDate, dateStr))
      .orderBy(desc(insiderTrades.transactionDate))
      .limit(200);

    const sentiment = calculateSentiment(trades);

    const tickerActivity = trades.reduce(
      (acc, t) => {
        if (!acc[t.ticker]) {
          acc[t.ticker] = { buys: 0, sells: 0, buyValue: 0, sellValue: 0 };
        }
        if (t.transactionType === "buy") {
          acc[t.ticker].buys++;
          acc[t.ticker].buyValue += t.value || 0;
        } else if (t.transactionType === "sell") {
          acc[t.ticker].sells++;
          acc[t.ticker].sellValue += t.value || 0;
        }
        return acc;
      },
      {} as Record<
        string,
        { buys: number; sells: number; buyValue: number; sellValue: number }
      >,
    );

    const clusterBuys = Object.entries(tickerActivity)
      .filter(([, stats]) => stats.buys >= 2)
      .sort((a, b) => b[1].buyValue - a[1].buyValue)
      .slice(0, 5)
      .map(([ticker, stats]) => ({ ticker, ...stats }));

    return {
      ...sentiment,
      totalTrades: trades.length,
      clusterBuys,
      recentTrades: trades.slice(0, 15).map((t) => ({
        date: t.transactionDate,
        company: t.company,
        ticker: t.ticker,
        insider: t.insiderName,
        title: t.title,
        type: t.transactionType,
        shares: t.shares,
        price: t.price,
        value: t.value,
      })),
      source: "SEC Form 4 (synced)",
      note: "Insider transaction filings",
    };
  } catch (e) {
    logger.error("lib/insider", "fetchInsiderData error", { error: e });
    return {
      buyCount: 0,
      sellCount: 0,
      buyValue: 0,
      sellValue: 0,
      ratio: 1,
      valueRatio: 1,
      level: "neutral",
      totalTrades: 0,
      clusterBuys: [],
      recentTrades: [],
      source: "database",
      error: "Failed to fetch insider trading data",
    };
  }
}
