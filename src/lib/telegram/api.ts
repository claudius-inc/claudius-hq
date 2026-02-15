// Telegram API Helpers

import type { InlineKeyboardButton } from "./types";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

// Send message
export async function sendMessage(
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
export async function answerCallback(callbackId: string): Promise<void> {
  await fetch(`${TELEGRAM_API}/answerCallbackQuery`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ callback_query_id: callbackId }),
  });
}

// Send typing indicator
export async function sendTyping(chatId: number): Promise<void> {
  await fetch(`${TELEGRAM_API}/sendChatAction`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      action: "typing",
    }),
  });
}

// Edit existing message
export async function editMessage(
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
