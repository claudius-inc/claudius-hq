/**
 * Scanner refresh logic.
 * Fetches Yahoo Finance data, calculates indicators, and updates the DB.
 */

import { db, stockScans, marketCache } from "@/db";
import { eq, desc } from "drizzle-orm";
import { batchFetchMetrics } from "./yahoo-fetcher";
import { calculateCompositeScore, type TechnicalMetrics } from "./scoring";
import type { ScanResult, ScanSummary } from "@/app/markets/scanner/types";

// Rate limit: 15 minutes between refreshes
const REFRESH_COOLDOWN_MS = 15 * 60 * 1000;
const CACHE_KEY = "scanner_state";

export interface ScannerState {
  lastRefreshAt: string | null;
  isRefreshing: boolean;
  lastError: string | null;
}

/**
 * Get the current scanner state from cache.
 */
export async function getScannerState(): Promise<ScannerState> {
  try {
    const [cached] = await db
      .select()
      .from(marketCache)
      .where(eq(marketCache.key, CACHE_KEY));

    if (cached) {
      return JSON.parse(cached.data) as ScannerState;
    }
  } catch (e) {
    console.error("Failed to get scanner state:", e);
  }

  return {
    lastRefreshAt: null,
    isRefreshing: false,
    lastError: null,
  };
}

/**
 * Update the scanner state in cache.
 */
export async function setScannerState(state: Partial<ScannerState>): Promise<void> {
  const current = await getScannerState();
  const newState = { ...current, ...state };

  await db
    .insert(marketCache)
    .values({
      key: CACHE_KEY,
      data: JSON.stringify(newState),
      updatedAt: new Date().toISOString(),
    })
    .onConflictDoUpdate({
      target: marketCache.key,
      set: {
        data: JSON.stringify(newState),
        updatedAt: new Date().toISOString(),
      },
    });
}

/**
 * Check if we can start a new refresh (respects cooldown).
 */
export async function canRefresh(): Promise<{
  allowed: boolean;
  reason?: string;
  nextRefreshAt?: string;
}> {
  const state = await getScannerState();

  if (state.isRefreshing) {
    return { allowed: false, reason: "Refresh already in progress" };
  }

  if (state.lastRefreshAt) {
    const lastRefresh = new Date(state.lastRefreshAt).getTime();
    const now = Date.now();
    const timeSinceRefresh = now - lastRefresh;

    if (timeSinceRefresh < REFRESH_COOLDOWN_MS) {
      const nextRefreshAt = new Date(lastRefresh + REFRESH_COOLDOWN_MS).toISOString();
      return {
        allowed: false,
        reason: "Cooldown period active",
        nextRefreshAt,
      };
    }
  }

  return { allowed: true };
}

/**
 * Get the latest scan from the database.
 */
export async function getLatestScan(): Promise<{
  results: ScanResult[];
  summary: ScanSummary | null;
  scannedAt: string | null;
} | null> {
  try {
    const [scan] = await db
      .select()
      .from(stockScans)
      .where(eq(stockScans.scanType, "unified"))
      .orderBy(desc(stockScans.scannedAt))
      .limit(1);

    if (!scan) return null;

    return {
      results: JSON.parse(scan.results || "[]"),
      summary: scan.summary ? JSON.parse(scan.summary) : null,
      scannedAt: scan.scannedAt,
    };
  } catch (e) {
    console.error("Failed to get latest scan:", e);
    return null;
  }
}

/**
 * Enhanced scan result with technical metrics.
 */
export interface EnhancedScanResult extends ScanResult {
  athWeekly: number | null;
  athMonthly: number | null;
  rvolWeekly: number | null;
  rvolMonthly: number | null;
  atrWeekly: number | null;
  rrWeekly: number | null;
  compositeScore: number;
  fundamentalScore: number;
  technicalScore: number;
  momentumScore: number;
}

/**
 * Run the scanner refresh.
 * Fetches technical data from Yahoo Finance and updates the DB.
 */
