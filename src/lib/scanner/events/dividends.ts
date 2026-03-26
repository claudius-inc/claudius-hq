/**
 * Dividend Calendar for Scanner V2
 * Tracks ex-dividend dates and dividend yields via Yahoo Finance.
 */

import yahooFinance from "yahoo-finance2";

export interface DividendEvent {
  exDividendDate: string | null; // ISO date string
  daysToExDate: number | null;
  dividendAmount: number | null; // Per share
  dividendYield: number | null; // Annual percentage
  paymentDate: string | null;
  dividendFrequency: "annual" | "semi-annual" | "quarterly" | "monthly" | null;
  lastDividendDate: string | null;
  lastDividendAmount: number | null;
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
 * Infer dividend frequency from annual dividend amount and last payment.
 */
function inferDividendFrequency(
  annualDividend: number | null | undefined,
  lastDividend: number | null | undefined
): "annual" | "semi-annual" | "quarterly" | "monthly" | null {
  if (!annualDividend || !lastDividend || lastDividend === 0) return null;

  const ratio = annualDividend / lastDividend;

  // Allow some tolerance for rounding
  if (ratio >= 3.5 && ratio <= 4.5) return "quarterly";
  if (ratio >= 1.8 && ratio <= 2.2) return "semi-annual";
  if (ratio >= 0.9 && ratio <= 1.1) return "annual";
  if (ratio >= 11 && ratio <= 13) return "monthly";

  return null;
}

/**
 * Get dividend calendar information for a ticker.
 * Uses Yahoo Finance quoteSummary with summaryDetail and calendarEvents.
 */
export async function getDividendCalendar(ticker: string): Promise<DividendEvent> {
  const defaultResult: DividendEvent = {
    exDividendDate: null,
    daysToExDate: null,
    dividendAmount: null,
    dividendYield: null,
    paymentDate: null,
    dividendFrequency: null,
    lastDividendDate: null,
    lastDividendAmount: null,
  };

  try {
    await rateLimit();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = await yahooFinance.quoteSummary(ticker, {
      modules: ["summaryDetail", "calendarEvents", "defaultKeyStatistics"],
    });

    const summary = result.summaryDetail;
    const calendar = result.calendarEvents;

    // Extract dividend yield
    if (summary?.dividendYield) {
      defaultResult.dividendYield = summary.dividendYield * 100; // Convert to percentage
    }

    // Extract dividend rate (forward annual dividend per share)
    if (summary?.dividendRate) {
      defaultResult.dividendAmount = summary.dividendRate;
    }

    // Extract ex-dividend date
    if (calendar?.exDividendDate) {
      const exDate = new Date(calendar.exDividendDate);
      defaultResult.exDividendDate = exDate.toISOString().split("T")[0];

      // Calculate days to ex-dividend
      const today = new Date();
      defaultResult.daysToExDate = Math.ceil(
        (exDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
      );
    }

    // Extract dividend date (payment date)
    if (calendar?.dividendDate) {
      defaultResult.paymentDate = new Date(calendar.dividendDate).toISOString().split("T")[0];
    }

    // Get last dividend info
    if (result.defaultKeyStatistics) {
      const stats = result.defaultKeyStatistics;
      if (stats.lastDividendDate) {
        defaultResult.lastDividendDate = new Date(stats.lastDividendDate)
          .toISOString()
          .split("T")[0];
      }
      if (stats.lastDividendValue) {
        defaultResult.lastDividendAmount = stats.lastDividendValue;
      }
    }

    // Infer frequency
    defaultResult.dividendFrequency = inferDividendFrequency(
      summary?.dividendRate,
      defaultResult.lastDividendAmount
    );

    return defaultResult;
  } catch (error) {
    // Log but don't throw - dividend data is supplementary
    console.warn(`[Dividends] ${ticker}: failed to fetch - ${error}`);
    return defaultResult;
  }
}

/**
 * Batch fetch dividends for multiple tickers.
 */
export async function batchGetDividendCalendar(
  tickers: string[]
): Promise<Map<string, DividendEvent>> {
  const results = new Map<string, DividendEvent>();

  for (const ticker of tickers) {
    const dividend = await getDividendCalendar(ticker);
    results.set(ticker, dividend);
  }

  return results;
}

/**
 * Filter tickers by upcoming ex-dividend date within N days.
 * Useful for dividend capture strategies.
 */
export async function getTickersWithExDivSoon(
  tickers: string[],
  withinDays: number = 7
): Promise<Array<{ ticker: string; event: DividendEvent }>> {
  const results: Array<{ ticker: string; event: DividendEvent }> = [];

  for (const ticker of tickers) {
    const event = await getDividendCalendar(ticker);
    if (
      event.daysToExDate !== null &&
      event.daysToExDate > 0 &&
      event.daysToExDate <= withinDays
    ) {
      results.push({ ticker, event });
    }
  }

  return results.sort(
    (a, b) => (a.event.daysToExDate ?? 0) - (b.event.daysToExDate ?? 0)
  );
}

/**
 * Get high-yield dividend stocks from a list.
 * Filters for yield above threshold.
 */
export async function getHighYieldDividendStocks(
  tickers: string[],
  minYield: number = 4.0
): Promise<Array<{ ticker: string; event: DividendEvent }>> {
  const results: Array<{ ticker: string; event: DividendEvent }> = [];

  for (const ticker of tickers) {
    const event = await getDividendCalendar(ticker);
    if (event.dividendYield !== null && event.dividendYield >= minYield) {
      results.push({ ticker, event });
    }
  }

  return results.sort(
    (a, b) => (b.event.dividendYield ?? 0) - (a.event.dividendYield ?? 0)
  );
}

/**
 * Check if a stock is going ex-dividend this week.
 */
export async function isExDividendThisWeek(ticker: string): Promise<boolean> {
  const event = await getDividendCalendar(ticker);
  return (
    event.daysToExDate !== null &&
    event.daysToExDate >= 0 &&
    event.daysToExDate <= 7
  );
}
