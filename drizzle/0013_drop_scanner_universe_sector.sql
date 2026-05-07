-- ============================================================================
-- Migration 0013: drop `sector` from scanner_universe.
--
-- The user-facing `sector` field on the Add/Edit Ticker modals was largely
-- cosmetic: scoring uses Yahoo's live `assetProfile.sector` (read fresh per
-- scan via enhanced-metrics.ts), tags + themes already cover user-curated
-- categorization, and the column was usually null in practice because
-- yahoo-finance2's `quote()` rarely returns sector for non-US listings.
-- Removing the field + column simplifies the modal and removes a no-op input.
-- ============================================================================

ALTER TABLE scanner_universe DROP COLUMN sector;
