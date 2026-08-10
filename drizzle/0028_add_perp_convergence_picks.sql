-- Daily convergence screen over Binance perps, replacing the crypto-movers and
-- momentum-gainers pick tables as the source of new report records.
--
-- WHY EVERY CANDIDATE IS STORED, NOT JUST THE SENT ONES
--
-- The convergence count is an UNVALIDATED ranking. A backtest over ~250 days of
-- 4h bars across 620 perps found its information coefficient significantly
-- negative at 1 and 3 days, and no individual factor significantly positive in
-- its intended direction. The screen still ships because the consolidation is
-- worth having and the ranking is a hypothesis — but a hypothesis is only
-- testable if the rows that were NOT sent are kept too. `reported = 0` rows are
-- the control group; without them, any later study is fitted on data already
-- filtered by the thing it is trying to evaluate.
--
-- `factors` stores the five booleans as JSON rather than five columns. The
-- factor SET is what a later study needs (which combinations pay), and MCD's
-- factor list is versioned upstream in the Pine source — a schema change per
-- indicator revision would be a migration treadmill for data nothing joins on.

CREATE TABLE `perp_convergence_picks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`run_date` text NOT NULL,               -- YYYY-MM-DD
	`venue` text NOT NULL,                  -- 'binance' | 'hyperliquid'
	`symbol` text NOT NULL,                 -- venue-native, e.g. 'SPCXUSDT'
	`base` text NOT NULL,                   -- display base, e.g. 'SPCX'
	`category` text NOT NULL,               -- crypto | equity | premarket | commodity | index
	`side` text NOT NULL,                   -- long | short
	`rank` integer,
	`reported` integer NOT NULL DEFAULT 0,  -- 1 = made the sent top N for its side
	`score` integer NOT NULL,
	`max_score` integer NOT NULL,
	`opposing_score` integer,               -- the other direction's count
	`factors` text,                         -- JSON {trend,pullback,support,proximity,vsa}
	`fresh_flag` integer DEFAULT 0,         -- 1 = threshold first crossed on this bar
	-- Forward-return anchor. This is the CLOSE of the last completed 4h bar,
	-- which is the price the score was computed from — not the live price at
	-- send time, so a pick's measured return matches the bar it was chosen on.
	`price` real,
	`rsi` real,
	`change_pct` real,                      -- move over the trailing 30 bars
	`avg_quote_vol` real,                   -- mean USDT traded per 4h bar
	`as_of` text,                           -- ISO close time of the scored bar
	`created_at` text DEFAULT (datetime('now'))
);

-- One row per (symbol, side, day): a same-day re-run replaces rather than
-- duplicates. Side is in the key because a name can legitimately appear on
-- different sides on different days.
CREATE UNIQUE INDEX `idx_perp_conv_picks_symbol_side_date`
	ON `perp_convergence_picks` (`symbol`,`side`,`run_date`);
CREATE INDEX `idx_perp_conv_picks_date` ON `perp_convergence_picks` (`run_date`);
CREATE INDEX `idx_perp_conv_picks_reported` ON `perp_convergence_picks` (`reported`,`run_date`);

-- Funnel counts per run. Without these, an empty report is indistinguishable
-- from a broken fetch, and the liquidity and score gates cannot be tuned.
CREATE TABLE `perp_convergence_runs` (
	`run_date` text PRIMARY KEY NOT NULL,
	`venue` text NOT NULL,
	`interval` text NOT NULL,
	`universe_n` integer,
	`with_bars_n` integer,
	`scorable_n` integer,                   -- cleared the MCD warmup
	`liquid_n` integer,                     -- cleared the traded-value floor
	`qualified_n` integer,                  -- cleared the score threshold
	`long_n` integer,
	`short_n` integer,
	`as_of` text,
	`created_at` text DEFAULT (datetime('now'))
);
