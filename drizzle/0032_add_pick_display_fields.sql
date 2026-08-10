-- Columns the shortlist page needs, which were computed but never stored.
--
-- The web app now reads ONLY the database: Binance answers HTTP 451 to
-- datacenter IP ranges, so nothing rendered on Vercel can call the venue. That
-- makes "computed at screen time but not persisted" equivalent to "lost" — the
-- page was rendering OI, quarterly VWAP distance and the volatility percentile
-- as em-dashes because the values existed only in the pipeline's memory.
--
-- `oi_change_pct` matters most of the three: open interest is the RANKING key
-- (it measured 1.89x random at containing big movers, against the convergence
-- count's 0.93x), so a page that cannot show it cannot explain its own order.

ALTER TABLE `perp_convergence_picks` ADD COLUMN `vol_pctl` real;
ALTER TABLE `perp_convergence_picks` ADD COLUMN `vwap_dist_pct` real;
ALTER TABLE `perp_convergence_picks` ADD COLUMN `qvwap` real;
ALTER TABLE `perp_convergence_picks` ADD COLUMN `oi_change_pct` real;
ALTER TABLE `perp_convergence_picks` ADD COLUMN `oi_pctl` real;
