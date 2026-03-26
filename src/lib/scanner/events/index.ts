/**
 * Event-Driven Signals Aggregator for Scanner V2
 *
 * Consolidates all event-driven signals into a single interface
 * for easy integration with the scanner results.
 */

export * from "./spinoffs";
export * from "./index-rebalancing";
export * from "./earnings";
export * from "./dividends";
export * from "./lockup";

import { getSpinoffStatus, type SpinoffEvent } from "./spinoffs";
import { getRebalanceStatus, type TickerRebalanceStatus } from "./index-rebalancing";
import { getEarningsCalendar, type EarningsEvent } from "./earnings";
import { getDividendCalendar, type DividendEvent } from "./dividends";
import { getLockupStatus, type LockupEvent } from "./lockup";

/**
 * Comprehensive upcoming events for a ticker.
 */
export interface UpcomingEvents {
  spinoff: SpinoffEvent;
  indexRebalancing: TickerRebalanceStatus;
  earnings: EarningsEvent;
  dividends: DividendEvent;
  lockup: LockupEvent;
  // Summary flags for quick filtering
  hasUpcomingCatalyst: boolean;
  catalystSummary: string[];
}

/**
 * Get all upcoming events for a ticker.
 * Aggregates data from all event sources.
 *
 * Note: This fetches earnings and dividend data from Yahoo Finance,
 * which may involve network requests and rate limiting.
 */
export async function getUpcomingEvents(ticker: string): Promise<UpcomingEvents> {
  // Fetch static data first (no network)
  const spinoff = getSpinoffStatus(ticker);
  const indexRebalancing = getRebalanceStatus(ticker);
  const lockup = getLockupStatus(ticker);

  // Fetch Yahoo Finance data (with rate limiting)
  const [earnings, dividends] = await Promise.all([
    getEarningsCalendar(ticker),
    getDividendCalendar(ticker),
  ]);

  // Build catalyst summary
  const catalystSummary: string[] = [];

  if (spinoff.isSpinoff) {
    if (spinoff.daysToSpinoff && spinoff.daysToSpinoff > 0) {
      catalystSummary.push(`Spinoff in ${spinoff.daysToSpinoff} days`);
    } else if (spinoff.status === "completed") {
      catalystSummary.push("Recent spinoff");
    }
  }

  if (indexRebalancing.indexAdditions.length > 0) {
    const indices = indexRebalancing.indexAdditions.map((e) => e.indexName).join(", ");
    catalystSummary.push(`Index addition: ${indices}`);
  }

  if (indexRebalancing.indexRemovals.length > 0) {
    const indices = indexRebalancing.indexRemovals.map((e) => e.indexName).join(", ");
    catalystSummary.push(`Index removal: ${indices} (⚠️)`);
  }

  if (earnings.daysTillEarnings !== null && earnings.daysTillEarnings <= 14 && earnings.daysTillEarnings >= 0) {
    catalystSummary.push(`Earnings in ${earnings.daysTillEarnings} days`);
  }

  if (dividends.daysToExDate !== null && dividends.daysToExDate <= 14 && dividends.daysToExDate >= 0) {
    catalystSummary.push(`Ex-div in ${dividends.daysToExDate} days`);
  }

  if (lockup.daysToExpiry !== null && lockup.daysToExpiry <= 30 && lockup.daysToExpiry >= 0) {
    catalystSummary.push(`Lockup expiry in ${lockup.daysToExpiry} days (⚠️)`);
  }

  return {
    spinoff,
    indexRebalancing,
    earnings,
    dividends,
    lockup,
    hasUpcomingCatalyst: catalystSummary.length > 0,
    catalystSummary,
  };
}

/**
 * Get upcoming events for multiple tickers (batch).
 * Respects rate limiting for Yahoo Finance calls.
 */
export async function batchGetUpcomingEvents(
  tickers: string[]
): Promise<Map<string, UpcomingEvents>> {
  const results = new Map<string, UpcomingEvents>();

  for (const ticker of tickers) {
    const events = await getUpcomingEvents(ticker);
    results.set(ticker, events);
  }

  return results;
}

