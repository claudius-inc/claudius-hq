/**
 * Hardened Telegram send/edit for the daily note — see docs/daily-note-spec.md §2.
 *
 * The base helpers in src/lib/telegram/api.ts swallow errors (return null / bare
 * res.ok) and can't expose `data.description`, so a critical push can fail
 * silently. These variants expose the response body, log `description`, retry
 * once on 429, and THROW on genuine failure. `editNote` treats the benign
 * "message is not modified" 400 as success (idempotent re-runs).
 */
import { logger } from "@/lib/logger";

const SRC = "notes/telegram";

export interface TgResult {
  ok: boolean;
  description?: string;
  messageId?: number;
}

interface TgApiResponse {
  ok: boolean;
  description?: string;
  parameters?: { retry_after?: number };
  result?: { message_id?: number };
}

function apiBase(): string {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not set");
  return `https://api.telegram.org/bot${token}`;
}

async function call(method: string, body: Record<string, unknown>): Promise<TgApiResponse> {
  const res = await fetch(`${apiBase()}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return (await res.json()) as TgApiResponse;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Send once, retrying a single time on 429 honoring `retry_after`. */
async function sendWithRetry(method: string, body: Record<string, unknown>): Promise<TgApiResponse> {
  const first = await call(method, body);
  if (!first.ok && first.parameters?.retry_after) {
    const wait = Math.min(first.parameters.retry_after, 30);
    logger.warn(SRC, `429 from Telegram; retrying after ${wait}s`, { method });
    await sleep(wait * 1000);
    return call(method, body);
  }
  return first;
}

/**
 * Post the note to the channel. Throws on genuine failure (a silent no-send is
 * unacceptable). Returns the new message_id for persistence.
 */
export async function sendNote(chatId: number, html: string): Promise<TgResult> {
  const data = await sendWithRetry("sendMessage", {
    chat_id: chatId,
    text: html,
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
  });
  if (!data.ok) {
    logger.error(SRC, "Telegram sendMessage failed", { description: data.description });
    throw new Error(`Telegram sendMessage failed: ${data.description ?? "unknown error"}`);
  }
  return { ok: true, description: data.description, messageId: data.result?.message_id };
}

/**
 * Edit an existing note in place (idempotent re-run / same-day correction).
 * "message is not modified" is treated as success.
 */
export async function editNote(chatId: number, messageId: number, html: string): Promise<TgResult> {
  const data = await sendWithRetry("editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text: html,
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
  });
  if (!data.ok) {
    if (data.description?.includes("message is not modified")) {
      return { ok: true, description: data.description, messageId };
    }
    logger.error(SRC, "Telegram editMessageText failed", { description: data.description });
    throw new Error(`Telegram editMessageText failed: ${data.description ?? "unknown error"}`);
  }
  return { ok: true, description: data.description, messageId: data.result?.message_id ?? messageId };
}

/** Plain-text admin alert (used for §7a skips + crashes). Never throws. */
export async function alertAdmin(text: string): Promise<void> {
  const chat = process.env.TELEGRAM_ADMIN_CHAT_ID;
  if (!chat) {
    logger.warn(SRC, "TELEGRAM_ADMIN_CHAT_ID not set; cannot alert admin", { text });
    return;
  }
  try {
    const data = await call("sendMessage", { chat_id: chat, text, disable_notification: false });
    if (!data.ok) logger.error(SRC, "alertAdmin: Telegram returned not-ok", { description: data.description });
  } catch (error) {
    logger.error(SRC, "alertAdmin failed", { error });
  }
}
