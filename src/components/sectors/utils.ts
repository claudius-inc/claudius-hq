/**
 * Sector Momentum Utilities
 */

export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined) return "-";
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

export function getPercentColor(value: number | null | undefined): string {
  if (value === null || value === undefined) return "text-gray-400";
  if (value > 0) return "text-emerald-600";
  if (value < 0) return "text-red-600";
  return "text-gray-600";
}

export function getPercentBg(value: number | null | undefined): string {
  if (value === null || value === undefined) return "bg-gray-100";
  if (value > 3) return "bg-emerald-100";
  if (value > 0) return "bg-emerald-50";
  if (value < -3) return "bg-red-100";
  if (value < 0) return "bg-red-50";
  return "bg-gray-50";
}

// ETF holdings page URLs (SPDR sector ETFs)
const ETF_HOLDINGS_URLS: Record<string, string> = {
  XLK: "https://www.ssga.com/us/en/intermediary/etfs/funds/the-technology-select-sector-spdr-fund-xlk",
  XLF: "https://www.ssga.com/us/en/intermediary/etfs/funds/the-financial-select-sector-spdr-fund-xlf",
  XLY: "https://www.ssga.com/us/en/intermediary/etfs/funds/the-consumer-discretionary-select-sector-spdr-fund-xly",
  XLC: "https://www.ssga.com/us/en/intermediary/etfs/funds/the-communication-services-select-sector-spdr-fund-xlc",
  XLV: "https://www.ssga.com/us/en/intermediary/etfs/funds/the-health-care-select-sector-spdr-fund-xlv",
  XLI: "https://www.ssga.com/us/en/intermediary/etfs/funds/the-industrial-select-sector-spdr-fund-xli",
  XLP: "https://www.ssga.com/us/en/intermediary/etfs/funds/the-consumer-staples-select-sector-spdr-fund-xlp",
  XLE: "https://www.ssga.com/us/en/intermediary/etfs/funds/the-energy-select-sector-spdr-fund-xle",
  XLB: "https://www.ssga.com/us/en/intermediary/etfs/funds/the-materials-select-sector-spdr-fund-xlb",
  XLRE: "https://www.ssga.com/us/en/intermediary/etfs/funds/the-real-estate-select-sector-spdr-fund-xlre",
  XLU: "https://www.ssga.com/us/en/intermediary/etfs/funds/the-utilities-select-sector-spdr-fund-xlu",
};

export function getHoldingsUrl(ticker: string): string {
  return ETF_HOLDINGS_URLS[ticker] || `https://etf.com/${ticker}`;
}
