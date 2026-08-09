-- Expectation memory: distinguish WHEN the condition was met from WHEN we
-- graded it — see docs/daily-note-v2-spec.md §F.
--
-- `resolved_date` is the session whose data decided the bet, which is the honest
-- answer to "when did gold cross 4300". It is NOT the same as the run that
-- noticed. Nightly the two coincide; after an outage the backfill grades a touch
-- that happened days earlier, and the LEDGER line — which shows what settled in
-- THIS session — needs the second date to find it.
ALTER TABLE note_expectations ADD COLUMN settled_at TEXT;
