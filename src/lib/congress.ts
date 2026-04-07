/**
 * Congress trades aggregation — extracted from
 * src/app/api/markets/congress/route.ts so it can be called directly during
 * SSR from the markets page.
 */
import { db, congressTrades } from "@/db";
import { desc } from "drizzle-orm";
import { logger } from "@/lib/logger";

export interface CongressData {
  buyCount: number;
  sellCount: number;
  ratio: number;
  level: "bullish" | "neutral" | "bearish";
  totalTrades: number;
  topTickers: { ticker: string; count: number }[];
  recentTrades: {
    date: string | null;
    member: string | null;
    party: string | null;
    state: string | null;
    chamber: string | null;
    ticker: string;
    type: string;
    amount: string | null;
  }[];
  source: string;
  note?: string;
  error?: string;
}

interface SentimentInput {
  transactionType: string;
  amountRange: string | null;
}

function calculateSentiment(trades: SentimentInput[]) {
  const buyCount = trades.filter((t) => t.transactionType === "purchase").length;
  const sellCount = trades.filter((t) => t.transactionType === "sale").length;

  const ratio = sellCount > 0 ? buyCount / sellCount : buyCount > 0 ? 2 : 1;

  let level: "bullish" | "neutral" | "bearish";
  if (ratio > 1.3) level = "bullish";
  else if (ratio < 0.7) level = "bearish";
  else level = "neutral";

  return { buyCount, sellCount, ratio: Math.round(ratio * 100) / 100, level };
}

export async function fetchCongressData(): Promise<CongressData> {
  try {
    // Congress data can be delayed 30–45 days from transaction to filing.
    // Pull recent rows then filter in-memory for last 90 days.
    const allTrades = await db
      .select()
      .from(congressTrades)
      .orderBy(desc(congressTrades.transactionDate))
      .limit(200);

    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    const dateStr = ninetyDaysAgo.toISOString().split("T")[0];

    const trades = allTrades
      .filter((t) => {
        if (!t.transactionDate) return false;
        const txDate = t.transactionDate.includes("/")
          ? new Date(t.transactionDate).toISOString().split("T")[0]
          : t.transactionDate.split("T")[0];
        return txDate >= dateStr;
      })
      .slice(0, 100);

    const sentiment = calculateSentiment(trades);

    const tickerCounts = trades.reduce(
      (acc, t) => {
        acc[t.ticker] = (acc[t.ticker] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );

    const topTickers = Object.entries(tickerCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([ticker, count]) => ({ ticker, count }));

    return {
      ...sentiment,
      totalTrades: trades.length,
      topTickers,
      recentTrades: trades.slice(0, 15).map((t) => ({
        date: t.transactionDate,
        member: t.memberName,
        party: t.party,
        state: t.state,
        chamber: t.chamber,
        ticker: t.ticker,
        type: t.transactionType,
        amount: t.amountRange,
      })),
      source: "Capitol Trades (synced)",
      note: "STOCK Act filings from House & Senate members",
    };
  } catch (e) {
    logger.error("lib/congress", "fetchCongressData error", { error: e });
    return {
      buyCount: 0,
      sellCount: 0,
      ratio: 1,
      level: "neutral",
      totalTrades: 0,
      topTickers: [],
      recentTrades: [],
      source: "database",
      error: "Failed to fetch Congress trading data",
    };
  }
}
