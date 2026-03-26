/**
 * Earnings Calendar for Scanner V2
 * Tracks upcoming earnings dates via Yahoo Finance data.
 */

import yahooFinance from "yahoo-finance2";

export interface EarningsEvent {
  nextEarningsDate: string | null; // ISO date string
  daysTillEarnings: number | null;
  estimatedEPS: number | null;
  previousEPS: number | null;
  epsGrowthEstimate: number | null; // YoY growth estimate percentage
  earningsCallTime: "BMO" | "AMC" | "TNS" | null; // Before/After Market Open, TNS = Time Not Specified
  fiscalQuarter: string | null; // e.g., "Q1 2026"
}

// Rate limiting: 350ms between requests
const RATE_LIMIT_MS = 350;
let lastRequestTime = 0;

async function rateLimit(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < RATE_LIMIT_MS) {
    await new Promise((resolve) => setTimeout(resolve, RATE_LIMIT_MS - elapsed));
  }
  lastRequestTime = Date.now();
}

/**
 * Get earnings calendar information for a ticker.
 * Uses Yahoo Finance quoteSummary with earningsDate data.
 */
export async function getEarningsCalendar(ticker: string): Promise<EarningsEvent> {
  const defaultResult: EarningsEvent = {
    nextEarningsDate: null,
    daysTillEarnings: null,
    estimatedEPS: null,
    previousEPS: null,
    epsGrowthEstimate: null,
    earningsCallTime: null,
    fiscalQuarter: null,
  };

  try {
    await rateLimit();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = await yahooFinance.quoteSummary(ticker, {
      modules: ["calendarEvents", "earningsTrend", "earningsHistory"],
    });

    // Extract next earnings date from calendarEvents
    const calendar = result.calendarEvents;
    const trend = result.earningsTrend;
    const history = result.earningsHistory;

    if (calendar?.earnings?.earningsDate) {
      const earningsDates = calendar.earnings.earningsDate;
      if (earningsDates.length > 0) {
        const nextDate = earningsDates[0];
        defaultResult.nextEarningsDate = new Date(nextDate).toISOString().split("T")[0];

        // Calculate days until earnings
        const today = new Date();
        const earnings = new Date(nextDate);
        defaultResult.daysTillEarnings = Math.ceil(
          (earnings.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
        );
      }
    }

    // Extract EPS estimates from earningsTrend
    if (trend?.trend) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const currentQuarter = trend.trend.find(
        (t: { period?: string }) => t.period === "0q" || t.period === "+1q"
      );
      if (currentQuarter?.earningsEstimate) {
        defaultResult.estimatedEPS = currentQuarter.earningsEstimate.avg ?? null;
        defaultResult.epsGrowthEstimate = currentQuarter.earningsEstimate.growth ?? null;

        // Determine fiscal quarter
        if (currentQuarter.endDate) {
          const endDate = new Date(currentQuarter.endDate);
          const quarter = Math.ceil((endDate.getMonth() + 1) / 3);
          defaultResult.fiscalQuarter = `Q${quarter} ${endDate.getFullYear()}`;
        }
      }
    }

    // Get previous EPS from history
    if (history?.history && history.history.length > 0) {
      const mostRecent = history.history[0];
      defaultResult.previousEPS = mostRecent.epsActual ?? null;
    }

    return defaultResult;
  } catch (error) {
    // Log but don't throw - earnings data is supplementary
    console.warn(`[Earnings] ${ticker}: failed to fetch - ${error}`);
    return defaultResult;
  }
}

/**
 * Batch fetch earnings for multiple tickers.
 * Respects rate limiting.
 */
export async function batchGetEarningsCalendar(
  tickers: string[]
): Promise<Map<string, EarningsEvent>> {
  const results = new Map<string, EarningsEvent>();

  for (const ticker of tickers) {
    const earnings = await getEarningsCalendar(ticker);
    results.set(ticker, earnings);
  }

  return results;
}

/**
 * Filter tickers by upcoming earnings within N days.
 */
export async function getTickersWithEarningsSoon(
  tickers: string[],
  withinDays: number = 14
): Promise<Array<{ ticker: string; event: EarningsEvent }>> {
  const results: Array<{ ticker: string; event: EarningsEvent }> = [];

  for (const ticker of tickers) {
    const event = await getEarningsCalendar(ticker);
    if (
      event.daysTillEarnings !== null &&
      event.daysTillEarnings > 0 &&
      event.daysTillEarnings <= withinDays
    ) {
      results.push({ ticker, event });
    }
  }

  return results.sort(
    (a, b) => (a.event.daysTillEarnings ?? 0) - (b.event.daysTillEarnings ?? 0)
  );
}

/**
 * Check if a ticker is reporting earnings this week.
 */
export async function isReportingThisWeek(ticker: string): Promise<boolean> {
  const event = await getEarningsCalendar(ticker);
  return (
    event.daysTillEarnings !== null &&
    event.daysTillEarnings >= 0 &&
    event.daysTillEarnings <= 7
  );
}

/**
 * Determine earnings call timing from historical patterns.
 * BMO = Before Market Open, AMC = After Market Close
 */
export function inferEarningsCallTime(
  earningsDate: string
): "BMO" | "AMC" | null {
  // This would need historical data to determine typical timing
  // For now, return null (Time Not Specified)
  // Future enhancement: track company-specific patterns
  return null;
}
