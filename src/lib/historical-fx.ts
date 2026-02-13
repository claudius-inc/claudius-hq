/**
 * Historical FX Rate Fetcher
 * Fetches and caches historical FX rates for accurate cost basis tracking
 */

import YahooFinance from 'yahoo-finance2';

const yf = new YahooFinance();

// FX pair symbols for Yahoo Finance (convert TO SGD)
const FX_SYMBOLS: Record<string, string> = {
  'USD': 'USDSGD=X',
  'HKD': 'HKDSGD=X',
  'EUR': 'EURSGD=X',
  'GBP': 'GBPSGD=X',
  'JPY': 'JPYSGD=X',
  'CNY': 'CNYSGD=X',
  'AUD': 'AUDSGD=X',
  'CAD': 'CADSGD=X',
};

interface HistoricalRate {
  date: string;
  currency: string;
  rate: number;
}

/**
 * Fetch historical FX rate for a specific date
 * Returns the rate to convert FROM the given currency TO SGD
 */
export async function getHistoricalFxRate(
  currency: string,
  date: string // YYYY-MM-DD
): Promise<number | null> {
  if (currency === 'SGD') return 1;
  
  const symbol = FX_SYMBOLS[currency];
  if (!symbol) {
    console.warn(`No FX symbol for currency: ${currency}`);
    return null;
  }

  try {
    // Fetch historical data for the date range
    const startDate = new Date(date);
    const endDate = new Date(date);
    endDate.setDate(endDate.getDate() + 5); // Get a few days in case of weekend/holiday

    const result = await yf.chart(symbol, {
      period1: startDate,
      period2: endDate,
      interval: '1d',
    });

    if (result.quotes && result.quotes.length > 0) {
      // Find the closest date
      const targetTime = startDate.getTime();
      let closest = result.quotes[0];
      let closestDiff = Math.abs(new Date(closest.date).getTime() - targetTime);

      for (const quote of result.quotes) {
        const diff = Math.abs(new Date(quote.date).getTime() - targetTime);
        if (diff < closestDiff) {
          closest = quote;
          closestDiff = diff;
        }
      }

      return closest.close || closest.open || null;
    }

    return null;
  } catch (err) {
    console.error(`Failed to fetch historical FX for ${currency} on ${date}:`, err);
    return null;
  }
}

/**
 * Batch fetch historical FX rates for multiple (currency, date) pairs
 */
export async function getHistoricalFxRates(
  requests: Array<{ currency: string; date: string }>
): Promise<Map<string, number>> {
  const results = new Map<string, number>();
  
  // Group by currency to minimize API calls
  const byCurrency = new Map<string, Set<string>>();
  for (const req of requests) {
    if (req.currency === 'SGD') {
      results.set(`${req.currency}:${req.date}`, 1);
      continue;
    }
    if (!byCurrency.has(req.currency)) {
      byCurrency.set(req.currency, new Set());
    }
    byCurrency.get(req.currency)!.add(req.date);
  }

  // Fetch rates for each currency
  for (const [currency, dates] of Array.from(byCurrency.entries())) {
    const symbol = FX_SYMBOLS[currency];
    if (!symbol) continue;

    const sortedDates = Array.from(dates).sort();
    const startDate = new Date(sortedDates[0]);
    const endDate = new Date(sortedDates[sortedDates.length - 1]);
    endDate.setDate(endDate.getDate() + 5);

    try {
      const result = await yf.chart(symbol, {
        period1: startDate,
        period2: endDate,
        interval: '1d',
      });

      if (result.quotes) {
        // Build a map of date -> rate
        const ratesByDate = new Map<string, number>();
        for (const quote of result.quotes) {
          const dateStr = new Date(quote.date).toISOString().substring(0, 10);
          ratesByDate.set(dateStr, quote.close || quote.open || 0);
        }

        // Find rate for each requested date (use closest available)
        for (const date of sortedDates) {
          let rate = ratesByDate.get(date);
          
          // If exact date not found, find closest
          if (!rate) {
            const targetTime = new Date(date).getTime();
            let closestDate = '';
            let closestDiff = Infinity;
            
            for (const [d] of Array.from(ratesByDate.entries())) {
              const diff = Math.abs(new Date(d).getTime() - targetTime);
              if (diff < closestDiff) {
                closestDate = d;
                closestDiff = diff;
              }
            }
            rate = ratesByDate.get(closestDate);
          }

          if (rate) {
            results.set(`${currency}:${date}`, rate);
          }
        }
      }
    } catch (err) {
      console.error(`Failed to fetch historical FX for ${currency}:`, err);
    }
  }

  return results;
}

/**
 * Get FX rate from cache map, with fallback
 */
export function getFxRateFromCache(
  cache: Map<string, number>,
  currency: string,
  date: string,
  fallback = 1
): number {
  if (currency === 'SGD') return 1;
  return cache.get(`${currency}:${date}`) || fallback;
}
