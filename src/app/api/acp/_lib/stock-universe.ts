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

// S&P 30 (top 30 US stocks by market cap - optimized for Vercel serverless)
export const US_TICKERS = [
  "AAPL", "MSFT", "AMZN", "NVDA", "GOOGL", "META", "TSLA", "BRK-B", "UNH", "JNJ",
  "V", "XOM", "JPM", "MA", "PG", "HD", "CVX", "LLY", "ABBV", "MRK",
  "AVGO", "PEP", "KO", "PFE", "COST", "TMO", "CSCO", "WMT", "MCD", "ACN",
];

// HSI 25 constituents (Hong Kong - optimized for Vercel serverless)
export const HK_TICKERS = [
  "0005", "0011", "0016", "0027", "0066", "0175", "0267", "0388", "0669", "0700",
  "0823", "0857", "0883", "0939", "0941", "1038", "1211", "1299", "1398", "1810",
  "2318", "2628", "3690", "9618", "9988",
].map(num => `${num.padStart(4, "0")}.HK`);

// Nikkei 25 (top 25 Japan stocks by weight - optimized for Vercel serverless)
export const JP_TICKERS = [
  "7203", "8306", "9984", "6758", "9432", "6861", "8035", "6902", "6501", "8058",
  "7267", "6367", "9433", "4063", "6954", "4502", "8031", "6971", "7974", "8316",
  "6098", "9022", "4503", "8801", "4661",
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
