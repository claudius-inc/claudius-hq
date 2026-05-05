/**
 * Normalize a free-form market label to one of: US, SGX, HK, JP, CN.
 */
export function normalizeMarketCode(market: string): string {
  const upper = market.toUpperCase().trim();
  switch (upper) {
    case "CHINA":
    case "CN":
    case "SSE":
    case "SZSE":
      return "CN";
    case "HONG KONG":
    case "HONGKONG":
    case "HKEX":
    case "HK":
      return "HK";
    case "JAPAN":
    case "TSE":
    case "JP":
      return "JP";
    case "SINGAPORE":
    case "SGX":
    case "SG":
      return "SGX";
    case "US":
    case "NYSE":
    case "NASDAQ":
    case "AMEX":
      return "US";
    default:
      return upper;
  }
}

/**
 * Normalize a ticker into Yahoo Finance format for the given market.
 * - China: auto-detect Shanghai (.SS) vs Shenzhen (.SZ) by code prefix
 * - HK:    pad to 4 digits and append .HK
 * - JP:    append .T
 * - SGX:   append .SI
 * - US:    no suffix
 *
 * If the input already contains a dot suffix it is returned as-is.
 */
export function normalizeTickerForMarket(ticker: string, market: string): string {
  const cleaned = ticker.toUpperCase().trim();
  const upperMarket = market.toUpperCase();

  if (cleaned.includes(".")) {
    return cleaned;
  }

  switch (upperMarket) {
    case "CN":
    case "CHINA": {
      // Shanghai (SSE): 6xxxxx (incl. STAR 688)
      // Shenzhen (SZSE): 0xxxxx, 3xxxxx
      const code = cleaned.replace(/\D/g, "");
      if (code.startsWith("6")) return `${code}.SS`;
      if (code.startsWith("0") || code.startsWith("3")) return `${code}.SZ`;
      return `${code}.SZ`;
    }
    case "HK":
    case "HKEX": {
      const hkCode = cleaned.replace(/\D/g, "").padStart(4, "0");
      return `${hkCode}.HK`;
    }
    case "JP":
    case "JAPAN":
    case "TSE": {
      const jpCode = cleaned.replace(/\D/g, "");
      return `${jpCode}.T`;
    }
    case "SG":
    case "SGX":
    case "SINGAPORE":
      return `${cleaned}.SI`;
    case "US":
    case "NYSE":
    case "NASDAQ":
    default:
      return cleaned;
  }
}

/**
 * Reverse hint: given a Yahoo exchange code or fullExchangeName, return the
 * matching market code we use internally.
 */
export function detectMarketFromYahoo(opts: {
  exchange?: string | null;
  fullExchangeName?: string | null;
  symbol?: string | null;
}): string | null {
  const { exchange, fullExchangeName, symbol } = opts;

  if (symbol) {
    const upper = symbol.toUpperCase();
    if (upper.endsWith(".HK")) return "HK";
    if (upper.endsWith(".SI")) return "SGX";
    if (upper.endsWith(".T")) return "JP";
    if (upper.endsWith(".SS") || upper.endsWith(".SZ")) return "CN";
  }

  const ex = (exchange || "").toUpperCase();
  if (ex === "HKG") return "HK";
  if (ex === "SES") return "SGX";
  if (ex === "JPX") return "JP";
  if (ex === "SHH" || ex === "SHZ") return "CN";
  if (ex === "NMS" || ex === "NYQ" || ex === "ASE" || ex === "PCX" || ex === "BTS") return "US";

  const full = (fullExchangeName || "").toLowerCase();
  if (full.includes("hong kong")) return "HK";
  if (full.includes("singapore")) return "SGX";
  if (full.includes("tokyo") || full.includes("japan")) return "JP";
  if (full.includes("shanghai") || full.includes("shenzhen")) return "CN";
  if (full.includes("nasdaq") || full.includes("nyse") || full.includes("amex")) return "US";

  return null;
}
