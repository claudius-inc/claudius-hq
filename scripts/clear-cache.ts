/**
 * Clear cache on deploy
 * 
 * Run as part of Vercel build to invalidate stale cache entries.
 * This ensures fresh data after code changes that affect data fetching.
 */

import { createClient } from "@libsql/client";

const CACHE_KEYS_TO_CLEAR = [
  "valuation:expected-returns",
  "valuation:correlations",
];

async function clearCache() {
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;

  if (!url || !authToken) {
    console.log("⚠️  No database credentials, skipping cache clear");
    return;
  }

  const client = createClient({ url, authToken });

  console.log("🧹 Clearing deploy cache...");

  for (const key of CACHE_KEYS_TO_CLEAR) {
    try {
      const result = await client.execute({
        sql: "DELETE FROM market_cache WHERE key = ?",
        args: [key],
      });
      console.log(`  ✓ Cleared ${key} (${result.rowsAffected} rows)`);
    } catch (e) {
      console.log(`  ⚠️  Failed to clear ${key}:`, e);
    }
  }

  console.log("✅ Cache clear complete");
}

clearCache().catch(console.error);
