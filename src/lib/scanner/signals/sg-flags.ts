/**
 * Singapore: GLC Identification and S-Chip Risk Flags
 * - GLC: Government-Linked Companies (Temasek portfolio)
 * - S-Chip: China-domiciled companies listed on SGX (higher governance risk)
 */

import type { SGMarketFlags } from "./types";

/**
 * Temasek-linked companies (GLCs).
 * These are major Temasek Holdings portfolio companies listed on SGX.
 * Temasek often supports these during downturns, providing a floor.
 * Source: Temasek Review, SGX filings
 */
const TEMASEK_LINKED_TICKERS = new Set([
  // Banks
  "D05.SI", // DBS Group
  "O39.SI", // OCBC
  "U11.SI", // UOB

  // Telcos
  "Z74.SI", // Singtel

  // Airlines/Transport
  "C6L.SI", // Singapore Airlines
  "S58.SI", // SATS

  // Industrial/Conglomerate
  "BN4.SI", // Keppel Corporation
  "S63.SI", // Singapore Technologies Engineering
  "U96.SI", // Sembcorp Industries
  "S68.SI", // Singapore Exchange (SGX)

  // Real Estate
  "C09.SI", // City Developments
  "M44U.SI", // Mapletree Logistics Trust
  "N2IU.SI", // Mapletree Pan Asia Commercial Trust
  "ME8U.SI", // Mapletree Industrial Trust

  // Healthcare
  "Q0F.SI", // IHH Healthcare

  // Others
  "BS6.SI", // Yangzijiang Shipbuilding (indirect via Temasek)
  "F34.SI", // Wilmar International (indirect)
]);

/**
 * S-Chip tickers: China-domiciled companies listed on SGX.
 * These have historically higher governance/fraud risk.
 * Many had accounting scandals in 2010s (China Hongxing, China Gaoxian, etc.)
 *
 * Note: This is a partial list - ideally would be detected by domicile data.
 */
const SCHIP_TICKERS = new Set([
  // Active S-Chips
  "AWX.SI", // SIIC Environment
  "BHK.SI", // China Sunsine
  "AYN.SI", // Jiutian Chemical
  "Q5T.SI", // Sino Grandness
  "T14.SI", // Haw Par (actually Singaporean, but China ops)
  "S91.SI", // Haidilao (China F&B)
  "BN2.SI", // Yanlord Land

  // REITs with significant China exposure (not strictly S-Chips but flagged)
  "BUOU.SI", // Frasers Logistics - some China exposure
  "BTOU.SI", // Manulife US REIT (not China, but offshore)
]);

/**
 * Additional companies with material China operations.
 * Not S-Chips per se, but have concentration risk.
 */
const CHINA_EXPOSED_TICKERS = new Set([
  "C52.SI", // ComfortDelGro (China taxi ops)
  "H78.SI", // Hongkong Land (China exposure via HK)
  "J36.SI", // Jardine Matheson
  "C07.SI", // Jardine Cycle & Carriage
]);

/**
 * Convert SGX ticker to standard format.
 * "D05" -> "D05.SI"
 */
function normalizeSGXTicker(ticker: string): string {
  if (!ticker.endsWith(".SI")) {
    return `${ticker}.SI`;
  }
  return ticker;
}

/**
 * Check if a company is a GLC (Temasek-linked).
 */
export function isGLC(ticker: string): boolean {
  return TEMASEK_LINKED_TICKERS.has(normalizeSGXTicker(ticker));
}

/**
 * Check if a company is an S-Chip (China-domiciled SGX listing).
 */
export function isSChip(ticker: string): boolean {
  return SCHIP_TICKERS.has(normalizeSGXTicker(ticker));
}

/**
 * Check if a company has significant China exposure.
 */
export function hasChinaExposure(ticker: string): boolean {
  const normalized = normalizeSGXTicker(ticker);
  return (
    SCHIP_TICKERS.has(normalized) || CHINA_EXPOSED_TICKERS.has(normalized)
  );
}

/**
 * Fetch Singapore market flags for a stock.
 * @param ticker - Stock ticker (e.g., "D05.SI", "D05")
 * @param domicile - Optional country of domicile from Yahoo Finance
 * @returns Singapore market flags
 */
export function fetchSGMarketFlags(
  ticker: string,
  domicile?: string
): SGMarketFlags {
  const normalized = normalizeSGXTicker(ticker);

  // Check GLC status
  const glc = TEMASEK_LINKED_TICKERS.has(normalized);

  // Check S-Chip status
  // Use domicile if available, otherwise check known list
  let sChip = SCHIP_TICKERS.has(normalized);

  if (
    domicile &&
    (domicile.toLowerCase() === "china" ||
      domicile.toLowerCase() === "cn" ||
      domicile.toLowerCase().includes("cayman")) // Many China cos use Cayman structure
  ) {
    sChip = true;
  }

  return {
    isGLC: glc,
    isSChip: sChip,
    glcParent: glc ? "Temasek" : undefined,
  };
}

/**
 * Get all GLCs in the list.
 */
export function getAllGLCs(): string[] {
  return Array.from(TEMASEK_LINKED_TICKERS);
}

/**
 * Get all S-Chips in the list.
 */
export function getAllSChips(): string[] {
  return Array.from(SCHIP_TICKERS);
}

/**
 * Calculate a governance risk score for SG stocks.
 * Lower = better governance.
 * 0 = GLC (best), 5 = Regular, 8 = China exposure, 10 = S-Chip
 */
export function calculateSGGovernanceRisk(
  ticker: string,
  domicile?: string
): number {
  const flags = fetchSGMarketFlags(ticker, domicile);

  if (flags.isGLC) return 0; // Temasek-backed = lowest risk
  if (flags.isSChip) return 10; // S-Chip = highest risk

  if (hasChinaExposure(ticker)) return 8; // China exposure

  return 5; // Regular SGX company
}
