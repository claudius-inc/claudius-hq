-- ============================================================================
-- Migration 0010: add `currency` to scanner_universe.
--
-- Captures Yahoo's `quote.currency` at fetch time so the price formatter can
-- disambiguate dual-listings (e.g. IHG.L quotes in USD, not GBp). Nullable
-- for legacy rows; the formatter falls back to a suffix heuristic when null.
-- ============================================================================

ALTER TABLE scanner_universe ADD COLUMN currency TEXT;
