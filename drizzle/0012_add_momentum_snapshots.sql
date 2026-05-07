-- Daily snapshots of ticker momentum scores, used to compute
-- day-over-day momentum gainers/losers.
CREATE TABLE IF NOT EXISTS momentum_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticker TEXT NOT NULL,
  momentum_score REAL,
  technical_score REAL,
  snapshot_date TEXT NOT NULL,  -- YYYY-MM-DD
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_momentum_snapshots_ticker_date ON momentum_snapshots(ticker, snapshot_date);
CREATE INDEX IF NOT EXISTS idx_momentum_snapshots_date ON momentum_snapshots(snapshot_date);
