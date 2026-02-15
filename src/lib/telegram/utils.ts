// Telegram Bot Utilities

import type { InlineKeyboardButton, TimePeriod } from "./types";
import { db, telegramUsers } from "@/db";
import { eq } from "drizzle-orm";

// Ensure user exists in database
export async function ensureUser(
  telegramId: number, 
  username?: string, 
  firstName?: string
): Promise<void> {
  // Check if user exists
  const [existing] = await db
    .select({ telegramId: telegramUsers.telegramId })
    .from(telegramUsers)
    .where(eq(telegramUsers.telegramId, telegramId));

  if (existing) {
    // Update existing user
    await db
      .update(telegramUsers)
      .set({
        username: username ?? undefined,
        firstName: firstName ?? undefined,
      })
      .where(eq(telegramUsers.telegramId, telegramId));
  } else {
    // Insert new user
    await db.insert(telegramUsers).values({
      telegramId,
      username: username ?? null,
      firstName: firstName ?? null,
    });
  }
}

// Format helpers
export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined) return "-";
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

export function formatPrice(price: number | null | undefined): string {
  if (price === null || price === undefined) return "-";
  return `$${price.toFixed(2)}`;
}

export function getEmoji(value: number | null | undefined): string {
  if (value === null || value === undefined) return "⚪";
  return value >= 0 ? "🟢" : "🔴";
}

// Generate period selection keyboard
export function getPeriodKeyboard(
  command: string, 
  current: TimePeriod
): InlineKeyboardButton[][] {
  const periods: TimePeriod[] = ["1d", "1w", "1m", "3m"];
  return [
    periods.map((p) => ({
      text: p === current ? `[${p.toUpperCase()}]` : p.toUpperCase(),
      callback_data: `${command}_${p}`,
    })),
  ];
}
