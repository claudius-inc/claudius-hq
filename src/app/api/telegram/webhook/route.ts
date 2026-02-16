import { NextRequest, NextResponse } from "next/server";
import { 
  sendMessage, 
  sendTyping, 
  answerCallback, 
  editMessage,
  ensureUser,
} from "@/lib/telegram";
import {
  handlePortfolio,
  handleThemes,
  handleSectors,
  handlePrice,
  handleResearch,
  handleAlerts,
  handleAlertToggle,
  handleAlertThreshold,
  handleStart,
  handleHelp,
  handleWatchlist,
} from "@/lib/telegram/handlers";
import { ALLOWED_USER_IDS, type TelegramUpdate, type TimePeriod, type InlineKeyboardButton } from "@/lib/telegram/types";

// Period config for display
const PERIOD_CONFIG: Record<TimePeriod, { label: string }> = {
  "1d": { label: "1D" },
  "1w": { label: "1W" },
  "1m": { label: "1M" },
  "3m": { label: "3M" },
};

export async function POST(request: NextRequest) {
  // Webhook secret verification disabled temporarily
  // TODO: Re-enable once TELEGRAM_WEBHOOK_SECRET is confirmed working
  // const secretToken = request.headers.get("x-telegram-bot-api-secret-token");
  // if (process.env.TELEGRAM_WEBHOOK_SECRET && secretToken !== process.env.TELEGRAM_WEBHOOK_SECRET) {
  //   return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // }

  try {
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
      const periodLabel = PERIOD_CONFIG[validPeriod].label;
      
      if (cmd === "themes") {
        await editMessage(chatId, messageId, `⏳ Loading themes (${periodLabel})...`);
        const result = await handleThemes(validPeriod);
        await editMessage(chatId, messageId, result.text, result.keyboard);
      } else if (cmd === "sectors") {
        await editMessage(chatId, messageId, `⏳ Loading sectors (${periodLabel})...`);
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
        response = handleStart(firstName);
        break;
        
      case "/help":
        response = handleHelp();
        break;
        
      case "/portfolio":
        response = await handlePortfolio();
        break;
        
      case "/watchlist":
        response = await handleWatchlist();
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
        if (!arg) {
          response = "Usage: /price AAPL";
        } else {
          response = await handlePrice(arg);
        }
        break;
        
      case "/research": {
        if (!arg) {
          response = "Usage: /research AAPL";
        } else {
          const result = await handleResearch(arg);
          response = result.text;
        }
        break;
      }
      
      case "/alerts":
        response = await handleAlerts(telegramId);
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
        if (!arg || isNaN(parseFloat(arg))) {
          response = "Usage: /alerts_threshold 5.0";
        } else {
          response = await handleAlertThreshold(telegramId, parseFloat(arg));
        }
        break;
        
      default:
        // Check if it looks like a ticker (no slash)
        if (!command.startsWith("/") && /^[A-Z0-9.]{1,10}$/i.test(command)) {
          response = await handlePrice(command);
        } else {
          response = "Unknown command. Try /help";
        }
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
