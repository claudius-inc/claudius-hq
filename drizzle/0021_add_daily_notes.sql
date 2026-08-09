-- Daily Market Note ("The Tape") — see docs/daily-note-spec.md §6.
--
-- `daily_notes`: one generated note per US market date (America/New_York).
--   `facts` is the StructuredFacts JSON (value/source/asOf per field), `web_body`
--   is what the archive page renders, and `telegram_message_id` lets a same-day
--   re-run edit the existing channel message in place (idempotent per date).
--
-- `note_spotlight_config`: which sectors get the expanded deep-dive block. Seeded
--   with XLE + GOLD enabled (the defaults); all others off.

CREATE TABLE IF NOT EXISTS daily_notes (
  date TEXT PRIMARY KEY,                 -- YYYY-MM-DD, US market date
  facts TEXT NOT NULL,                   -- JSON: StructuredFacts
  push_html TEXT NOT NULL,
  web_body TEXT NOT NULL,
  telegram_message_id INTEGER,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS note_spotlight_config (
  sector TEXT PRIMARY KEY,              -- XLK|XLF|XLY|XLC|XLV|XLI|XLP|XLE|XLB|XLRE|XLU|GOLD
  enabled INTEGER NOT NULL DEFAULT 0,   -- boolean (0/1)
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Seed the 12 spotlight rows; XLE + GOLD on by default.
INSERT OR IGNORE INTO note_spotlight_config (sector, enabled) VALUES
  ('XLK', 0), ('XLF', 0), ('XLY', 0), ('XLC', 0), ('XLV', 0), ('XLI', 0),
  ('XLP', 0), ('XLE', 1), ('XLB', 0), ('XLRE', 0), ('XLU', 0), ('GOLD', 1);
