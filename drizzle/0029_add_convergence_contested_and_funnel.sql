-- Follow-up to 0028, closing three gaps found in review.
--
-- 1. `contested` — a name whose LONG and SHORT scores both clear the threshold
--    at the SAME value. These were previously not stored at all: the screen
--    pushed a side only when one strictly beat the other, so level ties fell
--    through and vanished. Measured at 1.3% of all scored bars, which is 5.6%
--    of long-qualifying observations. Deleting them contradicted 0028's own
--    rationale — the un-sent rows are the control group — and made "is a
--    contested signal worth less?" permanently untestable. They are recorded
--    and never reported.
--
-- 2. `liquidity_pctl` — within-category percentile of traded value, the new
--    tie-break. Stored because it is now part of how the reported set was
--    chosen, and a study that cannot see the selection rule cannot correct for
--    it. Ranking on RAW traded value handed 7 of 8 long slots to equity perps
--    from only 38 of 133 qualifiers: equity perps move as a correlated bloc,
--    so they reach a score of 3 together and a volume sort sweeps the tie group.
--
-- 3. Funnel columns splitting what `scorable_n` used to conflate. "Returned no
--    bars" (venue outage) and "returned too few bars" (contract listed three
--    weeks ago) are different failures with different fixes, and neither was
--    distinguishable from the other. `stale_n` counts symbols dropped by the
--    new per-symbol freshness gate — previously freshness was a max across the
--    whole universe, so one healthy symbol masked every halted one.

ALTER TABLE `perp_convergence_picks` ADD COLUMN `contested` integer NOT NULL DEFAULT 0;
ALTER TABLE `perp_convergence_picks` ADD COLUMN `liquidity_pctl` real;

-- Partial index: contested rows are a small minority and are only ever queried
-- as a cohort, so indexing just them keeps it cheap.
CREATE INDEX IF NOT EXISTS `idx_perp_conv_picks_contested`
	ON `perp_convergence_picks` (`run_date`) WHERE `contested` = 1;

ALTER TABLE `perp_convergence_runs` ADD COLUMN `no_bars_n` integer;
ALTER TABLE `perp_convergence_runs` ADD COLUMN `too_short_n` integer;
ALTER TABLE `perp_convergence_runs` ADD COLUMN `stale_n` integer;
ALTER TABLE `perp_convergence_runs` ADD COLUMN `contested_n` integer;
