-- Underlying daily history for the tradfi perps, and the verified map that
-- says which Yahoo ticker belongs to which contract.
--
-- WHY THIS EXISTS
--
-- The tradfi perp contracts are new: NVDA has ~138 daily bars, SPCX ~82,
-- ANTHROPIC ~77. MCD's SMMA-200 needs 200 bars and wants several hundred more
-- to converge, so on a DAILY timeframe only 2 of 154 tradfi contracts are
-- scorable at all. Their UNDERLYINGS are not new — 116 of them have 1000+ daily
-- bars on Yahoo. Storing that history takes the daily-scorable count from 2 to
-- 127.
--
-- WHAT THIS IS NOT USED FOR
--
-- It does NOT feed the 4h convergence score. The screen runs on 4h bars for
-- every name, crypto and tradfi alike, so the two stay comparable. Daily bars
-- cannot extend a 4h warmup. This history powers a SEPARATE long-term daily
-- trend reading (SMMA 39/100/200) shown next to the 4h score — which is the
-- one thing the 4h view genuinely cannot see, and it is the natural check on a
-- score whose high readings amount to "closing near the 50-bar high".
--
-- Because the two series are never joined, there is no splice, no back-adjusted
-- join ratio, and no fake gap where the perp meets the equity. That was the
-- riskiest part of the original design and this arrangement removes it entirely.
--
-- RAW *AND* ADJUSTED CLOSE ARE BOTH STORED
--
-- Matching labeling.ts and backtest.ts. Adjusted close is retroactively
-- rewritten by every future dividend, so an adjusted-only table silently goes
-- stale; raw-only cannot survive a split. Returns must be computed entirely
-- within the adjusted series — never adj_close / close.
--
-- CURRENCY IS NOT NORMALISED
--
-- Bars are stored in the underlying's own listing currency, and the trend is
-- computed there. Converting a five-year series at one day's FX rate would
-- yield the listing-currency shape anyway, only mislabelled as USD. `currency`
-- records what the values actually are; 'GBp' means pence, not pounds.

CREATE TABLE IF NOT EXISTS `equity_prices_daily` (
	`ticker` text NOT NULL,          -- Yahoo ticker: 'NVDA', '0700.HK', 'GC=F'
	`date` text NOT NULL,            -- YYYY-MM-DD in the EXCHANGE's timezone, not UTC:
	                                 -- a UTC conversion shifts .HK and .KS sessions by a day
	`open` real,
	`high` real,
	`low` real,
	`close` real,                    -- RAW close, listing currency
	`adj_close` real,                -- split- and dividend-adjusted
	`volume` real,
	`currency` text,                 -- 'USD' | 'HKD' | 'KRW' | 'CNY' | 'GBp' (pence)
	`fetched_at` text DEFAULT (datetime('now')),
	PRIMARY KEY (`ticker`, `date`)
);

CREATE INDEX IF NOT EXISTS `idx_equity_prices_daily_date` ON `equity_prices_daily` (`date`);

-- The curated contract -> underlying map, mirrored from
-- src/lib/markets/perp-underlying.ts so the verification job can record drift.
--
-- `status` plus `price_dev_pct` is the falsifiability hook: a daily re-check
-- against Binance's own indexPrice demotes a drifting mapping to 'rejected' so
-- it stops being used. That gate is what catches the ALL -> Allstate class of
-- error, where a wrong mapping resolves cleanly with a plausible price and
-- nothing ever throws.
CREATE TABLE IF NOT EXISTS `perp_underlying_map` (
	`venue` text NOT NULL,
	`symbol` text NOT NULL,          -- 'NVDAUSDT'
	`base` text NOT NULL,
	`yahoo_ticker` text,             -- NULL when status is 'no_underlying' or 'rejected'
	`fx_scale` real,                 -- verification gate only; NOT used for the trend
	`status` text NOT NULL,          -- verified | no_underlying | rejected
	`price_dev_pct` real,            -- last measured deviation vs indexPrice
	`bars_available` integer,        -- daily bars currently stored for yahoo_ticker
	`verified_at` text,
	`note` text,
	PRIMARY KEY (`venue`, `symbol`)
);

CREATE INDEX IF NOT EXISTS `idx_perp_underlying_map_status` ON `perp_underlying_map` (`status`);
