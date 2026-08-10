-- sp500_constituents.first_seen — see docs/daily-note-v2-spec.md §D trap 4.
--
-- The constituent refresh is an upsert + prune, so every run overwrites
-- updated_at and deletes departed names outright. Membership history is
-- therefore destroyed irreversibly on each refresh and cannot be reconstructed
-- from the stored rows afterwards.
--
-- first_seen is a one-way ratchet: written on INSERT, never touched on
-- conflict. Backfilled rows all carry today's timestamp, which is honest — it
-- is the first refresh that recorded them, not a claim about index history.
--
-- This does NOT license aggregate claims over past membership. Those stay
-- banned: the pruned names are gone, so any such aggregate is survivorship-
-- shaped. Per-name claims were always fine and remain so.

ALTER TABLE sp500_constituents ADD COLUMN first_seen TEXT;

UPDATE sp500_constituents SET first_seen = datetime('now') WHERE first_seen IS NULL;
