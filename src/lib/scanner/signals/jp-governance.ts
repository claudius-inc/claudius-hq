/**
 * Japan: Governance Catalyst Flags
 * Identifies PBR<1 companies with capital efficiency improvement plans.
 * TSE reform (2023) pushed companies to disclose improvement plans.
 */

import type { JPGovernanceSignals } from "./types";

/**
 * Static list of companies that have publicly disclosed capital efficiency plans.
 * These are PBR<1 companies from the JPX "comply or explain" list that announced plans.
 * Source: JPX disclosure database, compiled manually.
 * Last updated: 2026-03-26
 *
 * Format: Ticker (without .T) -> { name, plan summary }
 */
const CAPITAL_EFFICIENCY_DISCLOSURES: Record<
  string,
  { name: string; planSummary: string; announcedDate: string }
> = {
  // Mega banks - all disclosed plans
  "8306": {
    name: "Mitsubishi UFJ Financial",
    planSummary: "ROE target 9%+, increased buybacks",
    announcedDate: "2023-05",
  },
  "8316": {
    name: "Sumitomo Mitsui Financial",
    planSummary: "ROE target 10%, shareholder returns >40%",
    announcedDate: "2023-05",
  },
  "8411": {
    name: "Mizuho Financial",
    planSummary: "ROE target 8%, progressive dividends",
    announcedDate: "2023-05",
  },

  // Trading houses - all active on buybacks
  "8058": {
    name: "Mitsubishi Corporation",
    planSummary: "ROE 12%+, ¥1T buyback program",
    announcedDate: "2023-11",
  },
  "8031": {
    name: "Mitsui & Co",
    planSummary: "ROE 13-16%, progressive dividends",
    announcedDate: "2023-05",
  },
  "8001": {
    name: "ITOCHU",
    planSummary: "ROE 15%+, DOE 4% floor",
    announcedDate: "2023-05",
  },
  "8053": {
    name: "Sumitomo Corporation",
    planSummary: "ROE 10%, buyback + dividends",
    announcedDate: "2023-05",
  },
  "8002": {
    name: "Marubeni",
    planSummary: "ROE 15%+, payout ratio 30%+",
    announcedDate: "2023-05",
  },

  // Autos - restructuring + capital efficiency
  "7203": {
    name: "Toyota Motor",
    planSummary: "ROE 15% target, EV investment + returns",
    announcedDate: "2024-05",
  },
  "7267": {
    name: "Honda Motor",
    planSummary: "ROE 10%+, ¥1T buyback",
    announcedDate: "2024-02",
  },

  // Industrials with plans
  "6501": {
    name: "Hitachi",
    planSummary: "ROE 14%, portfolio optimization",
    announcedDate: "2024-05",
  },
  "6503": {
    name: "Mitsubishi Electric",
    planSummary: "ROE 10%+, capital efficiency program",
    announcedDate: "2024-05",
  },
  "6902": {
    name: "Denso",
    planSummary: "ROE 10% target, cross-shareholding reduction",
    announcedDate: "2024-02",
  },

  // Real estate - all disclosing
  "8801": {
    name: "Mitsui Fudosan",
    planSummary: "ROE 10%, asset recycling",
    announcedDate: "2023-11",
  },
  "8802": {
    name: "Mitsubishi Estate",
    planSummary: "ROE 8%+, development pipeline",
    announcedDate: "2023-05",
  },

  // Technology
  "6758": {
    name: "Sony Group",
    planSummary: "ROE 10%+, strategic acquisitions",
    announcedDate: "2024-05",
  },
  "6861": {
    name: "Keyence",
    planSummary: "Already high ROE, maintaining efficiency",
    announcedDate: "2023-05",
  },
  "4063": {
    name: "Shin-Etsu Chemical",
    planSummary: "Capital efficiency focus, DOE improvement",
    announcedDate: "2024-02",
  },

  // Financials
  "8766": {
    name: "Tokio Marine",
    planSummary: "ROE 15%+ adjusted, overseas expansion",
    announcedDate: "2024-05",
  },
  "8725": {
    name: "MS&AD Insurance",
    planSummary: "ROE 10%+, cross-shareholding unwind",
    announcedDate: "2024-05",
  },
  "8750": {
    name: "Dai-ichi Life",
    planSummary: "ROE target, embedded value focus",
    announcedDate: "2023-11",
  },

  // Retail/Consumer
  "9983": {
    name: "Fast Retailing",
    planSummary: "High ROE maintained, global expansion",
    announcedDate: "2024-02",
  },
  "3382": {
    name: "Seven & i Holdings",
    planSummary: "Asset sales, Ito-Yokado restructuring",
    announcedDate: "2024-02",
  },

  // Telecom
  "9432": {
    name: "NTT",
    planSummary: "EPS growth, buybacks",
    announcedDate: "2024-05",
  },
  "9433": {
    name: "KDDI",
    planSummary: "ROE improvement, shareholder returns",
    announcedDate: "2024-05",
  },
  "9434": {
    name: "SoftBank Corp",
    planSummary: "Dividend policy, PayPay growth",
    announcedDate: "2024-05",
  },

  // Others
  "7751": {
    name: "Canon",
    planSummary: "ROE 8%+, cash return focus",
    announcedDate: "2024-02",
  },
  "4502": {
    name: "Takeda Pharmaceutical",
    planSummary: "Deleveraging, R&D efficiency",
    announcedDate: "2024-05",
  },
  "4523": {
    name: "Eisai",
    planSummary: "Leqembi launch, R&D pipeline",
    announcedDate: "2024-02",
  },
};

