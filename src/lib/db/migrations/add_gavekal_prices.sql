-- ============================================================================
-- Gavekal Historical Price Data
-- Migration: add_gavekal_prices
-- Date: 2026-04-05
-- ============================================================================

CREATE TABLE IF NOT EXISTS gavekal_prices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol TEXT NOT NULL,
  date TEXT NOT NULL,
  close REAL NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_gavekal_prices_symbol_date
  ON gavekal_prices(symbol, date);

CREATE INDEX IF NOT EXISTS idx_gavekal_prices_symbol
  ON gavekal_prices(symbol);
