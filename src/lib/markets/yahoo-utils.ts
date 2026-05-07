/**
 * Normalize ticker suffixes to Yahoo Finance format.
 * Yahoo uses .SS for Shanghai (not .SH).
 */
export function normalizeTickerForYahoo(ticker: string): string {
  if (ticker.endsWith(".SH")) return ticker.slice(0, -3) + ".SS";
  return ticker;
}

/**
 * Display metadata for a price: which symbol to prepend, how many decimals to
 * show, and the multiplier to apply before formatting (most listings use 1; LSE
 * `GBp` quotes are in pence so we divide by 100 to display as £).
 */
export interface CurrencyMeta {
  symbol: string;
  decimals: number;
  scale: number;
}

const SUFFIX_FALLBACK_BANNER =
  // Suffix heuristic — only used when Yahoo's `quote.currency` is unknown for
  // the row (legacy rows pre-dating the `scanner_universe.currency` column).
  // Not safe in general because dual-listings break the suffix→currency
  // assumption (e.g. IHG.L is USD, not GBp). New rows should always have
  // `quote.currency` captured at fetch time.
  null;
void SUFFIX_FALLBACK_BANNER;

/**
 * Map a Yahoo currency code to display metadata. Falls back to a ticker-suffix
 * heuristic when `currency` is missing — that path is *only* correct for the
 * common case (e.g. all `.L` are GBp); dual-listings need the column.
 */
export function getCurrencyMeta(
  currency: string | null | undefined,
  fallbackTicker: string,
): CurrencyMeta {
  if (currency) {
    switch (currency) {
      case "GBp":
        // Yahoo quotes most LSE equities in pence (1/100 GBP).
        return { symbol: "£", decimals: 2, scale: 0.01 };
      case "GBP":
        return { symbol: "£", decimals: 2, scale: 1 };
      case "USD":
        return { symbol: "$", decimals: 2, scale: 1 };
      case "EUR":
        return { symbol: "€", decimals: 2, scale: 1 };
      case "HKD":
        return { symbol: "HK$", decimals: 2, scale: 1 };
      case "JPY":
        return { symbol: "JP¥", decimals: 0, scale: 1 };
      case "SGD":
        return { symbol: "S$", decimals: 2, scale: 1 };
      case "CNY":
      case "CNH":
        return { symbol: "CN¥", decimals: 2, scale: 1 };
      case "KRW":
        return { symbol: "₩", decimals: 0, scale: 1 };
      // Unknown ISO codes fall through to the suffix heuristic so we still
      // produce *something* sensible rather than throwing.
    }
  }

  const upper = fallbackTicker.toUpperCase();
  if (upper.endsWith(".SZ") || upper.endsWith(".SH") || upper.endsWith(".SS"))
    return { symbol: "CN¥", decimals: 2, scale: 1 };
  if (upper.endsWith(".SI")) return { symbol: "S$", decimals: 2, scale: 1 };
  if (upper.endsWith(".HK")) return { symbol: "HK$", decimals: 2, scale: 1 };
  if (upper.endsWith(".T")) return { symbol: "JP¥", decimals: 0, scale: 1 };
  if (upper.endsWith(".KS") || upper.endsWith(".KQ"))
    return { symbol: "₩", decimals: 0, scale: 1 };
  if (upper.endsWith(".L")) return { symbol: "£", decimals: 2, scale: 0.01 }; // legacy: assumes GBp
  return { symbol: "$", decimals: 2, scale: 1 }; // US default
}

/**
 * Backwards-compatible suffix-only currency lookup.
 *
 * Prefer `getCurrencyMeta(quote.currency, ticker)` when you have the column
 * available — this fallback path mis-scales dual-listings (e.g. IHG.L is USD,
 * not GBp).
 */
export function getCurrencyForTicker(ticker: string): CurrencyMeta {
  return getCurrencyMeta(null, ticker);
}

/**
 * Format `price` for display. Pass `currency` (Yahoo's `quote.currency`) when
 * available — when omitted, falls back to a suffix heuristic that's wrong for
 * dual-listings.
 */
export function formatLocalPrice(
  ticker: string,
  price: number | null | undefined,
  currency?: string | null,
): string {
  if (price === null || price === undefined) return "-";
  const { symbol, decimals, scale } = getCurrencyMeta(currency, ticker);
  return `${symbol}${(price * scale).toFixed(decimals)}`;
}
