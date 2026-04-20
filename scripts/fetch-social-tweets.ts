/**
 * fetch-social-tweets.ts
 *
 * Fetches recent tweets from configured Twitter accounts,
 * extracts $TICKER mentions, and stores in DB.
 *
 * Usage: npx tsx scripts/fetch-social-tweets.ts
 * Cron: Every 15 minutes
 */

import { execSync } from "child_process";
import { createClient } from "@libsql/client";

// Load env
import { config } from "dotenv";
config({ path: ".env.local" });

const db = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN!,
});

// Accounts to monitor
const ACCOUNTS = [
  { screenName: "aleabitoreddit", count: 100 },
];

// Extract $TICKER from text
const TICKER_REGEX = /\$([A-Z]{1,5}[.]?[A-Z]{0,2})\b/g;
function extractTickers(text: string): string[] {
  const matches = new Set<string>();
  let match;
  while ((match = TICKER_REGEX.exec(text)) !== null) {
    const ticker = match[1];
    // Skip if starts with digit (e.g., $100, $1B)
    if (/^\d/.test(ticker)) continue;
    matches.add(ticker);
  }
  return Array.from(matches);
}

async function fetchAndStore() {
  let totalNew = 0;

  for (const account of ACCOUNTS) {
    console.log(`Fetching @${account.screenName}...`);

    try {
      const result = execSync(
        `twitter user-posts ${account.screenName} -n ${account.count} --json 2>/dev/null`,
        { encoding: "utf-8", timeout: 30000 }
      );

      const data = JSON.parse(result);
      const tweets = data.data || [];

      for (const tweet of tweets) {
        if (!tweet.text) continue;

        const tickers = extractTickers(tweet.text);
        if (tickers.length === 0) continue; // Skip tweets without tickers

        // Check if already exists
        const existing = await db.execute({
          sql: "SELECT id FROM tweet_tickers WHERE tweet_id = ?",
          args: [String(tweet.id)],
        });

        if (existing.rows.length > 0) continue;

        const quotedTickers = tweet.quotedTweet
          ? extractTickers(tweet.quotedTweet.text || "")
          : [];

        const mediaUrls = (tweet.media || []).map((m: any) => m.url || "").filter(Boolean);

        await db.execute({
          sql: `INSERT INTO tweet_tickers (tweet_id, author, screen_name, text, tickers, likes, retweets, replies, bookmarks, views, created_at, media_urls, is_quote, quoted_text, quoted_tickers)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [
            String(tweet.id),
            tweet.author?.name || account.screenName,
            tweet.author?.screenName || account.screenName,
            tweet.text,
            JSON.stringify(tickers),
            tweet.metrics?.likes || 0,
            tweet.metrics?.retweets || 0,
            tweet.metrics?.replies || 0,
            tweet.metrics?.bookmarks || 0,
            tweet.metrics?.views || 0,
            tweet.createdAtISO || tweet.createdAt,
            JSON.stringify(mediaUrls),
            tweet.isRetweet ? 0 : (tweet.quotedTweet ? 1 : 0),
            tweet.quotedTweet?.text || null,
            JSON.stringify(quotedTickers),
          ],
        });

        totalNew++;
        console.log(`  + ${tickers.join(", ")}: "${tweet.text.slice(0, 60)}..."`);
      }
    } catch (e) {
      console.error(`Failed to fetch @${account.screenName}:`, e);
    }
  }

  // Prune old tweets (> 30 days)
  await db.execute({
    sql: "DELETE FROM tweet_tickers WHERE created_at < datetime('now', '-30 days')",
    args: [],
  });

  console.log(`Done. ${totalNew} new tweets stored.`);
}

fetchAndStore().catch(console.error);
