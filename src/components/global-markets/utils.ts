/**
 * Global Markets Utilities
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

// ETF info pages
const ETF_INFO_URLS: Record<string, string> = {
  SPY: "https://www.ssga.com/us/en/intermediary/etfs/funds/spdr-sp-500-etf-trust-spy",
  QQQ: "https://www.invesco.com/qqq-etf/en/home.html",
  IWM: "https://www.ishares.com/us/products/239710/ishares-russell-2000-etf",
  EWS: "https://www.ishares.com/us/products/239675/ishares-msci-singapore-etf",
  EWJ: "https://www.ishares.com/us/products/239665/ishares-msci-japan-etf",
  EWH: "https://www.ishares.com/us/products/239657/ishares-msci-hong-kong-etf",
  FXI: "https://www.ishares.com/us/products/239536/ishares-china-largecap-etf",
  KWEB: "https://kraneshares.com/kweb/",
  EWT: "https://www.ishares.com/us/products/239736/ishares-msci-taiwan-etf",
  EWY: "https://www.ishares.com/us/products/239681/ishares-msci-south-korea-etf",
  INDA: "https://www.ishares.com/us/products/239659/ishares-msci-india-etf",
  EWA: "https://www.ishares.com/us/products/239607/ishares-msci-australia-etf",
  EWZ: "https://www.ishares.com/us/products/239612/ishares-msci-brazil-etf",
  EWC: "https://www.ishares.com/us/products/239615/ishares-msci-canada-etf",
  EWW: "https://www.ishares.com/us/products/239678/ishares-msci-mexico-etf",
  EWU: "https://www.ishares.com/us/products/239690/ishares-msci-united-kingdom-etf",
  EWG: "https://www.ishares.com/us/products/239650/ishares-msci-germany-etf",
  EWQ: "https://www.ishares.com/us/products/239644/ishares-msci-france-etf",
  VGK: "https://investor.vanguard.com/investment-products/etfs/profile/vgk",
  EEM: "https://www.ishares.com/us/products/239637/ishares-msci-emerging-markets-etf",
  VT: "https://investor.vanguard.com/investment-products/etfs/profile/vt",
};

export function getInfoUrl(ticker: string): string {
  return ETF_INFO_URLS[ticker] || `https://etf.com/${ticker}`;
}
