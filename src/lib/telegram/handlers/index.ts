// Telegram Bot Command Handlers
// Consolidated handlers using Drizzle ORM

import { db, portfolioHoldings, themes, themeStocks, stockReports, telegramUsers, watchlist } from "@/db";
import { eq, desc, like } from "drizzle-orm";
import YahooFinance from "yahoo-finance2";
import { formatPrice, formatPercent, getEmoji, getPeriodKeyboard } from "../utils";
import type { QuoteResult, TimePeriod, InlineKeyboardButton, ThemesResult, SectorsResult } from "../types";

const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey", "ripHistorical"] });

// Period config
const PERIOD_CONFIG: Record<TimePeriod, { label: string; days: number }> = {
  "1d": { label: "1D", days: 1 },
  "1w": { label: "1W", days: 7 },
  "1m": { label: "1M", days: 30 },
  "3m": { label: "3M", days: 90 },
};

// ===== PORTFOLIO =====

export async function handlePortfolio(): Promise<string> {
  const holdings = await db
    .select()
    .from(portfolioHoldings)
    .orderBy(desc(portfolioHoldings.targetAllocation));

  if (holdings.length === 0) {
    return "📊 <b>Portfolio</b>\n\nNo holdings yet. Add them at claudiusinc.com/stocks/portfolio";
  }

  const lines: string[] = ["📊 <b>Portfolio</b>\n"];
  
  for (const h of holdings) {
    try {
      const quote = await yahooFinance.quote(h.ticker) as QuoteResult;
      const price = quote?.regularMarketPrice ?? 0;
      const change = quote?.regularMarketChangePercent ?? 0;
      lines.push(`${h.ticker}  ${formatPrice(price)}  ${formatPercent(change)} ${getEmoji(change)}`);
    } catch {
      lines.push(`${h.ticker}  - (error)`);
    }
  }

  lines.push(`\nclaudiusinc.com/stocks/portfolio`);
  return lines.join("\n");
}

// ===== THEMES =====

export async function handleThemes(period: TimePeriod = "1m"): Promise<ThemesResult> {
  const allThemes = await db.select().from(themes).orderBy(themes.name);
  const config = PERIOD_CONFIG[period];

  if (allThemes.length === 0) {
    return {
      text: "📈 <b>Themes</b>\n\nNo themes yet. Create them at claudiusinc.com/stocks/themes",
      keyboard: [],
    };
  }

  const lines: string[] = [`📈 <b>Investment Themes (${config.label})</b>\n`];

  for (const theme of allThemes) {
    // Get stocks for this theme
    const stocks = await db
      .select({ ticker: themeStocks.ticker })
      .from(themeStocks)
      .where(eq(themeStocks.themeId, theme.id));
    
    const tickers = stocks.map(r => r.ticker);
    
    if (tickers.length === 0) {
      lines.push(`${theme.name}: (empty)`);
      continue;
    }

    // Calculate average performance for the period
    let totalPerf = 0;
    let count = 0;
    
    for (const ticker of tickers.slice(0, 5)) { // Limit to 5 for speed
      try {
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - config.days);
        
        const history = await yahooFinance.chart(ticker, {
          period1: startDate,
          period2: endDate,
        });
        
        const quotes = history?.quotes ?? [];
        if (quotes.length >= 2) {
          const start = quotes[0]?.close ?? 0;
          const end = quotes[quotes.length - 1]?.close ?? 0;
          if (start > 0) {
            totalPerf += ((end - start) / start) * 100;
            count++;
          }
        }
      } catch {
        // Skip errors
      }
    }

    const avgPerf = count > 0 ? totalPerf / count : null;
    lines.push(`${theme.name} (${tickers.length})  ${formatPercent(avgPerf)} ${getEmoji(avgPerf)}`);
  }

  lines.push(`\nclaudiusinc.com/stocks/themes`);
  
  return {
    text: lines.join("\n"),
    keyboard: getPeriodKeyboard("themes", period),
  };
}

// ===== PRICE =====

