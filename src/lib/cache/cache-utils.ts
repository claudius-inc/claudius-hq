/**
 * Cache Utilities (Client-safe)
 * 
 * These utilities can be safely imported in client components.
 */

/**
 * Cache keys for market data
 */
export const CACHE_KEYS = {
  SECTORS: "sectors:momentum",
  GOLD: "gold:data",
  BTC: "btc:data",
  OIL: "oil:data",
  MACRO: "macro:data:v2",
  THEMES: "themes:data",
  THEMES_PERFORMANCE: "themes:performance",
  TRENDING: "trending:data",
  REGIME: "regime:data",
  SENTIMENT: "sentiment:data",
  BREADTH: "breadth:data",
  CONGRESS: "congress:data",
  INSIDER: "insider:data",
  MARKETS: "markets:momentum",
  STOCK_PRICES: "stocks:prices",
  GAVEKAL: "gavekal:quadrant",
  SILVER_PRICE: "silver:price",
  METALS_QUOTES: "metals:quotes",
  FRED_DFII10: "fred:DFII10",
  FRED_M2SL: "fred:M2SL",
  GOLD_HIST: "gold:hist300d",
  BTC_WMA200: "btc:wma200_history",
  BTC_SMA200: "btc:sma200",
  SSR_SENTIMENT: "ssr:sentiment",
  SSR_BREADTH: "ssr:breadth",
  SSR_REGIME: "ssr:regime",
  SSR_VALUATION: "ssr:valuation",
  SSR_THEMES: "ssr:themes",
  SSR_MACRO: "ssr:macro",
  SSR_CONGRESS: "ssr:congress",
  SSR_INSIDER: "ssr:insider",
  SSR_EXPECTED: "ssr:expected",
  SSR_GOLD: "ssr:gold",
} as const;

/**
 * Format cache age for display
 */
export function formatCacheAge(updatedAt: string): string {
  const ageMs = Date.now() - new Date(updatedAt).getTime();
  const ageMinutes = Math.floor(ageMs / 60000);
  
  if (ageMinutes < 1) return "just now";
  if (ageMinutes === 1) return "1 min ago";
  if (ageMinutes < 60) return `${ageMinutes} min ago`;
  
  const ageHours = Math.floor(ageMinutes / 60);
  if (ageHours === 1) return "1 hour ago";
  if (ageHours < 24) return `${ageHours} hours ago`;
  
  return new Date(updatedAt).toLocaleDateString();
}
