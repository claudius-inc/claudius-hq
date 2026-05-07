/**
 * Scanner refresh logic.
 * Fetches Yahoo Finance data, calculates indicators, and updates the DB.
 */

import { db, stockScans, marketCache } from "@/db";
import { eq, desc } from "drizzle-orm";
import { batchFetchAllData } from "./yahoo-fetcher";
import { calculateCompositeScore, type TechnicalMetrics } from "./scoring";
import {
  calculateAllModeScoresWithFlags,
  getTierFromCombinedScore,
  buildMarketPercentiles,
  type YahooStockData,
  type Market,
  type SectorFlags,
  type MarketPercentiles,
} from "./mode-scoring";
import type { ScanResult, ScanSummary, ScoreComponent } from "@/app/markets/scanner/types";
import {
  fetchMarketSignals,
  type MarketSignals,
} from "./signals";

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
 * Enhanced scan result with technical metrics and mode scores.
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
  // Multi-mode scores
  quantScore: number;
  valueScore: number;
  growthScore: number;
  combinedScore: number;
  quantBreakdown: ScoreComponent;
  valueBreakdown: ScoreComponent;
  growthBreakdown: ScoreComponent;
  // Sector-specific flags (v2)
  sectorFlags?: SectorFlags;
  sectorScore?: ScoreComponent;
  // Fundamental data from Yahoo (for display)
  sector?: string;
  industry?: string;
  // Market-specific signals (v2)
  marketSignals?: MarketSignals;
  // Academic factors (Phase 2)
  fScore?: number; // Piotroski F-Score (0-9)
  fScoreCategory?: "Strong" | "Moderate" | "Weak";
  academicScore?: number; // Combined academic factor score (0-30)
}

/**
 * Run the scanner refresh.
 * Fetches technical + fundamental data from Yahoo Finance and updates the DB.
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

    // Fetch technical + fundamental metrics
    const dataMap = await batchFetchAllData(tickers, (ticker, idx, total) => {
      if (idx % 10 === 0) {
        console.log(`[Scanner] Progress: ${idx}/${total} (${ticker})`);
      }
    });

    // Enhance results with technical metrics and mode scores
    const enhancedResults: EnhancedScanResult[] = existingScan.results.map((stock) => {
      const tickerKey = stock.market === "SGX" ? `${stock.ticker}.SI` : stock.ticker;
      const data = dataMap.get(tickerKey);

      const techMetrics: TechnicalMetrics = data ?? {
        athWeekly: null,
        athMonthly: null,
        rvolWeekly: null,
        rvolMonthly: null,
        atrWeekly: null,
        rrWeekly: null,
      };

      // Update price if we have fresh data
      const price = data?.currentPrice ?? stock.price;

      // Calculate composite score (legacy)
      const scores = calculateCompositeScore(stock, techMetrics);

      // Calculate mode scores using fundamental data
      const market = (stock.market ?? "US") as Market;
      const fundamentals: YahooStockData = data?.fundamentals ?? {};

      // Add derived metrics from existing stock data if not in fundamentals
      if (stock.revGrowth !== null && fundamentals.revenueGrowth === undefined) {
        fundamentals.revenueGrowth = stock.revGrowth / 100;
      }
      if (stock.grossMargin !== null && fundamentals.grossMargins === undefined) {
        fundamentals.grossMargins = stock.grossMargin / 100;
      }

      // Use the enhanced mode scoring with sector-specific handling
      const modeScores = calculateAllModeScoresWithFlags(fundamentals, market);

      // Update tier based on combined score
      const tierInfo = getTierFromCombinedScore(modeScores.combinedScore);

      return {
        ...stock,
        price,
        tier: tierInfo.tier,
        tierColor: tierInfo.tierColor,
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
        // Mode scores
        quantScore: modeScores.quantScore,
        valueScore: modeScores.valueScore,
        growthScore: modeScores.growthScore,
        combinedScore: modeScores.combinedScore,
        quantBreakdown: modeScores.quantBreakdown,
        valueBreakdown: modeScores.valueBreakdown,
        growthBreakdown: modeScores.growthBreakdown,
        // Sector-specific data (v2)
        sectorFlags: modeScores.sectorFlags,
        sectorScore: modeScores.sectorScore?.breakdown,
        sector: fundamentals.sector,
        industry: fundamentals.industry,
        // Academic factors (Phase 2)
        fScore: modeScores.fScore,
        fScoreCategory: modeScores.fScoreCategory,
        academicScore: modeScores.academicScore,
      };
    });

    // Fetch market-specific signals (best-effort, non-blocking)
    console.log("[Scanner] Fetching market-specific signals...");
    let signalsFetched = 0;
    for (const result of enhancedResults) {
      try {
        const tickerKey = result.market === "SGX" ? `${result.ticker}.SI` : result.ticker;
        const market = (result.market ?? "US") as Market;
        
        // Fetch signals with priceToBook for JP governance scoring
        const data = dataMap.get(tickerKey);
        const signals = await fetchMarketSignals(tickerKey, market, {
          priceToBook: data?.fundamentals?.priceToBook,
          domicile: undefined, // Could be populated from Yahoo data if available
        });
        
        result.marketSignals = signals;
        signalsFetched++;
        
        // Small delay to avoid overwhelming external sources
        await new Promise((resolve) => setTimeout(resolve, 100));
      } catch (err) {
        // Signal fetch failures are non-fatal
        console.warn(`[Scanner] Signal fetch failed for ${result.ticker}:`, err);
      }
    }
    console.log(`[Scanner] Fetched signals for ${signalsFetched}/${enhancedResults.length} stocks`);

    // Sort by combined score (mode scoring)
    enhancedResults.sort((a, b) => b.combinedScore - a.combinedScore);
    enhancedResults.forEach((r, idx) => (r.rank = idx + 1));

    // Build updated summary based on combined score thresholds
    const summary: ScanSummary = {
      universeSize: enhancedResults.length,
      scannedCount: enhancedResults.length,
      highConviction: enhancedResults.filter((r) => r.combinedScore >= 80).length,
      speculative: enhancedResults.filter(
        (r) => r.combinedScore >= 50 && r.combinedScore < 65
      ).length,
      watchlist: enhancedResults.filter(
        (r) => r.combinedScore >= 65 && r.combinedScore < 80
      ).length,
      avoid: enhancedResults.filter((r) => r.combinedScore < 50).length,
      usCount: enhancedResults.filter((r) => r.market === "US").length,
      sgxCount: enhancedResults.filter((r) => r.market === "SGX").length,
      hkCount: enhancedResults.filter((r) => r.market === "HK").length,
      jpCount: enhancedResults.filter((r) => r.market === "JP").length,
      cnCount: enhancedResults.filter((r) => r.market === "CN").length,
      lseCount: enhancedResults.filter((r) => r.market === "LSE").length,
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

    console.log(`[Scanner] Refresh complete. Enhanced ${dataMap.size} stocks.`);

    return { success: true, enhancedCount: dataMap.size };
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
