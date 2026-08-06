-- Screen pick logging + turnover column.
--
-- Both the stock and crypto reports previously selected tickers and sent them
-- to Telegram without recording what was picked. That made the screens
-- unfalsifiable: forward performance could only be reconstructed by scraping
-- GitHub Actions logs (which expire after 90 days), and the crypto screen was
-- not recoverable at all because it never logged its picks.
--
-- These tables persist every candidate so forward returns become a query.

CREATE TABLE `momentum_report_picks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ticker` text NOT NULL,
	`report_date` text NOT NULL,
	`rank` integer,
	`momentum_score` real,
	`technical_score` real,
	`momentum_delta` real,
	`price` real,
	`currency` text,
	`price_change_1d` real,
	`price_change_1w` real,
	`price_change_1m` real,
	`created_at` text DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX `idx_momentum_report_picks_ticker_date` ON `momentum_report_picks` (`ticker`,`report_date`);

CREATE INDEX `idx_momentum_report_picks_date` ON `momentum_report_picks` (`report_date`);

-- One row per crypto CANDIDATE per day (not just the reported top 10), so the
-- TOP_N cutoff itself is evaluable. `reported` flags the ones that were sent.
-- Keyed on CoinGecko `coin_id` because ticker symbols collide in the top 1000.
CREATE TABLE `crypto_screen_picks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`coin_id` text NOT NULL,
	`run_date` text NOT NULL,
	`sym` text,
	`name` text,
	`rank` integer,
	`tag` text,
	`reported` integer DEFAULT 0,
	`score` real,
	`price` real,
	`mcap` real,
	`vol` real,
	`fdv` real,
	`p24` real,
	`p7` real,
	`p30` real,
	`athc` real,
	`last24_share` real,
	`rising_frac` real,
	`dd_from_high` real,
	`btc_p7` real,
	`btc_p30` real,
	`created_at` text DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX `idx_crypto_screen_picks_coin_date` ON `crypto_screen_picks` (`coin_id`,`run_date`);

CREATE INDEX `idx_crypto_screen_picks_date` ON `crypto_screen_picks` (`run_date`);

-- Daily close for the full top-1000 pull. Costs no extra API calls (same
-- response the screen already fetches) and turns forward-return measurement
-- into a self-join instead of a backfill job.
CREATE TABLE `crypto_prices_daily` (
	`coin_id` text NOT NULL,
	`date` text NOT NULL,
	`price` real,
	`mcap` real,
	`vol` real,
	PRIMARY KEY(`coin_id`, `date`)
);

CREATE INDEX `idx_crypto_prices_daily_date` ON `crypto_prices_daily` (`date`);

-- Funnel counts per run. Without these the screen constants cannot be tuned:
-- an empty report is indistinguishable from a broken fetch.
CREATE TABLE `crypto_screen_runs` (
	`run_date` text PRIMARY KEY NOT NULL,
	`universe_n` integer,
	`pass_m_n` integer,
	`pass_g_n` integer,
	`union_n` integer,
	`reported_n` integer,
	`btc_p24` real,
	`btc_p7` real,
	`btc_p30` real,
	`created_at` text DEFAULT (datetime('now'))
);

-- 20-day average dollar volume. `avgVol20d` was already computed on every scan
-- (watchlist-indicators.ts) and then discarded before the DB write, so a real
-- liquidity gate was impossible despite the data being in hand.
ALTER TABLE `ticker_metrics` ADD COLUMN `avg_dollar_vol_20d` real;
