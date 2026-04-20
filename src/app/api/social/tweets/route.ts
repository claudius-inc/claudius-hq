import { NextRequest, NextResponse } from "next/server";
import { db, tweetTickers } from "@/db";
import { desc, like, and, sql, eq } from "drizzle-orm";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

// GET /api/social/tweets
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 200);
    const ticker = searchParams.get("ticker")?.toUpperCase();
    const period = searchParams.get("period"); // "today", "week", "month"

    // Build where conditions
    const conditions = [];
    if (ticker) {
      conditions.push(like(tweetTickers.tickers, `%${ticker}%`));
    }
    if (period === "today") {
      conditions.push(sql`date(${tweetTickers.createdAt}) = date('now')`);
    } else if (period === "week") {
      conditions.push(sql`${tweetTickers.createdAt} >= datetime('now', '-7 days')`);
    } else if (period === "month") {
      conditions.push(sql`${tweetTickers.createdAt} >= datetime('now', '-30 days')`);
    }

    const rows = await db
      .select()
      .from(tweetTickers)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(tweetTickers.createdAt))
      .limit(limit);

    const tweets = rows.map((row) => ({
      id: row.id,
      tweet_id: row.tweetId,
      author: row.author,
      screen_name: row.screenName,
      text: row.text,
      tickers: JSON.parse(row.tickers || "[]"),
      likes: row.likes,
      retweets: row.retweets,
      replies: row.replies,
      bookmarks: row.bookmarks,
      views: row.views,
      created_at: row.createdAt,
      media_urls: JSON.parse(row.mediaUrls || "[]"),
      is_quote: row.isQuote,
      quoted_text: row.quotedText,
      quoted_tickers: JSON.parse(row.quotedTickers || "[]"),
    }));

    // Deduplicated ticker list
    const tickerSet = new Set<string>();
    for (const t of tweets) {
      for (const tk of t.tickers) tickerSet.add(tk);
      for (const tk of t.quoted_tickers) tickerSet.add(tk);
    }

    // Total count
    const [countResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(tweetTickers);
    const totalInDb = countResult?.count || 0;

    return NextResponse.json({
      tweets,
      all_tickers: Array.from(tickerSet),
      total_in_db: totalInDb,
    });
  } catch (e) {
    logger.error("api/social/tweets", "Failed to get tweets", { error: e });
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
