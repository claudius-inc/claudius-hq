import { NextResponse } from "next/server";
import { db, congressTrades } from "@/db";
import { desc, sql, gte } from "drizzle-orm";

// Read from DB - fast response
export const revalidate = 300; // 5 min cache

interface CongressSentiment {
  buyCount: number;
  sellCount: number;
  ratio: number;
  level: "bullish" | "neutral" | "bearish";
}

function calculateSentiment(trades: { transactionType: string; amountRange: string | null }[]): CongressSentiment {
  const buyCount = trades.filter(t => t.transactionType === "purchase").length;
  const sellCount = trades.filter(t => t.transactionType === "sale").length;
  
  const ratio = sellCount > 0 ? buyCount / sellCount : buyCount > 0 ? 2 : 1;
  
  let level: "bullish" | "neutral" | "bearish";
  if (ratio > 1.3) {
    level = "bullish";
  } else if (ratio < 0.7) {
    level = "bearish";
  } else {
    level = "neutral";
  }
  
  return { buyCount, sellCount, ratio: Math.round(ratio * 100) / 100, level };
}

export async function GET() {
  try {
    // Get trades from last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const dateStr = thirtyDaysAgo.toISOString().split("T")[0];
    
    const trades = await db
      .select()
      .from(congressTrades)
      .where(gte(congressTrades.transactionDate, dateStr))
      .orderBy(desc(congressTrades.transactionDate))
      .limit(100);
    
    const sentiment = calculateSentiment(trades);
    
    // Get unique tickers being traded
    const tickerCounts = trades.reduce((acc, t) => {
      acc[t.ticker] = (acc[t.ticker] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    const topTickers = Object.entries(tickerCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([ticker, count]) => ({ ticker, count }));
    
    return NextResponse.json({
      ...sentiment,
      totalTrades: trades.length,
      topTickers,
      recentTrades: trades.slice(0, 15).map(t => ({
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
      updatedAt: new Date().toISOString(),
    });
  } catch (e) {
    console.error("Congress trades GET error:", e);
    return NextResponse.json({
      buyCount: 0,
      sellCount: 0,
      ratio: 1,
      level: "neutral",
      totalTrades: 0,
      topTickers: [],
      recentTrades: [],
      source: "database",
      error: "Failed to fetch Congress trading data",
      updatedAt: new Date().toISOString(),
    });
  }
}
