-- Drop note_expectations — the v2 §F expectation-memory slice, removed.
--
-- The table, its resolver, the LEDGER renderer and five structural
-- anti-flattery locks were all built and correct. Nothing ever inserted a row:
-- there was no owner-facing way to register a bet and no auto_* generator, so
-- the ledger graded zero expectations across its entire life and structurally
-- could not have graded one.
--
-- An accountability ledger that is permanently empty is worse than no ledger.
-- It occupies the space where a record of our calls would go and quietly
-- implies there is nothing to report, when the truth is that nothing was ever
-- registered. Removing it is the honest state; §1a's "omit rather than assert"
-- applies to the note's own track record too.
--
-- Migrations 0025 and 0026 created and extended this table. They stay in the
-- directory as history; this reverses them.

DROP INDEX IF EXISTS idx_note_expectations_idem;
DROP INDEX IF EXISTS idx_note_expectations_open;
DROP TABLE IF EXISTS note_expectations;
