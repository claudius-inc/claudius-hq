/**
 * Normalize ticker suffixes to Yahoo Finance format.
 * Yahoo uses .SS for Shanghai (not .SH).
 */
export function normalizeTickerForYahoo(ticker: string): string {
  if (ticker.endsWith(".SH")) return ticker.slice(0, -3) + ".SS";
  return ticker;
}

/**
 * Get the currency symbol and decimal places for a ticker based on its exchange suffix.
 */
export function getCurrencyForTicker(ticker: string): { symbol: string; decimals: number } {
  const upper = ticker.toUpperCase();
  if (upper.endsWith(".SZ") || upper.endsWith(".SH") || upper.endsWith(".SS")) return { symbol: "CN¥", decimals: 2 };
  if (upper.endsWith(".SI")) return { symbol: "S$", decimals: 2 };
  if (upper.endsWith(".HK")) return { symbol: "HK$", decimals: 2 };
  if (upper.endsWith(".T")) return { symbol: "JP¥", decimals: 0 };
  if (upper.endsWith(".KS") || upper.endsWith(".KQ")) return { symbol: "₩", decimals: 0 };
  return { symbol: "$", decimals: 2 }; // US default
}

export function formatLocalPrice(ticker: string, price: number | null | undefined): string {
  if (price === null || price === undefined) return "-";
  const { symbol, decimals } = getCurrencyForTicker(ticker);
  return `${symbol}${price.toFixed(decimals)}`;
}
