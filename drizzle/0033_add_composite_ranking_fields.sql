-- The composite ranking key, and the three legs it is built from.
--
-- The screen's ordering changed from |OI change| percentile to a validated
-- composite: gate on relative volume and absolute funding, then order the
-- survivors by 1-day reversal. A search over ~4,700 combinations on 500 days of
-- 4h bars put this set's holdout information coefficient at 0.078 (t = 5.97,
-- procedure-level bootstrap p = 0.005), against -0.027 for the screen's own
-- weighted convergence score on the same rows.
--
-- All four are stored, not just the score, for the same reason `vol_pctl` and
-- `oi_change_pct` are: the web app reads only the database (Binance answers 451
-- to datacenter IP ranges), so anything computed at screen time and not written
-- here is lost. A page that cannot show the legs cannot explain its own order.
--
-- `combo_gated` is the magnitude filter's verdict. It is a separate column
-- rather than being folded into the score because "did not clear the gate" and
-- "cleared the gate but ranked last" are different states, and a later study
-- needs to tell them apart.

ALTER TABLE `perp_convergence_picks` ADD COLUMN `rvol` real;
ALTER TABLE `perp_convergence_picks` ADD COLUMN `rev6` real;
ALTER TABLE `perp_convergence_picks` ADD COLUMN `funding_abs` real;
ALTER TABLE `perp_convergence_picks` ADD COLUMN `combo_score` real;
ALTER TABLE `perp_convergence_picks` ADD COLUMN `combo_gated` integer DEFAULT 0;
