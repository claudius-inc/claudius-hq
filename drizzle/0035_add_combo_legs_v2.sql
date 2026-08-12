-- Two more legs for the composite gate.
--
-- A re-run of the combination search selected
-- `rvol + volSurge + rev6 + fundingAbs + rangeExpansion` (holdout IC 0.085,
-- t = 6.43) over the k=3 set that shipped in 0033 (0.078, t = 5.97). Both new
-- legs are MAGNITUDE signals, so they widen the basis of the gate rather than
-- change what the list is ordered by — the directional claim is still `rev6`
-- alone.
--
-- The size of the set is NOT settled: the inner walk-forward scores that choose
-- k were 0.0738 for k=3 and 0.0739 for k=5, a gap far below the run-to-run
-- noise. Both columns are stored so a later study can compare the two versions
-- on the same rows instead of re-deriving them.
--
-- Stored for the same reason as every other display column: the web app reads
-- only the database, so anything computed at screen time and not written here
-- is lost.

ALTER TABLE `perp_convergence_picks` ADD COLUMN `vol_surge` real;
ALTER TABLE `perp_convergence_picks` ADD COLUMN `range_expansion` real;
