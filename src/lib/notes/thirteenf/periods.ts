/**
 * Filed 13F quarters, keyed by period end.
 *
 * Figures are derived from the SEC EDGAR 13F-HR information tables — the XML
 * holdings files, not the submissions index. Four normalisations are applied
 * before anything here is computed, each because the raw filings break without
 * it:
 *
 *  - **Units.** The SEC moved 13F values to whole dollars in 2023, but Duquesne
 *    and Baupost still file in thousands. Taken raw, Duquesne's $4.22B book
 *    reads as $4M. Detected from the implied share price (value ÷ shares) and
 *    scaled.
 *  - **Amendments.** The original 13F-HR is the baseline; an amendment replaces
 *    it only when it declares itself a RESTATEMENT. Farallon's Q4 carries a
 *    two-row NEW HOLDINGS amendment filed the same day as its Q1 report, so
 *    "latest filing wins" collapses its book to two positions. Coatue's Q4
 *    amendment genuinely is a restatement and does win.
 *  - **Share classes.** GOOGL and GOOG are one issuer. Merged, Alphabet is the
 *    most widely held name in the universe at 21 of 26 managers; unmerged it
 *    appears twice and understates both.
 *  - **Affiliated filers.** See `excluded` below.
 *
 * Flows are share-count changes priced at the period-end mark. Value changes
 * would report price drift as trading — Viking's book fell $1.93B while it
 * traded $0.10B.
 */
import type { ThirteenFFacts } from "./types";

const EDGAR = "SEC EDGAR 13F-HR";
/** Last filing in the set. Every figure is as of the period end, not this date. */
const Q1_2026_FILED = "2026-05-15T00:00:00Z";

