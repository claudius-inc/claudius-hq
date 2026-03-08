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
  MACRO: "macro:data",
  THEMES: "themes:data",
  TRENDING: "trending:data",
  REGIME: "regime:data",
  SENTIMENT: "sentiment:data",
  BREADTH: "breadth:data",
  CONGRESS: "congress:data",
  INSIDER: "insider:data",
  MARKETS: "markets:momentum",
  MACRO_ETFS: "macro:etfs",
  STOCK_PRICES: "stocks:prices",
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
