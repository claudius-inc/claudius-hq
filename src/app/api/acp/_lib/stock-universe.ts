/**
 * Ticker Universes for Stock Scanner
 * Contains curated lists for US, HK, and JP markets.
 * 
 * Note: Using smaller sets for initial testing:
 * - US: S&P 100 (top 100)
 * - HK: HSI 50 constituents
 * - JP: Nikkei 50 (top 50)
 */

// Market suffixes for Yahoo Finance
export const MARKET_SUFFIXES = {
  US: "",      // No suffix for US stocks
  HK: ".HK",   // Hong Kong Exchange
  JP: ".T",    // Tokyo Stock Exchange
} as const;

export type Market = keyof typeof MARKET_SUFFIXES;

// US sectors for filtering
export const US_SECTORS = [
  "Technology",
  "Healthcare", 
  "Financials",
  "Consumer Discretionary",
  "Communication Services",
  "Industrials",
  "Consumer Staples",
  "Energy",
  "Utilities",
  "Real Estate",
  "Materials",
] as const;

// S&P 15 (top 15 US stocks by market cap - optimized for Vercel 10s timeout)
export const US_TICKERS = [
  "AAPL", "MSFT", "AMZN", "NVDA", "GOOGL", "META", "TSLA", "BRK-B", "UNH", "JPM",
  "V", "XOM", "LLY", "AVGO", "MA",
];

// HSI 12 constituents (Hong Kong - optimized for Vercel 10s timeout)
export const HK_TICKERS = [
  "0005", "0016", "0388", "0700", "0823", "0939", "0941", "1211", "1299", "1398",
  "2318", "9988",
].map(num => `${num.padStart(4, "0")}.HK`);

// Nikkei 12 (top 12 Japan stocks by weight - optimized for Vercel 10s timeout)
export const JP_TICKERS = [
  "7203", "8306", "9984", "6758", "9432", "6861", "8035", "6902", "6501", "8058",
  "7267", "7974",
].map(num => `${num}.T`);

/**
 * Get all tickers for a market
 */
export function getTickersForMarket(market: Market): string[] {
  switch (market) {
    case "US":
      return US_TICKERS;
    case "HK":
      return HK_TICKERS;
    case "JP":
      return JP_TICKERS;
    default:
      throw new Error(`Unknown market: ${market}`);
  }
}

/**
 * Format HK ticker (zero-pad to 4 digits)
 */
export function formatHKTicker(num: number | string): string {
  return `${num.toString().padStart(4, "0")}.HK`;
}

/**
 * Get the benchmark index for a market
 */
export function getBenchmarkIndex(market: Market): string {
  switch (market) {
    case "US":
      return "^GSPC"; // S&P 500
    case "HK":
      return "^HSI";  // Hang Seng Index
    case "JP":
      return "^N225"; // Nikkei 225
    default:
      return "^GSPC";
  }
}

/**
 * Get market cap tier from market cap value
 */
export function getMarketCapTier(marketCap: number): "mega" | "large" | "mid" | "small" {
  if (marketCap >= 200_000_000_000) return "mega";      // $200B+
  if (marketCap >= 10_000_000_000) return "large";      // $10B+
  if (marketCap >= 2_000_000_000) return "mid";         // $2B+
  return "small";
}

/**
 * Currency for each market
 */
export function getCurrency(market: Market): string {
  switch (market) {
    case "US":
      return "USD";
    case "HK":
      return "HKD";
    case "JP":
      return "JPY";
    default:
      return "USD";
  }
}
