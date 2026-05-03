-- Watchlist Scores: one row per ticker tracked in any theme.
-- Replaces the universe-wide stock_scans table for the /markets/scanner/stocks page.
-- stock_scans is intentionally NOT dropped here; it is removed in the cleanup PR
-- after the new system is verified stable.
CREATE TABLE IF NOT EXISTS watchlist_scores (
  ticker            TEXT PRIMARY KEY,
  name              TEXT NOT NULL,
  market            TEXT NOT NULL,            -- 'US' | 'SGX' | 'HK' | 'JP'
  price             REAL,
  momentum_score    REAL,                     -- 0-100, NULL if data_quality='failed'
  technical_score   REAL,                     -- 0-100, NULL if data_quality='failed'
  price_change_1w   REAL,
  price_change_1m   REAL,
  price_change_3m   REAL,
  theme_ids         TEXT NOT NULL,            -- JSON array of integer theme IDs
  data_quality      TEXT NOT NULL,            -- 'ok' | 'partial' | 'failed'
  computed_at       TEXT NOT NULL             -- ISO timestamp
);

CREATE INDEX IF NOT EXISTS idx_watchlist_scores_market ON watchlist_scores(market);
