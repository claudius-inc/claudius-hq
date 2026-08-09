-- Weekly wrap ("The Week") — see docs/daily-note-v2-spec.md §C.
--
-- Built from the daily_notes rows the week produced, plus a small number of
-- fresh cross-checks. Keyed by the LAST SESSION of the week rather than "the
-- Friday": on a Good-Friday week the week ends Thursday, and `daily_notes.date`
-- only exists for sessions that passed the trading-session gate, which makes it
-- the de-facto trading calendar.
--
-- `week_start` records the anchor the week is measured FROM (the last session
-- before this week), so a reader can always tell what span the numbers cover —
-- and `sessions` records how many days actually contributed, so a phrase like
-- "negative 4 of 5 sessions" can state its real denominator.

CREATE TABLE IF NOT EXISTS weekly_notes (
  week_end TEXT PRIMARY KEY,           -- YYYY-MM-DD, last session in the week
  week_start TEXT NOT NULL,            -- the anchor session it is measured from
  sessions INTEGER NOT NULL,           -- daily notes contributing to this wrap
  facts TEXT NOT NULL,                 -- JSON: WeeklyFacts
  push_html TEXT NOT NULL,
  web_body TEXT NOT NULL,
  telegram_message_id INTEGER,
  created_at TEXT DEFAULT (datetime('now'))
);
