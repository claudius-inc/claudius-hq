-- ============================================================================
-- Migration 0008: rename watchlist_scores → ticker_metrics, normalize tags.
--
-- Two related cleanups in one migration:
--
-- (1) Rename `watchlist_scores` → `ticker_metrics` and drop columns that are
--     either durable per-ticker data (name, market, description) — those now
--     live in `scanner_universe` — or denormalized from `theme_stocks`
--     (theme_ids).
--
-- (2) Replace `stock_tags` (JSON per ticker) and `themes.tags` (JSON per
--     theme) with a normalized `tags` + `ticker_tags` + `theme_tags` model.
--     Tag names are unique and lowercased. Both old storage locations are
--     migrated by JSON_EACH and dropped at the end.
--
-- Run sequentially, in order. Each statement is idempotent where possible
-- (CREATE IF NOT EXISTS, INSERT OR IGNORE).
-- ============================================================================

------------------------------------------------------------------------------
-- Part 1: ticker_metrics rename + column drops
------------------------------------------------------------------------------

ALTER TABLE watchlist_scores RENAME TO ticker_metrics;

ALTER TABLE ticker_metrics DROP COLUMN name;
ALTER TABLE ticker_metrics DROP COLUMN market;
ALTER TABLE ticker_metrics DROP COLUMN theme_ids;
ALTER TABLE ticker_metrics DROP COLUMN description;

------------------------------------------------------------------------------
-- Part 2: normalized tag tables
------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ticker_tags (
  ticker TEXT NOT NULL,
  tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  created_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (ticker, tag_id)
);

CREATE TABLE IF NOT EXISTS theme_tags (
  theme_id INTEGER NOT NULL REFERENCES themes(id) ON DELETE CASCADE,
  tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  created_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (theme_id, tag_id)
);

------------------------------------------------------------------------------
-- Part 3: backfill from JSON storage into normalized tables
--
-- JSON_EACH(stock_tags.tags) iterates the array elements; we lowercase and
-- trim each one, dedupe via INSERT OR IGNORE on the unique name.
------------------------------------------------------------------------------

-- Seed `tags` from stock_tags.tags
INSERT OR IGNORE INTO tags (name)
SELECT DISTINCT LOWER(TRIM(je.value))
FROM stock_tags, JSON_EACH(stock_tags.tags) AS je
WHERE TRIM(je.value) != '';

-- Seed `tags` from themes.tags
INSERT OR IGNORE INTO tags (name)
SELECT DISTINCT LOWER(TRIM(je.value))
FROM themes, JSON_EACH(themes.tags) AS je
WHERE TRIM(je.value) != '';

-- Map stock_tags rows → ticker_tags
INSERT OR IGNORE INTO ticker_tags (ticker, tag_id)
SELECT stock_tags.ticker, tags.id
FROM stock_tags, JSON_EACH(stock_tags.tags) AS je
JOIN tags ON tags.name = LOWER(TRIM(je.value))
WHERE TRIM(je.value) != '';

-- Map themes.tags → theme_tags
INSERT OR IGNORE INTO theme_tags (theme_id, tag_id)
SELECT themes.id, tags.id
FROM themes, JSON_EACH(themes.tags) AS je
JOIN tags ON tags.name = LOWER(TRIM(je.value))
WHERE TRIM(je.value) != '';

------------------------------------------------------------------------------
-- Part 4: drop legacy storage now that data is migrated
------------------------------------------------------------------------------

DROP TABLE stock_tags;
ALTER TABLE themes DROP COLUMN tags;