export async function handlePrice(ticker: string): Promise<string> {
  try {
    const quote = await yahooFinance.quote(ticker.toUpperCase()) as QuoteResult & { 
      regularMarketDayHigh?: number;
      regularMarketDayLow?: number;
      regularMarketVolume?: number;
      fiftyTwoWeekHigh?: number;
      fiftyTwoWeekLow?: number;
    };
    
    if (!quote || !quote.regularMarketPrice) {
      return `❌ Could not find price for ${ticker.toUpperCase()}`;
    }

    const lines = [
      `📈 <b>${quote.shortName || ticker.toUpperCase()}</b>`,
      ``,
      `Price: <b>${formatPrice(quote.regularMarketPrice)}</b>`,
      `Change: ${formatPercent(quote.regularMarketChangePercent)} ${getEmoji(quote.regularMarketChangePercent)}`,
      ``,
      `Day Range: ${formatPrice(quote.regularMarketDayLow)} - ${formatPrice(quote.regularMarketDayHigh)}`,
      `52w Range: ${formatPrice(quote.fiftyTwoWeekLow)} - ${formatPrice(quote.fiftyTwoWeekHigh)}`,
    ];

    if (quote.regularMarketVolume) {
      lines.push(`Volume: ${(quote.regularMarketVolume / 1000000).toFixed(2)}M`);
    }

    return lines.join("\n");
  } catch (e) {
    return `❌ Error fetching ${ticker.toUpperCase()}: ${String(e)}`;
  }
}

// ===== RESEARCH =====

export async function handleResearch(ticker: string): Promise<{ text: string; reportId?: number }> {
  const upperTicker = ticker.toUpperCase();
  
  // Check if report exists
  const [report] = await db
    .select()
    .from(stockReports)
    .where(eq(stockReports.ticker, upperTicker))
    .orderBy(desc(stockReports.createdAt))
    .limit(1);

  if (report) {
    const url = `https://www.claudiusinc.com/stocks/research/${upperTicker}`;
    return {
      text: `📚 <b>Research: ${upperTicker}</b>\n\n${report.title || "Sun Tzu Report"}\n\n${url}`,
      reportId: report.id,
    };
  }

  return {
    text: `📚 No research found for ${upperTicker}.\n\nGenerate one at claudiusinc.com/stocks`,
  };
}

// ===== ALERTS =====

export async function handleAlerts(telegramId: number): Promise<string> {
  const [user] = await db
    .select()
    .from(telegramUsers)
    .where(eq(telegramUsers.telegramId, telegramId));

  if (!user) {
    return "⚠️ User not found. Send /start first.";
  }

  const lines = [
    "🔔 <b>Alert Settings</b>\n",
    `Theme Movers: ${user.alertThemeMovers ? "✅ ON" : "❌ OFF"}`,
    `Sector Rotation: ${user.alertSectorRotation ? "✅ ON" : "❌ OFF"}`,
    `Alert Threshold: ${user.alertThreshold}%`,
    "",
    "Use buttons below to toggle:",
  ];

  return lines.join("\n");
}

export async function handleAlertToggle(
  telegramId: number, 
  alertType: string, 
  enabled: boolean
): Promise<string> {
  if (alertType === "theme") {
    await db
      .update(telegramUsers)
      .set({ alertThemeMovers: enabled ? 1 : 0 })
      .where(eq(telegramUsers.telegramId, telegramId));
    return `Theme Movers alerts: ${enabled ? "✅ ON" : "❌ OFF"}`;
  } else if (alertType === "sector") {
    await db
      .update(telegramUsers)
      .set({ alertSectorRotation: enabled ? 1 : 0 })
      .where(eq(telegramUsers.telegramId, telegramId));
    return `Sector Rotation alerts: ${enabled ? "✅ ON" : "❌ OFF"}`;
  }
  return "Unknown alert type";
}

export async function handleAlertThreshold(
  telegramId: number, 
  threshold: number
): Promise<string> {
  await db
    .update(telegramUsers)
    .set({ alertThreshold: threshold })
    .where(eq(telegramUsers.telegramId, telegramId));
  return `Alert threshold set to ${threshold}%`;
}

// ===== START/HELP =====

export function handleStart(firstName?: string): string {
  const name = firstName ? ` ${firstName}` : "";
  return `👋 Welcome${name}!

I'm the Claudius Stocks Bot. Here's what I can do:

📊 /portfolio - View your portfolio
📈 /themes - Investment themes performance
🏢 /sectors - S&P 500 sector rotation
💰 /price AAPL - Get stock price
📚 /research AAPL - Get Sun Tzu report
🔔 /alerts - Manage alerts

Visit claudiusinc.com for full dashboard.`;
}

