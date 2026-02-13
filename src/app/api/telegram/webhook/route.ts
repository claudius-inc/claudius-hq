import { NextRequest, NextResponse } from "next/server";
import db, { ensureDB } from "@/lib/db";
import YahooFinance from "yahoo-finance2";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

// Whitelist of allowed Telegram user IDs
const ALLOWED_USER_IDS = [
  357112696, // Mr Z (@manapixels)
];

// Yahoo Finance client
const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey", "ripHistorical"] });

// Types
interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from: {
      id: number;
      username?: string;
      first_name?: string;
    };
    chat: {
      id: number;
    };
    text?: string;
  };
  callback_query?: {
    id: string;
    from: {
      id: number;
      username?: string;
      first_name?: string;
    };
    message?: {
      message_id: number;
      chat: {
        id: number;
      };
    };
    data?: string;
  };
}

type TimePeriod = "1d" | "1w" | "1m" | "3m";

interface InlineKeyboardButton {
  text: string;
  callback_data: string;
}

interface QuoteResult {
  regularMarketPrice?: number;
  regularMarketChange?: number;
  regularMarketChangePercent?: number;
  shortName?: string;
}

// Send message
async function sendMessage(
  chatId: number, 
  text: string, 
  keyboard?: InlineKeyboardButton[][]
): Promise<number | null> {
  const body: Record<string, unknown> = {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
  };
  if (keyboard) {
    body.reply_markup = { inline_keyboard: keyboard };
  }
  const res = await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return data.result?.message_id ?? null;
}

// Answer callback query (removes loading state)
async function answerCallback(callbackId: string): Promise<void> {
  await fetch(`${TELEGRAM_API}/answerCallbackQuery`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ callback_query_id: callbackId }),
  });
}

// Send typing indicator
async function sendTyping(chatId: number): Promise<void> {
  await fetch(`${TELEGRAM_API}/sendChatAction`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      action: "typing",
    }),
  });
}

// Edit message
async function editMessage(
  chatId: number, 
  messageId: number, 
  text: string,
  keyboard?: InlineKeyboardButton[][]
): Promise<boolean> {
  const body: Record<string, unknown> = {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
  };
  if (keyboard) {
    body.reply_markup = { inline_keyboard: keyboard };
  }
  const res = await fetch(`${TELEGRAM_API}/editMessageText`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.ok;
}

// Ensure user exists
async function ensureUser(telegramId: number, username?: string, firstName?: string) {
  await db.execute({
    sql: `INSERT INTO telegram_users (telegram_id, username, first_name) 
          VALUES (?, ?, ?)
          ON CONFLICT(telegram_id) DO UPDATE SET 
            username = COALESCE(excluded.username, telegram_users.username),
            first_name = COALESCE(excluded.first_name, telegram_users.first_name)`,
    args: [telegramId, username ?? null, firstName ?? null],
  });
}

// Format helpers
function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined) return "-";
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

function formatPrice(price: number | null | undefined): string {
  if (price === null || price === undefined) return "-";
  return `$${price.toFixed(2)}`;
}

function getEmoji(value: number | null | undefined): string {
  if (value === null || value === undefined) return "⚪";
  return value >= 0 ? "🟢" : "🔴";
}

// Command handlers

