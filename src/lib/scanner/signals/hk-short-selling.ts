/**
 * Hong Kong: HKEX Short Selling Data
 * Scrapes HKEX short selling turnover data.
 * High short turnover ratio = potential squeeze opportunity.
 */

import type { HKShortSellingSignals } from "./types";

/**
 * Format date as DDMMYY for HKEX URL.
 */
function formatDateForHKEX(date: Date): string {
  const dd = date.getDate().toString().padStart(2, "0");
  const mm = (date.getMonth() + 1).toString().padStart(2, "0");
  const yy = date.getFullYear().toString().slice(-2);
  return `${dd}${mm}${yy}`;
}

/**
 * Get the most recent trading day (skip weekends).
 */
function getLastTradingDay(): Date {
  const now = new Date();
  const day = now.getDay();

  // If Sunday (0), go back to Friday
  if (day === 0) {
    now.setDate(now.getDate() - 2);
  }
  // If Saturday (6), go back to Friday
  else if (day === 6) {
    now.setDate(now.getDate() - 1);
  }
  // If before 18:00 HKT (10:00 UTC), use previous day
  else if (now.getUTCHours() < 10) {
    now.setDate(now.getDate() - 1);
    // Check if we landed on a weekend
    if (now.getDay() === 0) now.setDate(now.getDate() - 2);
    if (now.getDay() === 6) now.setDate(now.getDate() - 1);
  }

  return now;
}

interface HKEXShortSellingRow {
  stockCode: string;
  stockName: string;
  shortVolume: number;
  shortTurnover: number;
  totalTurnover: number;
}

/**
 * Parse HKEX short selling HTML response.
 * The page format is a pre-formatted table within HTML.
 */
function parseHKEXShortSellingHTML(html: string): Map<string, HKEXShortSellingRow> {
  const results = new Map<string, HKEXShortSellingRow>();

  try {
    // HKEX short selling pages use a simple table format
    // Look for stock codes (4 or 5 digit numbers) followed by data
    const lines = html.split("\n");

    for (const line of lines) {
      // Match lines that start with a stock code
      // Format: "00001   CKH Holdings          1,234,567     12,345,678     123,456,789"
      const match = line.match(
        /^\s*(\d{4,5})\s+(.+?)\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)\s*$/
      );

      if (match) {
        const stockCode = match[1].padStart(4, "0");
        const stockName = match[2].trim();
        const shortVolume = parseInt(match[3].replace(/,/g, ""), 10);
        const shortTurnover = parseInt(match[4].replace(/,/g, ""), 10);
        const totalTurnover = parseInt(match[5].replace(/,/g, ""), 10);

        results.set(stockCode, {
          stockCode,
          stockName,
          shortVolume,
          shortTurnover,
          totalTurnover,
        });
      }
    }
  } catch (err) {
    console.error("[hk-short-selling] Failed to parse HTML:", err);
  }

  return results;
}

// Cache for daily data (avoid re-fetching)
let dailyCache: Map<string, HKEXShortSellingRow> | null = null;
let dailyCacheDate: string | null = null;

/**
 * Fetch short selling data for a specific date.
 */
async function fetchDailyShortSellingData(date: Date): Promise<Map<string, HKEXShortSellingRow>> {
  const dateStr = formatDateForHKEX(date);

  // Check cache
  if (dailyCache && dailyCacheDate === dateStr) {
    return dailyCache;
  }

  try {
    // HKEX short selling URL pattern
    const url = `https://www.hkex.com.hk/eng/stat/smstat/dayquot/d${dateStr}ss.htm`;

    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; ClaudiusHQ/1.0)",
        Accept: "text/html",
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      // Data might not be available yet (published around 18:00 HKT)
      if (response.status === 404) {
        console.log(`[hk-short-selling] No data for ${dateStr} yet`);
        return new Map();
      }
      throw new Error(`HTTP ${response.status}`);
    }

    const html = await response.text();
    const data = parseHKEXShortSellingHTML(html);

    // Update cache
    dailyCache = data;
    dailyCacheDate = dateStr;

    console.log(`[hk-short-selling] Fetched ${data.size} stocks for ${dateStr}`);
    return data;
  } catch (err) {
    console.error(`[hk-short-selling] Failed to fetch data for ${dateStr}:`, err);
    return new Map();
  }
}

/**
 * Convert HK ticker to stock code.
 * "0700.HK" -> "0700"
 * "9988.HK" -> "9988"
 */
function normalizeHKTicker(ticker: string): string {
  return ticker.replace(/\.HK$/i, "").padStart(4, "0");
}

/**
 * Fetch short selling signals for a Hong Kong stock.
 * @param ticker - Stock ticker (e.g., "0700.HK", "9988.HK")
 * @returns Short selling signals or null if not found/error
 */
export async function fetchHKShortSellingSignals(
  ticker: string
): Promise<HKShortSellingSignals | null> {
  try {
    const tradingDay = getLastTradingDay();
    const data = await fetchDailyShortSellingData(tradingDay);

    const stockCode = normalizeHKTicker(ticker);
    const entry = data.get(stockCode);

    if (!entry) {
      // Stock might not have short selling data (ETFs, some small caps)
      return null;
    }

    // Calculate short turnover ratio
    const shortTurnoverRatio =
      entry.totalTurnover > 0
        ? (entry.shortTurnover / entry.totalTurnover) * 100
        : 0;

    return {
      shortVolume: entry.shortVolume,
      shortTurnoverRatio: Math.round(shortTurnoverRatio * 100) / 100, // 2 decimal places
      dataDate: tradingDay.toISOString().split("T")[0],
    };
  } catch (err) {
    console.warn(`[hk-short-selling] Failed to fetch ${ticker}:`, err);
    return null;
  }
}

/**
 * Get stocks with highest short turnover ratio.
 * Potential squeeze candidates.
 */
export async function getHighShortTurnoverStocks(
  minRatio = 10,
  limit = 50
): Promise<
  Array<{
    stockCode: string;
    stockName: string;
    shortTurnoverRatio: number;
    shortVolume: number;
  }>
> {
  const tradingDay = getLastTradingDay();
  const data = await fetchDailyShortSellingData(tradingDay);

  const stocks = Array.from(data.values())
    .map((entry) => ({
      stockCode: entry.stockCode,
      stockName: entry.stockName,
      shortTurnoverRatio:
        entry.totalTurnover > 0
          ? (entry.shortTurnover / entry.totalTurnover) * 100
          : 0,
      shortVolume: entry.shortVolume,
    }))
    .filter((s) => s.shortTurnoverRatio >= minRatio)
    .sort((a, b) => b.shortTurnoverRatio - a.shortTurnoverRatio)
    .slice(0, limit);

  return stocks;
}