export function handleHelp(): string {
  return `🤖 <b>Claudius Stocks Bot</b>

<b>Commands:</b>
/portfolio - Your holdings with live prices
/themes - Investment themes performance
/sectors - S&P 500 sector rotation
/price AAPL - Quick stock lookup
/research AAPL - Sun Tzu research report
/alerts - Alert settings
/help - This message

<b>Tips:</b>
• Tap period buttons (1D/1W/1M/3M) to change timeframe
• Prices update in real-time from Yahoo Finance

🌐 claudiusinc.com`;
}

// ===== SECTORS (simplified) =====

const SECTOR_ETFS = ["XLK", "XLF", "XLY", "XLC", "XLV", "XLI", "XLP", "XLE", "XLB", "XLRE", "XLU"];
const SECTOR_NAMES: Record<string, string> = {
  XLK: "Technology",
  XLF: "Financials",
  XLY: "Consumer Disc",
  XLC: "Communication",
  XLV: "Healthcare",
  XLI: "Industrials",
  XLP: "Consumer Staples",
  XLE: "Energy",
  XLB: "Materials",
  XLRE: "Real Estate",
  XLU: "Utilities",
};

export async function handleSectors(period: TimePeriod = "1w"): Promise<SectorsResult> {
  const config = PERIOD_CONFIG[period];
  const lines: string[] = [`🏢 <b>S&P 500 Sectors (${config.label})</b>\n`];

  const results: Array<{ etf: string; name: string; perf: number }> = [];

  for (const etf of SECTOR_ETFS) {
    try {
      if (config.days <= 1) {
        const quote = await yahooFinance.quote(etf) as QuoteResult;
        if (quote?.regularMarketChangePercent !== undefined) {
          results.push({
            etf,
            name: SECTOR_NAMES[etf],
            perf: quote.regularMarketChangePercent,
          });
        }
      } else {
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - config.days);
        
        const history = await yahooFinance.chart(etf, {
          period1: startDate,
          period2: endDate,
        });
        
        const quotes = history?.quotes ?? [];
        if (quotes.length >= 2) {
          const start = quotes[0]?.close ?? 0;
          const end = quotes[quotes.length - 1]?.close ?? 0;
          if (start > 0) {
            results.push({
              etf,
              name: SECTOR_NAMES[etf],
              perf: ((end - start) / start) * 100,
            });
          }
        }
      }
    } catch {
      // Skip errors
    }
  }

  // Sort by performance
  results.sort((a, b) => b.perf - a.perf);

  for (const r of results) {
    lines.push(`${r.name}  ${formatPercent(r.perf)} ${getEmoji(r.perf)}`);
  }

  lines.push(`\nclaudiusinc.com/stocks/sectors`);

  return {
    text: lines.join("\n"),
    keyboard: getPeriodKeyboard("sectors", period),
  };
}

// ===== WATCHLIST =====

export async function handleWatchlist(): Promise<string> {
  const items = await db
    .select()
    .from(watchlist)
    .orderBy(desc(watchlist.addedAt));

  if (items.length === 0) {
    return "👀 <b>Watchlist</b>\n\nNo items yet. Add them at claudiusinc.com/stocks/watchlist";
  }

  const lines: string[] = ["👀 <b>Watchlist</b>\n"];
  
  for (const item of items) {
    try {
      const quote = await yahooFinance.quote(item.ticker) as QuoteResult;
      const price = quote?.regularMarketPrice ?? 0;
      const change = quote?.regularMarketChangePercent ?? 0;
      
      let targetInfo = "";
      if (item.targetPrice) {
        const gap = ((price - item.targetPrice) / item.targetPrice) * 100;
        targetInfo = ` (target: ${formatPrice(item.targetPrice)}, ${formatPercent(gap)})`;
      }
      
      lines.push(`${item.ticker}  ${formatPrice(price)}  ${formatPercent(change)} ${getEmoji(change)}${targetInfo}`);
    } catch {
      lines.push(`${item.ticker}  - (error)`);
    }
  }

  lines.push(`\nclaudiusinc.com/stocks/watchlist`);
  return lines.join("\n");
}
