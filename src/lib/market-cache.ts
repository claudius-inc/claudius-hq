/**
 * Market Data Cache Utilities (Server-only)
 * 
 * Implements stale-while-revalidate pattern for instant page loads
 * with background data refresh from external APIs.
 * 
 * NOTE: This module imports db and should only be used in server code.
 * For client components, import from '@/lib/cache-utils' instead.
 */

import { db, marketCache } from "@/db";
import { eq } from "drizzle-orm";

// Re-export client-safe utilities
export { CACHE_KEYS, formatCacheAge } from "./cache-utils";

export interface CacheEntry<T> {
  data: T;
  updatedAt: string;
  isStale: boolean;
}

export interface CacheOptions {
  /** Max age in seconds before data is considered stale */
  maxAge?: number;
  /** Force fresh fetch even if cache exists */
  forceFresh?: boolean;
}

const DEFAULT_MAX_AGE = 5 * 60; // 5 minutes

/**
 * Get cached data for a key
 */
export async function getCache<T>(key: string, maxAge = DEFAULT_MAX_AGE): Promise<CacheEntry<T> | null> {
  try {
    const result = await db
      .select()
      .from(marketCache)
      .where(eq(marketCache.key, key))
      .limit(1);

    if (!result.length) return null;

    const entry = result[0];
    const data = JSON.parse(entry.data) as T;
    const updatedAt = entry.updatedAt || new Date().toISOString();
    const ageSeconds = (Date.now() - new Date(updatedAt).getTime()) / 1000;
    const isStale = ageSeconds > maxAge;

    return { data, updatedAt, isStale };
  } catch (e) {
    console.error(`Cache get error for ${key}:`, e);
    return null;
  }
}

/**
 * Set cached data for a key
 */
export async function setCache<T>(key: string, data: T): Promise<void> {
  try {
    const jsonData = JSON.stringify(data);
    const now = new Date().toISOString();

    await db
      .insert(marketCache)
      .values({
        key,
        data: jsonData,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: marketCache.key,
        set: {
          data: jsonData,
          updatedAt: now,
        },
      });
  } catch (e) {
    console.error(`Cache set error for ${key}:`, e);
  }
}

/**
 * Get cached data or fetch fresh if missing/stale
 * Returns cached data immediately if available, triggers background refresh if stale
 */
export async function getCachedOrFetch<T>(
  key: string,
  fetcher: () => Promise<T>,
  options: CacheOptions = {}
): Promise<CacheEntry<T>> {
  const { maxAge = DEFAULT_MAX_AGE, forceFresh = false } = options;

  // Try to get cached data first
  const cached = await getCache<T>(key, maxAge);

  // If forcing fresh or no cache, fetch immediately
  if (forceFresh || !cached) {
    const freshData = await fetcher();
    await setCache(key, freshData);
    return {
      data: freshData,
      updatedAt: new Date().toISOString(),
      isStale: false,
    };
  }

  // Return cached data, optionally trigger background refresh
  if (cached.isStale) {
    // Don't await - let it run in background
    fetcher()
      .then((freshData) => setCache(key, freshData))
      .catch((e) => console.error(`Background refresh failed for ${key}:`, e));
  }

  return cached;
}
