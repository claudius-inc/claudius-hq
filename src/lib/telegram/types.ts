// Telegram Bot Types

export interface TelegramUpdate {
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

export type TimePeriod = "1d" | "1w" | "1m" | "3m";

export interface InlineKeyboardButton {
  text: string;
  callback_data: string;
}

export interface QuoteResult {
  regularMarketPrice?: number;
  regularMarketChange?: number;
  regularMarketChangePercent?: number;
  shortName?: string;
}

export interface ThemePerformanceData {
  name: string;
  performance: number | null;
  topGainers: Array<{ ticker: string; perf: number }>;
}

export interface ThemesResult {
  text: string;
  keyboard: InlineKeyboardButton[][];
}

export interface SectorsResult {
  text: string;
  keyboard: InlineKeyboardButton[][];
}

// Whitelist of allowed Telegram user IDs
export const ALLOWED_USER_IDS = [
  357112696, // Mr Z (@manapixels)
];
