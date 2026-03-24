-- Scanner Universe table for managing tickers to scan
CREATE TABLE IF NOT EXISTS scanner_universe (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticker TEXT NOT NULL UNIQUE,
  market TEXT NOT NULL,
  name TEXT,
  sector TEXT,
  source TEXT DEFAULT 'curated',
  enabled INTEGER DEFAULT 1,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Index for efficient filtering by market and enabled status
CREATE INDEX IF NOT EXISTS idx_scanner_universe_market ON scanner_universe(market);
CREATE INDEX IF NOT EXISTS idx_scanner_universe_enabled ON scanner_universe(enabled);
