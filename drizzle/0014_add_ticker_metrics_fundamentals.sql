-- ============================================================================
-- Migration 0014: persist fundamentals on ticker_metrics.
--
-- The watchlist scanner already classifies/scores each ticker against Yahoo
-- fundamentals at scan time, but only price + momentum/technical scores were
-- being persisted. Add the four most commonly-referenced raw metrics so the
-- UI can show them without an extra Yahoo round-trip on every render.
--
-- Units:
--   - market_cap: raw dollar amount (Yahoo returns it this way).
--   - trailing_pe / forward_pe: raw multiples.
--   - debt_to_equity: stored as a decimal (Yahoo returns a percent that is
--     divided by 100 at write time, mirroring yahoo-fetcher.ts:373-375).
--
-- All four nullable — Yahoo coverage is patchy for non-US small/mid caps.
-- ============================================================================

ALTER TABLE ticker_metrics ADD COLUMN market_cap REAL;
ALTER TABLE ticker_metrics ADD COLUMN trailing_pe REAL;
ALTER TABLE ticker_metrics ADD COLUMN forward_pe REAL;
ALTER TABLE ticker_metrics ADD COLUMN debt_to_equity REAL;
