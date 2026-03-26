/**
 * Index Rebalancing Alerts for Scanner V2
 * Tracks quarterly index rebalancing for major indices across markets.
 *
 * Covered indices:
 * - US: S&P 500, Russell 2000
 * - JP: Nikkei 225, TOPIX
 * - CN: CSI 300
 * - HK: Hang Seng Index
 * - SG: Straits Times Index (STI)
 */

export interface IndexRebalanceEvent {
  indexName: string;
  indexCode: string;
  market: "US" | "JP" | "CN" | "HK" | "SG";
  rebalanceDate: string; // YYYY-MM-DD
  announcementDate?: string;
  additions: string[]; // Tickers being added
  removals: string[]; // Tickers being removed
  notes?: string;
}

export interface TickerRebalanceStatus {
  ticker: string;
  indexAdditions: IndexRebalanceEvent[];
  indexRemovals: IndexRebalanceEvent[];
  nearestRebalanceDate: string | null;
  daysToRebalance: number | null;
}

/**
 * Index metadata for scheduling rebalancing checks.
 */
export const INDEX_METADATA = {
  // US Indices
  "SPX": {
    name: "S&P 500",
    market: "US" as const,
    // S&P rebalances quarterly (March, June, September, December)
    // Announcement: ~2 weeks before effective date
    rebalanceMonths: [3, 6, 9, 12],
    typicalDay: 3, // Third Friday
  },
  "RUT": {
    name: "Russell 2000",
    market: "US" as const,
    // Russell reconstitutes annually in June
    rebalanceMonths: [6],
    typicalDay: 4, // Fourth Friday of June
  },
  // Japan Indices
  "NKY": {
    name: "Nikkei 225",
    market: "JP" as const,
    // Nikkei rebalances annually in October
    rebalanceMonths: [10],
    typicalDay: 1,
  },
  "TPX": {
    name: "TOPIX",
    market: "JP" as const,
    // TOPIX reviews monthly, major in April/October
    rebalanceMonths: [4, 10],
    typicalDay: 1,
  },
  // China Indices
  "CSI300": {
    name: "CSI 300",
    market: "CN" as const,
    // CSI 300 rebalances semi-annually (June, December)
    rebalanceMonths: [6, 12],
    typicalDay: 2, // Second Friday
  },
  // Hong Kong Indices
  "HSI": {
    name: "Hang Seng Index",
    market: "HK" as const,
    // Hang Seng reviews quarterly
    rebalanceMonths: [3, 6, 9, 12],
    typicalDay: 1, // First week of month
  },
  // Singapore Indices
  "STI": {
    name: "Straits Times Index",
    market: "SG" as const,
    // STI reviews quarterly
    rebalanceMonths: [3, 6, 9, 12],
    typicalDay: 3, // Third week
  },
};

/**
 * Curated list of upcoming/recent index rebalancing events.
 * Updated periodically from official index providers.
 *
 * Sources:
 * - S&P Global indices
 * - FTSE Russell
 * - JPX (Nikkei, TOPIX)
 * - China Securities Index Co. (CSI)
 * - Hang Seng Indexes Company
 * - SPH/FTSE (STI)
 *
 * Last updated: 2026-03-26
 */
const REBALANCE_EVENTS: IndexRebalanceEvent[] = [
  // Example entries - to be populated with real data
  // {
  //   indexName: "S&P 500",
  //   indexCode: "SPX",
  //   market: "US",
  //   rebalanceDate: "2026-03-21",
  //   announcementDate: "2026-03-07",
  //   additions: ["PLTR", "APP"],
  //   removals: ["DISH", "FOX"],
  //   notes: "Q1 2026 quarterly rebalance"
  // },
];

/**
 * Get rebalancing status for a specific ticker.
 */
