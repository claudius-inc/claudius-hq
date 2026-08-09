-- Expectation memory — see docs/daily-note-v2-spec.md §F.
--
-- A storable expectation is a tuple created BEFORE its outcome is knowable:
--   subject x metric x comparator x threshold x horizon x baseline.
-- "Gold closes above 4300 within 5 sessions" qualifies. "Narrow leadership
-- dressed as strength" does not, and prose is never parsed for predictions —
-- that path guarantees grading ambiguity.
--
-- Rows are immutable after creation except for the resolution columns. That is
-- deliberate: rewriting the bet is the first door a self-grading system opens,
-- so it is closed by construction rather than by policy. `origin` is restricted
-- to the owner or a NAMED mechanical generator and never the model, because a
-- model that both writes the prose and mints the predictions will mint easy
-- ones. Storing origin also lets hit rates be sliced by it, so a generator that
-- is 95% right is visibly producing tautologies rather than quietly flattering
-- the ledger.
--
-- Every row terminates in exactly one of hit / miss / unresolvable, and
-- unresolvable stays in the denominator as attrition — a rising attrition rate
-- is itself the signal.

CREATE TABLE IF NOT EXISTS note_expectations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  note_date TEXT NOT NULL,             -- the session that registered it
  subject TEXT NOT NULL,               -- GC=F | ^GSPC | SPREAD_2S10S | ...
  metric TEXT NOT NULL,                -- close | spread_bp
  comparator TEXT NOT NULL,            -- touch_above | touch_below | at_horizon_above | at_horizon_below
  threshold REAL NOT NULL,
  baseline_value REAL NOT NULL,        -- the value when it was registered
  baseline_source TEXT NOT NULL,       -- provenance, mirroring Fact<T>
  horizon_sessions INTEGER NOT NULL,
  sessions_elapsed INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'open', -- open | hit | miss | unresolvable
  resolved_date TEXT,
  resolved_value REAL,
  resolved_source TEXT,
  origin TEXT NOT NULL,                -- owner | auto_* — never llm
  created_at TEXT DEFAULT (datetime('now'))
);

-- The daily workflow fires twice per evening. Without this, the second run
-- re-registers the same bet an hour later with more information than the first
-- had. Metric and horizon belong in the key: the same level at 5 and 21
-- sessions are two different bets.
CREATE UNIQUE INDEX IF NOT EXISTS idx_note_expectations_idem
  ON note_expectations (note_date, subject, metric, comparator, threshold, horizon_sessions);

CREATE INDEX IF NOT EXISTS idx_note_expectations_open ON note_expectations (status);
