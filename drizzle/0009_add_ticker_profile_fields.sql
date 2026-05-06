-- ============================================================================
-- Migration 0009: add qualitative profile fields to scanner_universe.
--
-- Adds 8 nullable columns + a profile_generated_at timestamp so we can tell
-- "never auto-drafted" from "drafted but cleared by the user". JSON-as-text
-- for the structured columns (revenue_segments + 4 SWOT lists); parsed in
-- app code rather than via Drizzle's mode: "json" to keep libsql happy.
-- ============================================================================

ALTER TABLE scanner_universe ADD COLUMN revenue_model TEXT;
ALTER TABLE scanner_universe ADD COLUMN revenue_segments TEXT;
ALTER TABLE scanner_universe ADD COLUMN cyclicality TEXT;
ALTER TABLE scanner_universe ADD COLUMN tailwinds TEXT;
ALTER TABLE scanner_universe ADD COLUMN headwinds TEXT;
ALTER TABLE scanner_universe ADD COLUMN threats TEXT;
ALTER TABLE scanner_universe ADD COLUMN opportunities TEXT;
ALTER TABLE scanner_universe ADD COLUMN customer_concentration TEXT;
ALTER TABLE scanner_universe ADD COLUMN profile_generated_at TEXT;
