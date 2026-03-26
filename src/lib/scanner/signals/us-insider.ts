/**
 * US: OpenInsider Integration
 * Scrapes OpenInsider.com for insider transactions.
 * Detects "cluster buys" (3+ insiders buying in 30 days) - historically 68-75% win rate.
 */

import type { USInsiderSignals } from "./types";

const OPENINSIDER_BASE_URL = "http://openinsider.com/screener";

interface InsiderTransaction {
  date: string;
  insiderName: string;
  title: string;
  transactionType: "P" | "S" | "A" | "D" | "M"; // Purchase, Sale, Automatic, Derivative, Multiple
  shares: number;
  value: number;
}

/**
 * Parse the OpenInsider HTML response to extract transactions.
 * OpenInsider uses a table with class "tinytable" for results.
 */
function parseOpenInsiderHTML(html: string): InsiderTransaction[] {
  const transactions: InsiderTransaction[] = [];

  try {
    // Find the tinytable - it contains all transaction rows
    const tableMatch = html.match(/<table[^>]*class="[^"]*tinytable[^"]*"[^>]*>([\s\S]*?)<\/table>/i);
    if (!tableMatch) return transactions;

    const tableContent = tableMatch[1];

    // Extract rows (skip header row)
    const rowMatches = Array.from(tableContent.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi));
    let isFirstRow = true;

    for (const rowMatch of rowMatches) {
      if (isFirstRow) {
        isFirstRow = false;
        continue; // Skip header
      }

      const row = rowMatch[1];
      const cells = Array.from(row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)).map((m) =>
        m[1].replace(/<[^>]*>/g, "").trim()
      );

      // OpenInsider columns (typical order):
      // 0: X (checkbox), 1: Filing Date, 2: Trade Date, 3: Ticker, 4: Company Name,
      // 5: Insider Name, 6: Title, 7: Trade Type, 8: Price, 9: Qty, 10: Owned,
      // 11: ΔOwn, 12: Value
      if (cells.length >= 12) {
        const tradeType = cells[7]?.toUpperCase() || "";
        const isPurchase = tradeType.includes("P");
        const isSale = tradeType.includes("S");

        if (isPurchase || isSale) {
          const shares = parseFloat(cells[9]?.replace(/[,+]/g, "") || "0");
          const value = parseFloat(cells[12]?.replace(/[$,+]/g, "") || "0");

          transactions.push({
            date: cells[2] || "", // Trade Date
            insiderName: cells[5] || "",
            title: cells[6] || "",
            transactionType: isPurchase ? "P" : "S",
            shares: Math.abs(shares),
            value: Math.abs(value),
          });
        }
      }
    }
  } catch (err) {
    console.error("[us-insider] Failed to parse HTML:", err);
  }

  return transactions;
}

/**
 * Fetch insider transactions for a US stock from OpenInsider.
 * @param ticker - Stock ticker (e.g., "AAPL", "TSLA")
 * @returns Insider signals or null on error
 */
export async function fetchUSInsiderSignals(ticker: string): Promise<USInsiderSignals | null> {
  try {
    // Clean ticker (remove any suffix)
    const cleanTicker = ticker.replace(/\.(US|NYSE|NASDAQ)$/i, "").toUpperCase();

    // Build URL: 30 days, purchases & sales
    const url = `${OPENINSIDER_BASE_URL}?s=${cleanTicker}&fd=30&td=0`;

    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; ClaudiusHQ/1.0)",
        Accept: "text/html",
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      console.warn(`[us-insider] HTTP ${response.status} for ${ticker}`);
      return null;
    }

    const html = await response.text();
    const transactions = parseOpenInsiderHTML(html);

    // Aggregate results
    const buys = transactions.filter((t) => t.transactionType === "P");
    const sells = transactions.filter((t) => t.transactionType === "S");

    const totalBuyValue = buys.reduce((sum, t) => sum + t.value, 0);
    const totalSellValue = sells.reduce((sum, t) => sum + t.value, 0);

    // Cluster buy detection: 3+ unique insiders buying
    const uniqueBuyers = new Set(buys.map((t) => t.insiderName)).size;
    const isClusterBuy = uniqueBuyers >= 3;

    // Find most recent transaction date
    const allDates = transactions.map((t) => t.date).filter(Boolean);
    const lastTransactionDate = allDates.length > 0 ? allDates[0] : undefined;

    return {
      insiderBuyCount: buys.length,
      insiderSellCount: sells.length,
      isClusterBuy,
      totalBuyValue,
      totalSellValue,
      lastTransactionDate,
    };
  } catch (err) {
    // Graceful failure - signal fetch should not crash scanner
    console.warn(`[us-insider] Failed to fetch ${ticker}:`, err);
    return null;
  }
}

/**
 * Batch fetch insider signals for multiple tickers.
 * Respects rate limits with delays between requests.
 */
export async function batchFetchUSInsiderSignals(
  tickers: string[],
  delayMs = 500
): Promise<Map<string, USInsiderSignals | null>> {
  const results = new Map<string, USInsiderSignals | null>();

  for (const ticker of tickers) {
    const signals = await fetchUSInsiderSignals(ticker);
    results.set(ticker, signals);

    // Rate limiting
    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  return results;
}
