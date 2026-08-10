-- Candles for the reported shortlist, stored at screen time.
--
-- WHY THE PAGE MUST NOT CALL THE VENUE
--
-- Binance answers HTTP 451 to restricted regions: "Service unavailable from a
-- restricted location according to 'b. Eligibility'". That includes US-hosted
-- serverless runtimes, which is where this app deploys by default -- so a page
-- that fetches bars server-side at render time works locally and fails in
-- production, with no code path at fault. The same block killed the first
-- GitHub Actions run of the report workflow at its very first call.
--
-- Moving the project to a permitted region would fix it, but it drags every
-- other route's latency along with it and does nothing about the pipeline,
-- which exceeds the Hobby plan's 60s function ceiling anyway.
--
-- So the screen -- which already runs from a permitted region -- writes the
-- candles it used, and the page reads only the database. The web app then has
-- no geographic dependency at all, on any plan, in any region.
--
-- Bars are a JSON array of [openTimeMs, o, h, l, c, v], the same compact shape
-- the chart component consumes, so the page does no reshaping. One row per
-- symbol per run: ~16 rows a day at ~180 bars each.

CREATE TABLE IF NOT EXISTS `perp_chart_bars` (
	`run_date` text NOT NULL,        -- YYYY-MM-DD, matches perp_convergence_picks
	`symbol` text NOT NULL,
	`interval` text NOT NULL,        -- '4h'
	`bars` text NOT NULL,            -- JSON [[t,o,h,l,c,v], ...] oldest first
	`qvwap` real,                    -- quarterly anchored VWAP at write time
	`created_at` text DEFAULT (datetime('now')),
	PRIMARY KEY (`run_date`, `symbol`)
);

CREATE INDEX IF NOT EXISTS `idx_perp_chart_bars_date` ON `perp_chart_bars` (`run_date`);
