-- Daily note v2, step H0 — see docs/daily-note-v2-spec.md.
--
-- 1. daily_notes.prose
--    The pipeline built the note's prose, rendered it into HTML, then threw it
--    away. Nothing could quote what we actually wrote, which blocks both the
--    weekly wrap's "we said X, then Y happened" juxtaposition and any later
--    review. Store the validated NoteProse JSON alongside the facts.
--
-- 2. sp500_constituents.sector_weight
--    The seed already downloads each sector SPDR's holdings file, which carries
--    that fund's own Weight column, and discards it. SPY weight is NOT a
--    substitute: the sector SPDRs cap mega-caps for diversification, so a
--    within-sector share derived from SPY is wrong for exactly the largest
--    names. Needed for the ex-subject sector move and sector contribution.

ALTER TABLE daily_notes ADD COLUMN prose TEXT;

ALTER TABLE sp500_constituents ADD COLUMN sector_weight REAL;