/**
 * Convert JP ticker to code format.
 * "7203.T" -> "7203"
 */
function normalizeJPTicker(ticker: string): string {
  return ticker.replace(/\.T$/i, "");
}

/**
 * Fetch governance signals for a Japanese stock.
 * @param ticker - Stock ticker (e.g., "7203.T")
 * @param priceToBook - Current P/B ratio (optional, for PBR<1 check)
 * @returns Governance signals
 */
export function fetchJPGovernanceSignals(
  ticker: string,
  priceToBook?: number
): JPGovernanceSignals {
  const code = normalizeJPTicker(ticker);
  const disclosure = CAPITAL_EFFICIENCY_DISCLOSURES[code];

  const hasPBRBelowOne = priceToBook !== undefined && priceToBook < 1;
  const hasCapitalEfficiencyPlan = !!disclosure;

  // Governance catalyst score (0-10)
  // Higher = more catalysts aligned
  let governanceCatalystScore = 0;

  if (hasPBRBelowOne) {
    governanceCatalystScore += 3; // Pressure from TSE
  }

  if (hasCapitalEfficiencyPlan) {
    governanceCatalystScore += 5; // Disclosed plan = committed
  }

  // Bonus if both PBR<1 AND has plan (re-rating potential)
  if (hasPBRBelowOne && hasCapitalEfficiencyPlan) {
    governanceCatalystScore += 2;
  }

  return {
    hasPBRBelowOne,
    hasCapitalEfficiencyPlan,
    governanceCatalystScore,
  };
}

/**
 * Get all companies with capital efficiency disclosures.
 * Useful for screening.
 */
export function getCompaniesWithDisclosures(): Array<{
  code: string;
  name: string;
  planSummary: string;
  announcedDate: string;
}> {
  return Object.entries(CAPITAL_EFFICIENCY_DISCLOSURES).map(([code, data]) => ({
    code,
    ...data,
  }));
}

/**
 * Check if a company is on the JPX "request for disclosure" list.
 * Companies with PBR<1 that haven't disclosed face investor pressure.
 */
export function isOnJPXDisclosureList(
  ticker: string,
  priceToBook?: number
): boolean {
  const code = normalizeJPTicker(ticker);
  const hasDisclosure = !!CAPITAL_EFFICIENCY_DISCLOSURES[code];
  const belowBookValue = priceToBook !== undefined && priceToBook < 1;

  // On the "pressure" list if PBR<1 but no disclosure yet
  return belowBookValue && !hasDisclosure;
}