const Q1_2026: ThirteenFFacts = {
  periodEnd: "2026-03-31",
  priorPeriodEnd: "2025-12-31",
  coverage: {
    managers: 26,
    combinedBookUsd: 1_034_000_000_000,
    sectorMapped: 0.63,
    excluded: [
      {
        manager: "Two Sigma Investments",
        reason:
          "Two Sigma Advisers filed 2,329 holdings worth $51.43B for Q4 2025 and one holding for Q1 2026. The book moved between affiliated filers and would appear here as $53.46B of buying.",
      },
      {
        manager: "Scion Asset Management",
        reason: "No 13F-HR on file for either period.",
      },
    ],
  },

  topBought: {
    source: EDGAR,
    asOf: Q1_2026_FILED,
    value: [
      {
        ticker: "GOOGL",
        name: "Alphabet",
        netUsd: 10_190_000_000,
        buyers: 12,
        sellers: 9,
        holdersBefore: 21,
        holdersAfter: 21,
        topMover: "Berkshire Hathaway",
        topShare: 1.13,
      },
      {
        ticker: "DAL",
        name: "Delta Air Lines",
        netUsd: 2_510_000_000,
        buyers: 1,
        sellers: 7,
        holdersBefore: 7,
        holdersAfter: 6,
        topMover: "Berkshire Hathaway",
        topShare: 1.05,
      },
      {
        ticker: "META",
        name: "Meta Platforms",
        netUsd: 2_450_000_000,
        buyers: 12,
        sellers: 4,
        holdersBefore: 12,
        holdersAfter: 16,
        topMover: "Viking Global",
        topShare: 0.25,
      },
      {
        ticker: "AAPL",
        name: "Apple",
        netUsd: 2_050_000_000,
        buyers: 6,
        sellers: 2,
        holdersBefore: 7,
        holdersAfter: 10,
        topMover: "Viking Global",
        topShare: 0.44,
      },
      {
        ticker: "JPM",
        name: "JPMorgan Chase",
        netUsd: 1_540_000_000,
        buyers: 5,
        sellers: 2,
        holdersBefore: 7,
        holdersAfter: 6,
        topMover: "D.E. Shaw",
        topShare: 0.58,
      },
    ],
  },

  topSold: {
    source: EDGAR,
    asOf: Q1_2026_FILED,
    value: [
      {
        ticker: "CVX",
        name: "Chevron",
        netUsd: -9_480_000_000,
        buyers: 3,
        sellers: 4,
        holdersBefore: 5,
        holdersAfter: 7,
        topMover: "Berkshire Hathaway",
        topShare: 1.0,
      },
      {
        ticker: "MSFT",
        name: "Microsoft",
        netUsd: -6_560_000_000,
        buyers: 5,
        sellers: 15,
        holdersBefore: 18,
        holdersAfter: 17,
        topMover: "Gates Foundation Trust",
        topShare: 0.57,
      },
      {
        ticker: "WMT",
        name: "Walmart",
        netUsd: -5_460_000_000,
        buyers: 1,
        sellers: 6,
        holdersBefore: 8,
        holdersAfter: 7,
        topMover: "Millennium",
        topShare: 0.91,
      },
      {
        ticker: "NVDA",
        name: "Nvidia",
        netUsd: -3_390_000_000,
        buyers: 6,
        sellers: 9,
        holdersBefore: 15,
        holdersAfter: 15,
        topMover: "D.E. Shaw",
        topShare: 0.44,
      },
      {
        ticker: "V",
        name: "Visa",
        netUsd: -3_050_000_000,
        buyers: 9,
        sellers: 4,
        holdersBefore: 11,
        holdersAfter: 12,
        topMover: "Berkshire Hathaway",
        topShare: 0.96,
      },
    ],
  },

  conviction: {
    source: EDGAR,
    asOf: Q1_2026_FILED,
    value: [
      { manager: "Pershing Square", ticker: "MSFT", fromPct: 0, toPct: 15.3 },
      { manager: "Third Point", ticker: "AMZN", fromPct: 6.9, toPct: 19.4 },
      { manager: "Pershing Square", ticker: "GOOG", fromPct: 12.5, toPct: 0.7 },
      { manager: "Gates Foundation", ticker: "MSFT", fromPct: 10.5, toPct: 0 },
      { manager: "Appaloosa", ticker: "AMZN", fromPct: 7.3, toPct: 15.2 },
      { manager: "Duquesne", ticker: "NTRA", fromPct: 13.6, toPct: 20.9 },
      { manager: "Altimeter", ticker: "NVDA", fromPct: 22.7, toPct: 28.6 },
      { manager: "Tiger Global", ticker: "MSFT", fromPct: 8.9, toPct: 4.1 },
      { manager: "Coatue", ticker: "TSM", fromPct: 6.6, toPct: 10.8 },
      { manager: "Berkshire", ticker: "GOOGL", fromPct: 2.0, toPct: 5.9 },
    ],
  },

  bookChanges: {
    source: EDGAR,
    asOf: Q1_2026_FILED,
    value: [
      { manager: "Berkshire", soldUsd: -8_820_000_000, valueChangeUsd: -2_240_000_000, bookChangeUsd: -11_060_000_000 },
      { manager: "Coatue", soldUsd: -8_460_000_000, valueChangeUsd: -2_450_000_000, bookChangeUsd: -10_910_000_000 },
      { manager: "Millennium", soldUsd: -4_940_000_000, valueChangeUsd: -2_100_000_000, bookChangeUsd: -7_040_000_000 },
      { manager: "Tiger Global", soldUsd: -2_780_000_000, valueChangeUsd: -4_090_000_000, bookChangeUsd: -6_870_000_000 },
      { manager: "Point72", soldUsd: -5_840_000_000, valueChangeUsd: -380_000_000, bookChangeUsd: -6_220_000_000 },
      { manager: "Third Point", soldUsd: -5_110_000_000, valueChangeUsd: -70_000_000, bookChangeUsd: -5_180_000_000 },
      { manager: "D.E. Shaw", soldUsd: -1_020_000_000, valueChangeUsd: -3_890_000_000, bookChangeUsd: -4_910_000_000 },
      { manager: "Gates Foundation", soldUsd: -5_150_000_000, valueChangeUsd: 1_450_000_000, bookChangeUsd: -3_690_000_000 },
      { manager: "Viking Global", soldUsd: -100_000_000, valueChangeUsd: -1_830_000_000, bookChangeUsd: -1_930_000_000 },
      { manager: "Elliott", soldUsd: -800_000_000, valueChangeUsd: 2_170_000_000, bookChangeUsd: 1_360_000_000 },
    ],
  },

  concentration: {
    source: EDGAR,
    asOf: Q1_2026_FILED,
    value: [
      { manager: "Icahn", holdingsToHalf: 2, positions: 12 },
      { manager: "Elliott", holdingsToHalf: 2, positions: 17 },
      { manager: "Berkshire", holdingsToHalf: 3, positions: 29 },
      { manager: "Pershing Square", holdingsToHalf: 3, positions: 11 },
      { manager: "Altimeter", holdingsToHalf: 3, positions: 13 },
      { manager: "Gates Foundation", holdingsToHalf: 3, positions: 22 },
      { manager: "Himalaya", holdingsToHalf: 3, positions: 14 },
      { manager: "Third Point", holdingsToHalf: 4, positions: 33 },
      { manager: "Appaloosa", holdingsToHalf: 6, positions: 31 },
      { manager: "Baupost", holdingsToHalf: 6, positions: 22 },
      { manager: "Tiger Global", holdingsToHalf: 6, positions: 54 },
      { manager: "Duquesne", holdingsToHalf: 8, positions: 65 },
      { manager: "Coatue", holdingsToHalf: 8, positions: 62 },
      { manager: "Whale Rock", holdingsToHalf: 10, positions: 35 },
      { manager: "Lone Pine", holdingsToHalf: 10, positions: 36 },
      { manager: "Farallon", holdingsToHalf: 11, positions: 167 },
      { manager: "ARK Investment", holdingsToHalf: 14, positions: 181 },
      { manager: "Maverick", holdingsToHalf: 14, positions: 239 },
      { manager: "Viking Global", holdingsToHalf: 17, positions: 77 },
      { manager: "Bridgewater", holdingsToHalf: 20, positions: 993 },
      { manager: "Soros", holdingsToHalf: 24, positions: 229 },
      { manager: "D.E. Shaw", holdingsToHalf: 94, positions: 3102 },
      { manager: "Point72", holdingsToHalf: 105, positions: 1904 },
      { manager: "Millennium", holdingsToHalf: 154, positions: 3735 },
      { manager: "Renaissance", holdingsToHalf: 155, positions: 3213 },
      { manager: "Citadel", holdingsToHalf: 177, positions: 5960 },
    ],
  },

  sectors: {
    source: `${EDGAR} + Select Sector SPDR holdings`,
    asOf: Q1_2026_FILED,
    value: [
      { sector: "Industrials", changePp: 1.45 },
      { sector: "Energy", changePp: 1.21 },
      { sector: "Comm. Services", changePp: 0.76 },
      { sector: "Real Estate", changePp: 0.44 },
      { sector: "Utilities", changePp: 0.15 },
      { sector: "Materials", changePp: 0.05 },
      { sector: "Health Care", changePp: -0.15 },
      { sector: "Consumer Staples", changePp: -0.33 },
      { sector: "Cons. Discretionary", changePp: -0.6 },
      { sector: "Information Tech", changePp: -1.21 },
      { sector: "Financials", changePp: -1.75 },
    ],
  },
};

/** Every filed quarter, newest first. */
export const THIRTEEN_F_PERIODS: ThirteenFFacts[] = [Q1_2026];

export function getPeriod(periodEnd: string): ThirteenFFacts | null {
  return THIRTEEN_F_PERIODS.find((p) => p.periodEnd === periodEnd) ?? null;
}

export function latestPeriod(): ThirteenFFacts | null {
  return THIRTEEN_F_PERIODS[0] ?? null;
}
