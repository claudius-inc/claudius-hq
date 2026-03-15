-- ============================================================================
-- Gold Analysis: Add cycle phase and catalysts columns
-- Migration: add_gold_cycle_catalysts
-- Date: 2026-03-15
-- ============================================================================

ALTER TABLE gold_analysis ADD COLUMN cycle_phase INTEGER DEFAULT 3;
ALTER TABLE gold_analysis ADD COLUMN catalysts TEXT;
