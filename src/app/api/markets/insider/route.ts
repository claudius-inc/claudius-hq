import { NextResponse } from "next/server";
import { db, insiderTrades } from "@/db";
import { desc, gte } from "drizzle-orm";
import { logger } from "@/lib/logger";

// Read from DB - fast response
export const revalidate = 300; // 5 min cache

interface InsiderSentiment {
  buyCount: number;
  sellCount: number;
  buyValue: number;
  sellValue: number;
  ratio: number;
  valueRatio: number;
  level: "bullish" | "neutral" | "bearish";
}

function calculateSentiment(trades: { transactionType: string; value: number | null }[]): InsiderSentiment {
  const buys = trades.filter(t => t.transactionType === "buy");
  const sells = trades.filter(t => t.transactionType === "sell");
  
  const buyValue = buys.reduce((sum, t) => sum + (t.value || 0), 0);
  const sellValue = sells.reduce((sum, t) => sum + (t.value || 0), 0);
  
  const buyCount = buys.length;
  const sellCount = sells.length;
  
  const ratio = sellCount > 0 ? buyCount / sellCount : buyCount > 0 ? 2 : 1;
  const valueRatio = sellValue > 0 ? buyValue / sellValue : buyValue > 0 ? 2 : 1;
  
  // Insiders typically sell more than they buy (compensation-related)
  // So we adjust thresholds: ratio > 0.5 is bullish for insiders
  let level: "bullish" | "neutral" | "bearish";
  if (ratio > 0.6 || valueRatio > 0.5) {
    level = "bullish";
  } else if (ratio < 0.2 || valueRatio < 0.1) {
    level = "bearish";
  } else {
    level = "neutral";
  }
  
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

export async function GET() {
  try {
    // Get trades from last 14 days
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
    
    // Get tickers with most insider activity
    const tickerActivity = trades.reduce((acc, t) => {
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
    }, {} as Record<string, { buys: number; sells: number; buyValue: number; sellValue: number }>);
    
    // Find notable buys (cluster buying is significant)
    const clusterBuys = Object.entries(tickerActivity)
      .filter(([, stats]) => stats.buys >= 2)
      .sort((a, b) => b[1].buyValue - a[1].buyValue)
      .slice(0, 5)
      .map(([ticker, stats]) => ({ ticker, ...stats }));
    
    return NextResponse.json({
      ...sentiment,
      totalTrades: trades.length,
      clusterBuys,
      recentTrades: trades.slice(0, 15).map(t => ({
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
      updatedAt: new Date().toISOString(),
    });
  } catch (e) {
    logger.error("api/markets/insider", "Insider trades GET error", { error: e });
    return NextResponse.json({
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
      updatedAt: new Date().toISOString(),
    });
  }
}