export function getRebalanceStatus(ticker: string): TickerRebalanceStatus {
  const normalizedTicker = ticker.toUpperCase();

  const additions = REBALANCE_EVENTS.filter((e) =>
    e.additions.some((t) => t.toUpperCase() === normalizedTicker)
  );

  const removals = REBALANCE_EVENTS.filter((e) =>
    e.removals.some((t) => t.toUpperCase() === normalizedTicker)
  );

  // Find nearest upcoming rebalance affecting this ticker
  const allEvents = [...additions, ...removals];
  const today = new Date();
  const upcomingEvents = allEvents
    .filter((e) => new Date(e.rebalanceDate) > today)
    .sort(
      (a, b) =>
        new Date(a.rebalanceDate).getTime() - new Date(b.rebalanceDate).getTime()
    );

  let nearestRebalanceDate: string | null = null;
  let daysToRebalance: number | null = null;

  if (upcomingEvents.length > 0) {
    nearestRebalanceDate = upcomingEvents[0].rebalanceDate;
    const rebalanceDate = new Date(nearestRebalanceDate);
    daysToRebalance = Math.ceil(
      (rebalanceDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
    );
  }

  return {
    ticker: normalizedTicker,
    indexAdditions: additions,
    indexRemovals: removals,
    nearestRebalanceDate,
    daysToRebalance,
  };
}

/**
 * Get all upcoming rebalancing events within a given number of days.
 */
export function getUpcomingRebalances(
  withinDays: number = 60
): IndexRebalanceEvent[] {
  const today = new Date();
  const cutoff = new Date(today.getTime() + withinDays * 24 * 60 * 60 * 1000);

  return REBALANCE_EVENTS.filter((e) => {
    const rebalanceDate = new Date(e.rebalanceDate);
    return rebalanceDate >= today && rebalanceDate <= cutoff;
  }).sort(
    (a, b) =>
      new Date(a.rebalanceDate).getTime() - new Date(b.rebalanceDate).getTime()
  );
}

/**
 * Get rebalancing events for a specific market.
 */
export function getRebalancesByMarket(
  market: "US" | "JP" | "CN" | "HK" | "SG"
): IndexRebalanceEvent[] {
  return REBALANCE_EVENTS.filter((e) => e.market === market).sort(
    (a, b) =>
      new Date(b.rebalanceDate).getTime() - new Date(a.rebalanceDate).getTime()
  );
}

/**
 * Get stocks being added to indices (potential buying pressure).
 */
export function getIndexAdditions(
  withinDays: number = 30
): Array<{ ticker: string; index: string; date: string }> {
  const upcoming = getUpcomingRebalances(withinDays);
  const additions: Array<{ ticker: string; index: string; date: string }> = [];

  for (const event of upcoming) {
    for (const ticker of event.additions) {
      additions.push({
        ticker,
        index: event.indexName,
        date: event.rebalanceDate,
      });
    }
  }

  return additions.sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );
}

/**
 * Get stocks being removed from indices (potential selling pressure).
 */
export function getIndexRemovals(
  withinDays: number = 30
): Array<{ ticker: string; index: string; date: string }> {
  const upcoming = getUpcomingRebalances(withinDays);
  const removals: Array<{ ticker: string; index: string; date: string }> = [];

  for (const event of upcoming) {
    for (const ticker of event.removals) {
      removals.push({
        ticker,
        index: event.indexName,
        date: event.rebalanceDate,
      });
    }
  }

  return removals.sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );
}

/**
 * Add a rebalancing event programmatically.
 */
export function addRebalanceEvent(event: IndexRebalanceEvent): void {
  // Avoid duplicates
  const exists = REBALANCE_EVENTS.some(
    (e) =>
      e.indexCode === event.indexCode &&
      e.rebalanceDate === event.rebalanceDate
  );
  if (!exists) {
    REBALANCE_EVENTS.push(event);
  }
}

/**
 * Calculate the next expected rebalancing date for an index.
 */
export function getNextRebalanceDate(
  indexCode: keyof typeof INDEX_METADATA
): string | null {
  const metadata = INDEX_METADATA[indexCode];
  if (!metadata) return null;

  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth() + 1; // 1-indexed

  // Find the next rebalance month
  let targetMonth = metadata.rebalanceMonths.find((m) => m > month);
  let targetYear = year;

  if (!targetMonth) {
    // Wrap to next year
    targetMonth = metadata.rebalanceMonths[0];
    targetYear = year + 1;
  }

  // Approximate the date (third Friday of month as default)
  const firstOfMonth = new Date(targetYear, targetMonth - 1, 1);
  const firstFriday = (12 - firstOfMonth.getDay()) % 7 + 1;
  const thirdFriday = firstFriday + 14;

  return `${targetYear}-${String(targetMonth).padStart(2, "0")}-${String(thirdFriday).padStart(2, "0")}`;
}