/**
 * Quick event check - returns only static data (no network calls).
 * Useful for fast filtering when you don't need earnings/dividend data.
 */
export function getStaticEvents(ticker: string): {
  spinoff: SpinoffEvent;
  indexRebalancing: TickerRebalanceStatus;
  lockup: LockupEvent;
} {
  return {
    spinoff: getSpinoffStatus(ticker),
    indexRebalancing: getRebalanceStatus(ticker),
    lockup: getLockupStatus(ticker),
  };
}

/**
 * Filter tickers by those with upcoming catalysts.
 */
export async function filterTickersWithCatalysts(
  tickers: string[],
  options: {
    includeEarnings?: boolean;
    includeDividends?: boolean;
    includeSpinoffs?: boolean;
    includeRebalancing?: boolean;
    includeLockups?: boolean;
    earningsDays?: number;
    dividendDays?: number;
    lockupDays?: number;
  } = {}
): Promise<Array<{ ticker: string; events: UpcomingEvents }>> {
  const {
    includeEarnings = true,
    includeDividends = true,
    includeSpinoffs = true,
    includeRebalancing = true,
    includeLockups = true,
    earningsDays = 14,
    dividendDays = 14,
    lockupDays = 30,
  } = options;

  const results: Array<{ ticker: string; events: UpcomingEvents }> = [];

  for (const ticker of tickers) {
    const events = await getUpcomingEvents(ticker);
    let hasCatalyst = false;

    if (includeSpinoffs && events.spinoff.isSpinoff) {
      hasCatalyst = true;
    }

    if (
      includeRebalancing &&
      (events.indexRebalancing.indexAdditions.length > 0 ||
        events.indexRebalancing.indexRemovals.length > 0)
    ) {
      hasCatalyst = true;
    }

    if (
      includeEarnings &&
      events.earnings.daysTillEarnings !== null &&
      events.earnings.daysTillEarnings >= 0 &&
      events.earnings.daysTillEarnings <= earningsDays
    ) {
      hasCatalyst = true;
    }

    if (
      includeDividends &&
      events.dividends.daysToExDate !== null &&
      events.dividends.daysToExDate >= 0 &&
      events.dividends.daysToExDate <= dividendDays
    ) {
      hasCatalyst = true;
    }

    if (
      includeLockups &&
      events.lockup.daysToExpiry !== null &&
      events.lockup.daysToExpiry >= 0 &&
      events.lockup.daysToExpiry <= lockupDays
    ) {
      hasCatalyst = true;
    }

    if (hasCatalyst) {
      results.push({ ticker, events });
    }
  }

  return results;
}

/**
 * Generate a human-readable event summary for display.
 */
export function formatEventSummary(events: UpcomingEvents): string {
  if (events.catalystSummary.length === 0) {
    return "No upcoming catalysts";
  }

  return events.catalystSummary.join(" • ");
}

/**
 * Determine if events are net positive or negative catalyst.
 * Positive: index addition, spinoff, earnings beat potential
 * Negative: index removal, lockup expiry
 */
export function getCatalystSentiment(events: UpcomingEvents): "positive" | "negative" | "mixed" | "neutral" {
  let positiveCount = 0;
  let negativeCount = 0;

  if (events.spinoff.isSpinoff && events.spinoff.status !== "completed") {
    positiveCount++; // Spinoffs often unlock value
  }

  if (events.indexRebalancing.indexAdditions.length > 0) {
    positiveCount++; // Index inclusion = buying pressure
  }

  if (events.indexRebalancing.indexRemovals.length > 0) {
    negativeCount++; // Index removal = selling pressure
  }

  if (events.lockup.daysToExpiry !== null && events.lockup.daysToExpiry <= 30) {
    negativeCount++; // Lockup expiry = potential selling
  }

  if (positiveCount > 0 && negativeCount > 0) {
    return "mixed";
  } else if (positiveCount > 0) {
    return "positive";
  } else if (negativeCount > 0) {
    return "negative";
  }

  return "neutral";
}
