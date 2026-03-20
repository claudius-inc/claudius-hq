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

// S&P 100 constituents (top 100 US stocks by market cap)
export const US_TICKERS = [
  "AAPL", "MSFT", "AMZN", "NVDA", "GOOGL", "GOOG", "META", "TSLA", "BRK-B", "UNH",
  "JNJ", "V", "XOM", "JPM", "MA", "PG", "HD", "CVX", "LLY", "ABBV",
  "MRK", "AVGO", "PEP", "KO", "PFE", "COST", "TMO", "CSCO", "WMT", "MCD",
  "ACN", "ABT", "DHR", "NEE", "CRM", "LIN", "TXN", "ADBE", "BMY", "CMCSA",
  "NKE", "PM", "VZ", "ORCL", "HON", "RTX", "UPS", "T", "INTC", "QCOM",
  "WFC", "IBM", "CAT", "AMD", "LOW", "SPGI", "BA", "DE", "SBUX", "GS",
  "AMGN", "ELV", "INTU", "AXP", "MDLZ", "BLK", "ISRG", "PLD", "GILD", "MS",
  "SYK", "CVS", "ADI", "TJX", "SCHW", "MMC", "REGN", "ADP", "LMT", "BKNG",
  "CI", "CME", "SO", "CL", "EOG", "TMUS", "DUK", "NOW", "MO", "ZTS",
  "BDX", "ITW", "PNC", "USB", "CB", "TGT", "FDX", "ICE", "SLB", "NOC",
];

// HSI 50 constituents (Hong Kong)
// Zero-padded to 4 digits + .HK suffix
export const HK_TICKERS = [
  "0001", "0002", "0003", "0005", "0006", "0011", "0012", "0016", "0017", "0019",
  "0027", "0066", "0101", "0175", "0241", "0267", "0288", "0291", "0316", "0386",
  "0388", "0669", "0688", "0700", "0762", "0823", "0857", "0868", "0881", "0883",
  "0939", "0941", "0960", "0968", "0981", "0992", "1038", "1044", "1088", "1093",
  "1109", "1113", "1177", "1211", "1299", "1398", "1810", "1876", "1928", "1997",
  "2007", "2018", "2020", "2269", "2313", "2318", "2319", "2331", "2382", "2388",
  "2628", "2688", "3328", "3690", "3968", "3988", "6098", "6862", "9618", "9633",
  "9888", "9988", "9999",
].map(num => `${num.padStart(4, "0")}.HK`);

// Nikkei 50 (top 50 Japan stocks by weight)
export const JP_TICKERS = [
  "7203", "8306", "9984", "6758", "9432", "6861", "8035", "6902", "6501", "8058",
  "7267", "6367", "9433", "4063", "6954", "4502", "8031", "6971", "7974", "8316",
  "6098", "9022", "4503", "8801", "4661", "3382", "8766", "7751", "7201", "9020",
  "2914", "4901", "5401", "8411", "6981", "7733", "4568", "6702", "9531", "8591",
  "6503", "8002", "7269", "4578", "2502", "8053", "3861", "7911", "6504", "8015",
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
