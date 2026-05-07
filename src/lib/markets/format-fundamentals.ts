// Display formatters for the fundamentals captured on `ticker_metrics`. Kept
// currency-agnostic — the price column already advertises the listing's
// currency, so prefixing market cap with $ would be misleading for non-US
// rows. Callers that want a currency prefix can wrap the result.

export function formatMarketCap(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value) || value <= 0) return "—";
  if (value >= 1e12) return `${(value / 1e12).toFixed(2)}T`;
  if (value >= 1e9) return `${(value / 1e9).toFixed(1)}B`;
  if (value >= 1e6) return `${(value / 1e6).toFixed(0)}M`;
  return value.toFixed(0);
}

export function formatPE(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  // Yahoo occasionally serves negative trailing P/E (loss-making companies).
  // Show it raw — users want to know the company is unprofitable, not see "—".
  return `${value.toFixed(1)}×`;
}

// D/E stored as a decimal (0.5 = 50% / 0.5x). Display as multiplier with two
// decimals — matches how Bloomberg/Reuters quote it.
export function formatDebtToEquity(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value.toFixed(2)}×`;
}
