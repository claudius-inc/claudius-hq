/**
 * China: Stock Connect Flows via AkShare
 * AkShare is Python-only, so we use a cached JSON approach.
 * The Python script (scripts/pipelines/akshare-connect.py) fetches data and writes to cache.
 */

import { exec } from "child_process";
import { promisify } from "util";
import * as fs from "fs/promises";
import * as path from "path";
import type { CNStockConnectSignals } from "./types";

const execAsync = promisify(exec);

// Cache file path
const CACHE_DIR = path.join(process.cwd(), ".cache", "signals");
const STOCK_CONNECT_CACHE = path.join(CACHE_DIR, "cn-stock-connect.json");
const CACHE_MAX_AGE_MS = 6 * 60 * 60 * 1000; // 6 hours

interface StockConnectCacheEntry {
  code: string; // Stock code (e.g., "600519")
  name: string; // Stock name in Chinese
  holdingShares: number; // 今日持股-股数
  holdingValue: number; // 今日持股-市值
  dailyChangeShares: number; // 今日增持估计-股数
  dailyChangeValue: number; // 今日增持估计-市值
  percentOfFloat: number; // 占流通股比
}

interface CacheData {
  fetchedAt: string;
  data: StockConnectCacheEntry[];
}

// In-memory cache for the session
let memoryCache: CacheData | null = null;
let memoryCacheTime = 0;

/**
 * Load Stock Connect data from cache.
 */
async function loadCache(): Promise<CacheData | null> {
  // Check memory cache first
  if (memoryCache && Date.now() - memoryCacheTime < 5 * 60 * 1000) {
    return memoryCache;
  }

  try {
    const stat = await fs.stat(STOCK_CONNECT_CACHE);
    const age = Date.now() - stat.mtimeMs;

    // Return null if cache is too old
    if (age > CACHE_MAX_AGE_MS) {
      return null;
    }

    const content = await fs.readFile(STOCK_CONNECT_CACHE, "utf-8");
    const data = JSON.parse(content) as CacheData;

    // Update memory cache
    memoryCache = data;
    memoryCacheTime = Date.now();

    return data;
  } catch {
    return null;
  }
}

/**
 * Refresh Stock Connect cache by running the Python script.
 * Returns true if successful, false otherwise.
 */
export async function refreshStockConnectCache(): Promise<boolean> {
  try {
    // Ensure cache directory exists
    await fs.mkdir(CACHE_DIR, { recursive: true });

    const scriptPath = path.join(process.cwd(), "scripts", "pipelines", "akshare-connect.py");

    // Check if script exists
    try {
      await fs.access(scriptPath);
    } catch {
      console.warn("[cn-stock-connect] Python script not found:", scriptPath);
      return false;
    }

    // Run Python script
    const { stdout, stderr } = await execAsync(`python3 ${scriptPath}`, {
      timeout: 60000, // 60 second timeout
      env: { ...process.env, PYTHONIOENCODING: "utf-8" },
    });

    if (stderr) {
      console.warn("[cn-stock-connect] Python stderr:", stderr);
    }

    // Parse output
    const data = JSON.parse(stdout) as StockConnectCacheEntry[];

    // Write to cache
    const cacheData: CacheData = {
      fetchedAt: new Date().toISOString(),
      data,
    };

    await fs.writeFile(STOCK_CONNECT_CACHE, JSON.stringify(cacheData, null, 2));

    // Update memory cache
    memoryCache = cacheData;
    memoryCacheTime = Date.now();

    console.log(`[cn-stock-connect] Cache refreshed: ${data.length} stocks`);
    return true;
  } catch (err) {
    console.error("[cn-stock-connect] Failed to refresh cache:", err);
    return false;
  }
}

/**
 * Convert A-share ticker to code format.
 * "600519.SS" -> "600519"
 * "000858.SZ" -> "000858"
 */
function normalizeChineseTicker(ticker: string): string {
  return ticker.replace(/\.(SS|SZ|SH)$/i, "");
}

/**
 * Fetch Stock Connect signals for a Chinese stock.
 * @param ticker - Stock ticker (e.g., "600519.SS", "000858.SZ")
 * @returns Stock Connect signals or null if not found/error
 */
export async function fetchCNStockConnectSignals(
  ticker: string
): Promise<CNStockConnectSignals | null> {
  try {
    // Try to load from cache first
    let cache = await loadCache();

    // If cache is stale or missing, don't block - return null
    // (Refresh should happen in a background job)
    if (!cache) {
      console.log("[cn-stock-connect] Cache miss for", ticker);
      return null;
    }

    const code = normalizeChineseTicker(ticker);

    // Find the stock in cache
    const entry = cache.data.find((e) => e.code === code);

    if (!entry) {
      // Stock not in Stock Connect (could be B-share, ChiNext, etc.)
      return null;
    }

    return {
      northboundHolding: entry.holdingShares,
      dailyChange: entry.dailyChangeShares,
      percentOfFloat: entry.percentOfFloat,
      dailyChangeValue: entry.dailyChangeValue,
    };
  } catch (err) {
    console.warn(`[cn-stock-connect] Failed to fetch ${ticker}:`, err);
    return null;
  }
}

/**
 * Get all stocks with significant northbound changes.
 * Useful for identifying accumulation patterns.
 */
export async function getTopNorthboundChanges(limit = 50): Promise<
  Array<{
    code: string;
    name: string;
    dailyChange: number;
    percentOfFloat: number;
  }>
> {
  const cache = await loadCache();
  if (!cache) return [];

  return cache.data
    .filter((e) => e.dailyChangeShares > 0) // Only buys
    .sort((a, b) => b.dailyChangeValue - a.dailyChangeValue)
    .slice(0, limit)
    .map((e) => ({
      code: e.code,
      name: e.name,
      dailyChange: e.dailyChangeShares,
      percentOfFloat: e.percentOfFloat,
    }));
}
