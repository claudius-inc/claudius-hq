/**
 * Market-Specific Signals Index
 * Exports all signal fetchers and types.
 */

// Types
export type {
  USInsiderSignals,
  CNStockConnectSignals,
  HKShortSellingSignals,
  JPGovernanceSignals,
  SGMarketFlags,
  MarketSignals,
  SignalFetcher,
} from "./types";

// US: OpenInsider
export {
  fetchUSInsiderSignals,
  batchFetchUSInsiderSignals,
} from "./us-insider";

// China: Stock Connect
export {
  fetchCNStockConnectSignals,
  refreshStockConnectCache,
  getTopNorthboundChanges,
} from "./cn-stock-connect";

// Hong Kong: Short Selling
export {
  fetchHKShortSellingSignals,
  getHighShortTurnoverStocks,
} from "./hk-short-selling";

// Japan: Governance Catalysts
export {
  fetchJPGovernanceSignals,
  getCompaniesWithDisclosures,
  isOnJPXDisclosureList,
} from "./jp-governance";

// Singapore: GLC and S-Chip Flags
export {
  fetchSGMarketFlags,
  isGLC,
  isSChip,
  hasChinaExposure,
  getAllGLCs,
  getAllSChips,
  calculateSGGovernanceRisk,
} from "./sg-flags";

// ============================================================================
// Unified Signal Fetcher
// ============================================================================

import type { MarketSignals } from "./types";
import type { Market } from "../mode-scoring";
import { fetchUSInsiderSignals } from "./us-insider";
import { fetchCNStockConnectSignals } from "./cn-stock-connect";
import { fetchHKShortSellingSignals } from "./hk-short-selling";
import { fetchJPGovernanceSignals } from "./jp-governance";
import { fetchSGMarketFlags } from "./sg-flags";

/**
 * Fetch all applicable market signals for a stock.
 * Returns signals based on the stock's market.
 * Errors are caught and logged, not thrown.
 */
export async function fetchMarketSignals(
  ticker: string,
  market: Market,
  options?: {
    priceToBook?: number;
    domicile?: string;
  }
): Promise<MarketSignals> {
  const signals: MarketSignals = {
    fetchedAt: new Date().toISOString(),
    errors: [],
  };

  try {
    switch (market) {
      case "US":
        signals.us = await fetchUSInsiderSignals(ticker);
        break;

      case "CN":
        signals.cn = await fetchCNStockConnectSignals(ticker);
        break;

      case "HK":
        signals.hk = await fetchHKShortSellingSignals(ticker);
        // HK-listed China stocks might also have Stock Connect data
        if (ticker.match(/^(0[67]|9[0-9])/)) {
          // H-shares often in Stock Connect
          signals.cn = await fetchCNStockConnectSignals(ticker);
        }
        break;

      case "JP":
        signals.jp = fetchJPGovernanceSignals(ticker, options?.priceToBook);
        break;

      case "SGX":
        signals.sg = fetchSGMarketFlags(ticker, options?.domicile);
        break;
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    signals.errors?.push(`${market}: ${errorMsg}`);
    console.error(`[signals] Error fetching ${market} signals for ${ticker}:`, err);
  }

  return signals;
}

/**
 * Batch fetch market signals for multiple stocks.
 * Groups by market to optimize fetching.
 */
export async function batchFetchMarketSignals(
  stocks: Array<{
    ticker: string;
    market: Market;
    priceToBook?: number;
    domicile?: string;
  }>,
  options?: {
    delayMs?: number;
    onProgress?: (current: number, total: number) => void;
  }
): Promise<Map<string, MarketSignals>> {
  const results = new Map<string, MarketSignals>();
  const delayMs = options?.delayMs ?? 200;

  for (let i = 0; i < stocks.length; i++) {
    const { ticker, market, priceToBook, domicile } = stocks[i];

    const signals = await fetchMarketSignals(ticker, market, {
      priceToBook,
      domicile,
    });

    results.set(ticker, signals);

    options?.onProgress?.(i + 1, stocks.length);

    // Rate limiting between requests
    if (delayMs > 0 && i < stocks.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  return results;
}