async function handlePortfolio(chatId: number): Promise<string> {
  const result = await db.execute("SELECT * FROM portfolio_holdings ORDER BY target_allocation DESC");
  const holdings = result.rows as unknown as Array<{
    ticker: string;
    target_allocation: number;
    shares: number | null;
    cost_basis: number | null;
  }>;

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

// Period config
const PERIOD_CONFIG: Record<TimePeriod, { label: string; days: number }> = {
  "1d": { label: "1D", days: 1 },
  "1w": { label: "1W", days: 7 },
  "1m": { label: "1M", days: 30 },
  "3m": { label: "3M", days: 90 },
};

function getPeriodKeyboard(command: string, current: TimePeriod): InlineKeyboardButton[][] {
  return [[
    { text: current === "1d" ? "• 1D •" : "1D", callback_data: `${command}:1d` },
    { text: current === "1w" ? "• 1W •" : "1W", callback_data: `${command}:1w` },
    { text: current === "1m" ? "• 1M •" : "1M", callback_data: `${command}:1m` },
    { text: current === "3m" ? "• 3M •" : "3M", callback_data: `${command}:3m` },
  ]];
}

interface ThemesResult {
  text: string;
  keyboard: InlineKeyboardButton[][];
}

async function handleThemes(period: TimePeriod = "1m"): Promise<ThemesResult> {
  const result = await db.execute("SELECT * FROM themes ORDER BY name");
  const themes = result.rows as unknown as Array<{ id: number; name: string }>;
  const config = PERIOD_CONFIG[period];

  if (themes.length === 0) {
    return {
      text: "📈 <b>Themes</b>\n\nNo themes yet. Create them at claudiusinc.com/stocks/themes",
      keyboard: [],
    };
  }

  const lines: string[] = [`📈 <b>Investment Themes (${config.label})</b>\n`];

  for (const theme of themes) {
    // Get stocks for this theme
    const stocksResult = await db.execute({
      sql: "SELECT ticker FROM theme_stocks WHERE theme_id = ?",
      args: [theme.id],
    });
    const tickers = (stocksResult.rows as unknown as Array<{ ticker: string }>).map(r => r.ticker);
    
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

interface SectorsResult {
  text: string;
  keyboard: InlineKeyboardButton[][];
}

// Top holdings per sector (major stocks)
const SECTOR_HOLDINGS: Record<string, string[]> = {
  XLK: ["AAPL", "MSFT", "NVDA", "AVGO", "CRM", "AMD", "ADBE", "ORCL"],
  XLF: ["BRK-B", "JPM", "V", "MA", "BAC", "WFC", "GS", "MS"],
  XLY: ["AMZN", "TSLA", "HD", "MCD", "NKE", "SBUX", "LOW", "TJX"],
  XLC: ["META", "GOOGL", "NFLX", "DIS", "CMCSA", "T", "VZ", "TMUS"],
  XLV: ["LLY", "UNH", "JNJ", "MRK", "ABBV", "PFE", "TMO", "ABT"],
  XLI: ["GE", "CAT", "RTX", "HON", "UNP", "BA", "DE", "LMT"],
  XLP: ["PG", "KO", "PEP", "COST", "WMT", "PM", "MO", "CL"],
  XLE: ["XOM", "CVX", "COP", "SLB", "EOG", "MPC", "PSX", "VLO"],
  XLB: ["LIN", "APD", "SHW", "ECL", "FCX", "NEM", "NUE", "DOW"],
  XLRE: ["PLD", "AMT", "EQIX", "SPG", "PSA", "O", "WELL", "DLR"],
  XLU: ["NEE", "SO", "DUK", "CEG", "SRE", "AEP", "D", "EXC"],
};

async function getTopGainers(tickers: string[], days: number, limit: number = 3): Promise<Array<{ ticker: string; perf: number }>> {
  const results: Array<{ ticker: string; perf: number }> = [];
  
  for (const ticker of tickers.slice(0, 8)) { // Check up to 8 stocks
    try {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      
      const history = await yahooFinance.chart(ticker, {
        period1: startDate,
        period2: endDate,
      });
      
      const quotes = history?.quotes ?? [];
      if (quotes.length >= 2) {
        const start = quotes[0]?.close ?? 0;
        const end = quotes[quotes.length - 1]?.close ?? 0;
        if (start > 0) {
          results.push({
            ticker,
            perf: ((end - start) / start) * 100,
          });
        }
      }
    } catch {
      // Skip errors
    }
  }
  
  return results.sort((a, b) => b.perf - a.perf).slice(0, limit);
}

async function handleSectors(period: TimePeriod = "1w"): Promise<SectorsResult> {
  const SECTOR_ETFS = [
    { ticker: "XLK", name: "Technology" },
    { ticker: "XLF", name: "Financials" },
    { ticker: "XLY", name: "Consumer Disc" },
    { ticker: "XLC", name: "Comm Services" },
    { ticker: "XLV", name: "Healthcare" },
    { ticker: "XLI", name: "Industrials" },
    { ticker: "XLP", name: "Consumer Staples" },
    { ticker: "XLE", name: "Energy" },
    { ticker: "XLB", name: "Materials" },
    { ticker: "XLRE", name: "Real Estate" },
    { ticker: "XLU", name: "Utilities" },
  ];

  const config = PERIOD_CONFIG[period];
  const performances: Array<{ name: string; ticker: string; perf: number; topGainers: Array<{ ticker: string; perf: number }> }> = [];

  for (const sector of SECTOR_ETFS) {
    try {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - config.days);
      
      const history = await yahooFinance.chart(sector.ticker, {
        period1: startDate,
        period2: endDate,
      });
      
      const quotes = history?.quotes ?? [];
      if (quotes.length >= 2) {
        const start = quotes[0]?.close ?? 0;
        const end = quotes[quotes.length - 1]?.close ?? 0;
        if (start > 0) {
          // Get top gainers for this sector
          const holdings = SECTOR_HOLDINGS[sector.ticker] || [];
          const topGainers = await getTopGainers(holdings, config.days, 3);
          
          performances.push({
            name: sector.name,
            ticker: sector.ticker,
            perf: ((end - start) / start) * 100,
            topGainers,
          });
        }
      }
    } catch {
      // Skip errors
    }
  }

  performances.sort((a, b) => b.perf - a.perf);

  const lines: string[] = [`📊 <b>Sector Momentum (${config.label})</b>\n`];
  
  lines.push("🔥 <b>Top 3 Sectors</b>");
  for (const s of performances.slice(0, 3)) {
    lines.push(`\n<b>${s.name}</b>  ${formatPercent(s.perf)} 🟢`);
    if (s.topGainers.length > 0) {
      const gainersStr = s.topGainers
        .map(g => `${g.ticker} ${formatPercent(g.perf)}`)
        .join(", ");
      lines.push(`  └ ${gainersStr}`);
    }
  }
  
  lines.push("\n❄️ <b>Bottom 3 Sectors</b>");
  for (const s of performances.slice(-3).reverse()) {
    lines.push(`\n<b>${s.name}</b>  ${formatPercent(s.perf)} 🔴`);
    if (s.topGainers.length > 0) {
      const gainersStr = s.topGainers
        .map(g => `${g.ticker} ${formatPercent(g.perf)}`)
        .join(", ");
      lines.push(`  └ ${gainersStr}`);
    }
  }

  lines.push(`\nclaudiusinc.com/stocks/sectors`);
  
  return {
    text: lines.join("\n"),
    keyboard: getPeriodKeyboard("sectors", period),
  };
}

async function handlePrice(chatId: number, ticker: string): Promise<string> {
  if (!ticker) {
    return "Usage: /price TICKER\n\nExample: /price BABA";
  }

  const upperTicker = ticker.toUpperCase();
  
  try {
    const quote = await yahooFinance.quote(upperTicker) as QuoteResult;
    const price = quote?.regularMarketPrice;
    const change = quote?.regularMarketChangePercent;
    const name = quote?.shortName ?? upperTicker;

    if (price === undefined) {
      return `❌ Could not find price for ${upperTicker}`;
    }

    // Get 1W and 1M changes
    const endDate = new Date();
    const startDate1W = new Date();
    startDate1W.setDate(startDate1W.getDate() - 7);
    const startDate1M = new Date();
    startDate1M.setMonth(startDate1M.getMonth() - 1);

    let change1W: number | null = null;
    let change1M: number | null = null;

    try {
      const history = await yahooFinance.chart(upperTicker, {
        period1: startDate1M,
        period2: endDate,
      });
      
      const quotes = history?.quotes ?? [];
      if (quotes.length > 0) {
        const endPrice = quotes[quotes.length - 1]?.close ?? price;
        
        // Find ~7 days ago
        const weekAgoDate = new Date();
        weekAgoDate.setDate(weekAgoDate.getDate() - 7);
        const weekAgoQuote = quotes.find(q => new Date(q.date) <= weekAgoDate);
        if (weekAgoQuote?.close) {
          change1W = ((endPrice - weekAgoQuote.close) / weekAgoQuote.close) * 100;
        }
        
        // 1M is first quote
        if (quotes[0]?.close) {
          change1M = ((endPrice - quotes[0].close) / quotes[0].close) * 100;
        }
      }
    } catch {
      // Ignore history errors
    }

    const lines = [
      `💰 <b>${upperTicker}</b> - ${name}`,
      "",
      `Price: ${formatPrice(price)}`,
      `1D: ${formatPercent(change)} ${getEmoji(change)}`,
      `1W: ${formatPercent(change1W)} ${getEmoji(change1W)}`,
      `1M: ${formatPercent(change1M)} ${getEmoji(change1M)}`,
      "",
      `tradingview.com/chart/?symbol=${upperTicker}`,
    ];

    return lines.join("\n");
  } catch (e) {
    return `❌ Error fetching ${upperTicker}: ${String(e)}`;
  }
}

async function handleResearch(chatId: number, messageId: number, ticker: string): Promise<string> {
  if (!ticker) {
    return "Usage: /research TICKER\n\nExample: /research BABA";
  }

  const upperTicker = ticker.toUpperCase();

  // Check if report exists
  const existing = await db.execute({
    sql: "SELECT id, title, content FROM stock_reports WHERE ticker = ? ORDER BY created_at DESC LIMIT 1",
    args: [upperTicker],
  });

  if (existing.rows.length > 0) {
    const report = existing.rows[0] as unknown as { id: number; title: string; content: string };
    const preview = report.content.substring(0, 500).replace(/<[^>]*>/g, "");
    
    return [
      `📑 <b>${report.title}</b>`,
      "",
      preview + "...",
      "",
      `Full report: claudiusinc.com/stocks/${upperTicker}`,
    ].join("\n");
  }

  // Queue research job
  const jobId = `tg-${Date.now()}`;
  await db.execute({
    sql: `INSERT INTO research_jobs (id, ticker, status, progress) VALUES (?, ?, 'pending', 0)`,
    args: [jobId, upperTicker],
  });

  // Store pending action for message editing
  await db.execute({
    sql: `INSERT INTO telegram_pending (telegram_id, chat_id, message_id, action_type, payload) 
          VALUES (?, ?, ?, 'research', ?)`,
    args: [chatId, chatId, messageId, JSON.stringify({ ticker: upperTicker, jobId })],
  });

  return `⏳ Research queued for <b>${upperTicker}</b>...\n\nI'll update this message when complete (5-8 min).`;
}

async function handleAlerts(chatId: number, telegramId: number): Promise<string> {
  const result = await db.execute({
    sql: "SELECT * FROM telegram_users WHERE telegram_id = ?",
    args: [telegramId],
  });

  const user = result.rows[0] as unknown as {
    alert_theme_movers: number;
    alert_sector_rotation: number;
    alert_threshold: number;
  } | undefined;

  const themeMovers = user?.alert_theme_movers ? "✅" : "❌";
  const sectorRotation = user?.alert_sector_rotation ? "✅" : "❌";
  const threshold = user?.alert_threshold ?? 5.0;

  return [
    "🔔 <b>Alert Settings</b>",
    "",
    `${themeMovers} Theme Movers (>${threshold}% weekly)`,
    `${sectorRotation} Sector Rotation`,
    "",
    "Commands:",
    "/alerts_theme_on - Enable theme alerts",
    "/alerts_theme_off - Disable theme alerts",
    "/alerts_sector_on - Enable sector alerts",
    "/alerts_sector_off - Disable sector alerts",
    "/alerts_threshold 5 - Set threshold %",
  ].join("\n");
}

async function handleAlertToggle(telegramId: number, alertType: string, enabled: boolean): Promise<string> {
  const column = alertType === "theme" ? "alert_theme_movers" : "alert_sector_rotation";
  await db.execute({
    sql: `UPDATE telegram_users SET ${column} = ? WHERE telegram_id = ?`,
    args: [enabled ? 1 : 0, telegramId],
  });
  return `✅ ${alertType === "theme" ? "Theme movers" : "Sector rotation"} alerts ${enabled ? "enabled" : "disabled"}`;
}

async function handleAlertThreshold(telegramId: number, threshold: number): Promise<string> {
  if (isNaN(threshold) || threshold < 1 || threshold > 50) {
    return "❌ Threshold must be between 1 and 50";
  }
  await db.execute({
    sql: `UPDATE telegram_users SET alert_threshold = ? WHERE telegram_id = ?`,
    args: [threshold, telegramId],
  });
  return `✅ Alert threshold set to ${threshold}%`;
}

async function handleStart(firstName?: string): Promise<string> {
  return [
    `👋 Welcome${firstName ? ` ${firstName}` : ""}!`,
    "",
    "I'm the Claudius HQ bot. Here's what I can do:",
    "",
    "/portfolio - View holdings + prices",
    "/themes - Investment theme performance",
    "/sectors - Sector momentum (top/bottom 3)",
    "/price TICKER - Quick price lookup",
    "/research TICKER - Get or generate report",
    "/alerts - Configure alert settings",
    "",
    "Full dashboard: claudiusinc.com",
  ].join("\n");
}

async function handleHelp(): Promise<string> {
  return [
    "📚 <b>Commands</b>",
    "",
    "/portfolio - Holdings with live prices",
    "/themes - Theme performance leaderboard",
    "/sectors - Sector momentum ranking",
    "/price TICKER - Quick price + changes",
    "/research TICKER - Sun Tzu analysis",
    "/alerts - View/configure alerts",
    "",
    "claudiusinc.com",
  ].join("\n");
}

// Main webhook handler
export async function POST(request: NextRequest) {
  try {
    await ensureDB();
    
    const update: TelegramUpdate = await request.json();
    
    // Handle callback queries (button clicks)
    if (update.callback_query) {
      const cb = update.callback_query;
      const telegramId = cb.from.id;
      const chatId = cb.message?.chat.id;
      const messageId = cb.message?.message_id;
      const data = cb.data || "";
      
      // Answer callback to remove loading state
      await answerCallback(cb.id);
      
      // Whitelist check
      if (!ALLOWED_USER_IDS.includes(telegramId)) {
        return NextResponse.json({ ok: true });
      }
      
      if (!chatId || !messageId) {
        return NextResponse.json({ ok: true });
      }
      
      // Parse callback data: "command:period"
      const [cmd, period] = data.split(":");
      const validPeriod = ["1d", "1w", "1m", "3m"].includes(period) ? period as TimePeriod : "1m";
      
      if (cmd === "themes") {
        const result = await handleThemes(validPeriod);
        await editMessage(chatId, messageId, result.text, result.keyboard);
      } else if (cmd === "sectors") {
        const result = await handleSectors(validPeriod);
        await editMessage(chatId, messageId, result.text, result.keyboard);
      }
      
      return NextResponse.json({ ok: true });
    }
    
    // Handle regular messages
    const message = update.message;
    
    if (!message?.text) {
      return NextResponse.json({ ok: true });
    }

    const chatId = message.chat.id;
    const telegramId = message.from.id;
    const username = message.from.username;
    const firstName = message.from.first_name;
    const text = message.text.trim();

    // Whitelist check
    if (!ALLOWED_USER_IDS.includes(telegramId)) {
      await sendMessage(chatId, "⛔ This bot is private.\n\nContact @manapixels for access.");
      return NextResponse.json({ ok: true });
    }

    // Show typing indicator
    await sendTyping(chatId);

    // Ensure user exists
    await ensureUser(telegramId, username, firstName);

    // Parse command
    const [command, ...args] = text.split(/\s+/);
    const arg = args.join(" ");

    let response: string;
    let keyboard: InlineKeyboardButton[][] | undefined;

    switch (command.toLowerCase()) {
      case "/start":
        response = await handleStart(firstName);
        break;
      case "/help":
        response = await handleHelp();
        break;
      case "/portfolio":
        response = await handlePortfolio(chatId);
        break;
      case "/themes": {
        const result = await handleThemes("1m");
        response = result.text;
        keyboard = result.keyboard;
        break;
      }
      case "/sectors": {
        const result = await handleSectors("1w");
        response = result.text;
        keyboard = result.keyboard;
        break;
      }
      case "/price":
        response = await handlePrice(chatId, arg);
        break;
      case "/research": {
        // Send initial message, then return with message ID for editing later
        const initialMsg = await sendMessage(chatId, "⏳ Checking...");
        if (initialMsg) {
          response = await handleResearch(chatId, initialMsg, arg);
          await editMessage(chatId, initialMsg, response);
        }
        return NextResponse.json({ ok: true });
      }
      case "/alerts":
        response = await handleAlerts(chatId, telegramId);
        break;
      case "/alerts_theme_on":
        response = await handleAlertToggle(telegramId, "theme", true);
        break;
      case "/alerts_theme_off":
        response = await handleAlertToggle(telegramId, "theme", false);
        break;
      case "/alerts_sector_on":
        response = await handleAlertToggle(telegramId, "sector", true);
        break;
      case "/alerts_sector_off":
        response = await handleAlertToggle(telegramId, "sector", false);
        break;
      case "/alerts_threshold":
        response = await handleAlertThreshold(telegramId, parseFloat(arg));
        break;
      default:
        response = "Unknown command. Try /help";
    }

    await sendMessage(chatId, response, keyboard);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("Telegram webhook error:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// Verify webhook (GET)
export async function GET() {
  return NextResponse.json({ status: "Telegram webhook active" });
}
