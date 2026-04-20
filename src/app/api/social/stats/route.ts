import { NextResponse } from "next/server";
import { db, tweetTickers } from "@/db";
import { sql } from "drizzle-orm";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

// GET /api/social/stats
export async function GET() {
  try {
    // Total tweets with tickers
    const [countResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(tweetTickers);
    const totalTweets = countResult?.count || 0;

    // Latest fetch time
    const [latestResult] = await db
      .select({ fetchedAt: sql<string>`max(fetched_at)` })
      .from(tweetTickers);
    const latestFetch = latestResult?.fetchedAt || null;

    // Unique tickers
    const allRows = await db
      .select({ tickers: tweetTickers.tickers })
      .from(tweetTickers);
    const tickerCount = new Set<string>();
    for (const row of allRows) {
      for (const t of JSON.parse(row.tickers || "[]")) {
        tickerCount.add(t);
      }
    }

    // Top tickers (7 days)
    const recentRows = await db
      .select({ tickers: tweetTickers.tickers })
      .from(tweetTickers)
      .where(sql`${tweetTickers.createdAt} >= datetime('now', '-7 days')`);

    const mentionCounts = new Map<string, number>();
    for (const row of recentRows) {
      for (const t of JSON.parse(row.tickers || "[]")) {
        mentionCounts.set(t, (mentionCounts.get(t) || 0) + 1);
      }
    }

    const topTickers = Array.from(mentionCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([ticker, count]) => ({ ticker, count }));

    const response = NextResponse.json({
      total_tweets: totalTweets,
      unique_tickers: tickerCount.size,
      top_tickers: topTickers,
      latest_fetch: latestFetch,
    });

    response.headers.set("Cache-Control", "s-maxage=120, stale-while-revalidate=300");
    return response;
  } catch (e) {
    logger.error("api/social/stats", "Failed to get stats", { error: e });
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