export async function runScannerRefresh(): Promise<{
  success: boolean;
  error?: string;
  enhancedCount?: number;
}> {
  // Check if we can refresh
  const canRefreshResult = await canRefresh();
  if (!canRefreshResult.allowed) {
    return { success: false, error: canRefreshResult.reason };
  }

  // Mark as refreshing
  await setScannerState({ isRefreshing: true, lastError: null });

  try {
    // Get existing scan data
    const existingScan = await getLatestScan();
    if (!existingScan || existingScan.results.length === 0) {
      await setScannerState({ isRefreshing: false, lastError: "No existing scan data" });
      return { success: false, error: "No existing scan data to enhance" };
    }

    // Extract tickers (add .SI back for SGX stocks)
    const tickers = existingScan.results.map((r) =>
      r.market === "SGX" ? `${r.ticker}.SI` : r.ticker
    );

    console.log(`[Scanner] Refreshing ${tickers.length} tickers...`);

    // Fetch technical metrics
    const metricsMap = await batchFetchMetrics(tickers, (ticker, idx, total) => {
      if (idx % 10 === 0) {
        console.log(`[Scanner] Progress: ${idx}/${total} (${ticker})`);
      }
    });

    // Enhance results with technical metrics
    const enhancedResults: EnhancedScanResult[] = existingScan.results.map((stock) => {
      const tickerKey = stock.market === "SGX" ? `${stock.ticker}.SI` : stock.ticker;
      const metrics = metricsMap.get(tickerKey);

      const techMetrics: TechnicalMetrics = metrics ?? {
        athWeekly: null,
        athMonthly: null,
        rvolWeekly: null,
        rvolMonthly: null,
        atrWeekly: null,
        rrWeekly: null,
      };

      // Update price if we have fresh data
      const price = metrics?.currentPrice ?? stock.price;

      // Calculate composite score
      const scores = calculateCompositeScore(stock, techMetrics);

      return {
        ...stock,
        price,
        athWeekly: techMetrics.athWeekly,
        athMonthly: techMetrics.athMonthly,
        rvolWeekly: techMetrics.rvolWeekly,
        rvolMonthly: techMetrics.rvolMonthly,
        atrWeekly: techMetrics.atrWeekly,
        rrWeekly: techMetrics.rrWeekly,
        compositeScore: scores.compositeScore,
        fundamentalScore: scores.fundamentalScore,
        technicalScore: scores.technicalScore,
        momentumScore: scores.momentumScore,
      };
    });

    // Sort by composite score
    enhancedResults.sort((a, b) => b.compositeScore - a.compositeScore);
    enhancedResults.forEach((r, idx) => (r.rank = idx + 1));

    // Build updated summary
    const summary: ScanSummary = {
      universeSize: enhancedResults.length,
      scannedCount: enhancedResults.length,
      highConviction: enhancedResults.filter((r) => r.compositeScore >= 70).length,
      speculative: enhancedResults.filter(
        (r) => r.compositeScore >= 50 && r.compositeScore < 70
      ).length,
      watchlist: enhancedResults.filter(
        (r) => r.compositeScore >= 35 && r.compositeScore < 50
      ).length,
      avoid: enhancedResults.filter((r) => r.compositeScore < 35).length,
      usCount: enhancedResults.filter((r) => r.market === "US").length,
      sgxCount: enhancedResults.filter((r) => r.market === "SGX").length,
    };

    // Save to database
    await db.insert(stockScans).values({
      scanType: "unified",
      scannedAt: new Date().toISOString(),
      results: JSON.stringify(enhancedResults),
      summary: JSON.stringify(summary),
      stockCount: enhancedResults.length,
    });

    // Update state
    await setScannerState({
      isRefreshing: false,
      lastRefreshAt: new Date().toISOString(),
      lastError: null,
    });

    console.log(`[Scanner] Refresh complete. Enhanced ${metricsMap.size} stocks.`);

    return { success: true, enhancedCount: metricsMap.size };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error("[Scanner] Refresh failed:", errorMsg);

    await setScannerState({
      isRefreshing: false,
      lastError: errorMsg,
    });

    return { success: false, error: errorMsg };
  }
}
