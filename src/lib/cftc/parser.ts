// ── CFTC Commitments of Traders Text Parser ─────────────────────────
// Parses the CFTC deacmesf.txt format (CME futures-only short format)

import { logger } from "@/lib/logger";

export interface CftcParsedRow {
  reportDate: string; // YYYY-MM-DD
  commodity: string;
  noncommercialLong: number;
  noncommercialShort: number;
  netSpeculative: number;
  commercialLong: number;
  commercialShort: number;
  openInterest: number;
}

/**
 * Target contract codes (CFTC commodity codes)
 */
const TARGET_CONTRACTS: Record<string, string> = {
  "088691": "gold",
  "084691": "silver",
  "067651": "crude_oil",
  "13874A": "sp500",
};

/**
 * Parse CFTC short-format text file.
 * Each record is a single comma-separated line.
 * Format reference: https://www.cftc.gov/MarketReports/CommitmentsofTraders/ExplanatoryNotes/index.htm
 *
 * Short format field positions (0-indexed):
 *  0: Market and Exchange Names
 *  1: As of Date in Form YYMMDD  (or YYYY-MM-DD)
 *  2: CFTC Contract Market Code
 *  3: Open Interest (All)
 *  4: Dealer Long
 *  5: Dealer Short
 *  ...
 *  For futures-only short format (deacmesf.txt):
 *  0: Market_and_Exchange_Names
 *  2: As_of_Date_In_Form_YYMMDD
 *  3: CFTC_Contract_Market_Code
 *  7: Open_Interest_All
 *  8: NonComm_Positions_Long_All
 *  9: NonComm_Positions_Short_All
 *  11: Comm_Positions_Long_All
 *  12: Comm_Positions_Short_All
 */
export function parseCftcText(text: string): CftcParsedRow[] {
  const results: CftcParsedRow[] = [];
  const lines = text.split("\n");

  for (const line of lines) {
    if (!line.trim()) continue;

    const fields = line.split(",").map((f) => f.trim().replace(/"/g, ""));
    if (fields.length < 13) continue;

    const contractCode = fields[3]?.trim();
    const commodity = TARGET_CONTRACTS[contractCode];
    if (!commodity) continue;

    try {
      const rawDate = fields[2]?.trim();
      const reportDate = parseReportDate(rawDate);
      if (!reportDate) continue;

      const openInterest = parseFloat(fields[7]) || 0;
      const noncommercialLong = parseFloat(fields[8]) || 0;
      const noncommercialShort = parseFloat(fields[9]) || 0;
      const commercialLong = parseFloat(fields[11]) || 0;
      const commercialShort = parseFloat(fields[12]) || 0;
      const netSpeculative = noncommercialLong - noncommercialShort;

      results.push({
        reportDate,
        commodity,
        noncommercialLong,
        noncommercialShort,
        netSpeculative,
        commercialLong,
        commercialShort,
        openInterest,
      });
    } catch (e) {
      logger.error("cftc-parser", `Failed to parse line for ${commodity}`, { error: e });
    }
  }

  return results;
}

function parseReportDate(raw: string): string | null {
  if (!raw) return null;

  // Format YYMMDD
  if (/^\d{6}$/.test(raw)) {
    const yy = parseInt(raw.slice(0, 2));
    const mm = raw.slice(2, 4);
    const dd = raw.slice(4, 6);
    const century = yy > 50 ? "19" : "20";
    return `${century}${yy}-${mm}-${dd}`;
  }

  // Format YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return raw;
  }

  return null;
}
