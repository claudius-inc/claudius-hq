-- ============================================================================
-- Stock Daily Prices — materialized cache for theme performance.
-- Migration: add_stock_prices_daily
-- Date: 2026-04-07
--
-- One row per (ticker, date). Past closes are immutable so this is an
-- append-only store. Used by `fetchThemePerformanceAll()` to avoid
-- per-ticker Yahoo chart() calls on every cold cache refresh.
-- ============================================================================

CREATE TABLE IF NOT EXISTS stock_prices_daily (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticker TEXT NOT NULL,
  date TEXT NOT NULL,         -- YYYY-MM-DD
  close REAL NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_stock_prices_daily_ticker_date
  ON stock_prices_daily(ticker, date);

CREATE INDEX IF NOT EXISTS idx_stock_prices_daily_ticker_date_desc
  ON stock_prices_daily(ticker, date DESC);
