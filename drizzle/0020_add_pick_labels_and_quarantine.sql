-- Automatic forward-return labelling + data-defect quarantine.
--
-- Picks are already persisted with an entry price and date, so forward returns
-- are computable without any human input. This turns "did the screen work?"
-- into a standing query rather than an archaeology dig through CI logs.
--
-- TWO DESIGN POINTS WORTH KNOWING BEFORE READING THE COLUMNS
--
-- 1. Returns are computed ENTIRELY WITHIN the adjusted series
--    (exit_adj / entry_adj). A k:1 split multiplies both legs by the same
--    factor and cancels, so the label is split-invariant even though
--    production stores a RAW entry price. Never divide exit_adj by entry_raw.
--
-- 2. Anomalies are detected by MEASUREMENT DISAGREEMENT, never by magnitude.
--    A "|5d move| > 60% is suspicious" rule cannot catch splits at all (they
--    cancel, per point 1) and would instead quarantine the genuine big
--    winners — truncating the right tail of a right-skewed distribution and
--    teaching the screen to avoid exactly the names that pay for its many
--    small losers. So: an anomaly is when the raw series and the adjusted
--    series disagree by more than the dividend can explain, or when the
--    stored entry price never traded in its own bar's range.

CREATE TABLE `pick_labels` (
	`source` text NOT NULL,                 -- 'momentum' | 'crypto'
	`pick_id` integer NOT NULL,
	`ticker` text NOT NULL,
	`horizon` integer NOT NULL,             -- trading days (equities), calendar days (crypto)
	`entry_date` text NOT NULL,
	`entry_raw` real,                       -- the stored pick price (raw-close world)
	`entry_adj` real,
	`exit_adj` real,
	`exit_date` text,
	`fwd_pct` real,                         -- 100*(exit_adj/entry_adj - 1), listing currency
	-- Cohort = the same day's candidate set (reported AND not). Measures
	-- selection skill: did the reported picks beat the names we also saw?
	`cohort_n` integer,
	`cohort_mean_pct` real,
	`excess_pct` real,
	-- Universe-relative is stored separately because cohort-relative answers
	-- "beat the 100 names the screen liked", which is NOT "beat the market",
	-- and the cohort composition drifts whenever a gate moves.
	`universe_mean_pct` real,
	`universe_excess_pct` real,
	`status` text NOT NULL DEFAULT 'pending',
	-- pending | labeled | partial_delist | no_data | currency_change | anomaly
	`anomaly_note` text,
	`labeled_at` text,
	PRIMARY KEY(`source`, `pick_id`, `horizon`)
);

CREATE INDEX `idx_pick_labels_due` ON `pick_labels` (`status`,`entry_date`);
CREATE INDEX `idx_pick_labels_slice` ON `pick_labels` (`source`,`horizon`,`entry_date`);
CREATE INDEX `idx_pick_labels_ticker` ON `pick_labels` (`ticker`);

-- Confirmed data defects only. Never magnitude-triggered, so a genuine +80%
-- week can never land a ticker in here.
CREATE TABLE `ticker_quarantine` (
	`ticker` text PRIMARY KEY NOT NULL,
	`reason` text NOT NULL,                 -- split_artifact | stale_feed | delisted | currency_change
	`evidence` text,                        -- JSON: the rows that justified it
	`first_seen` text DEFAULT (datetime('now')),
	`last_seen` text DEFAULT (datetime('now')),
	`expires_at` text                       -- NULL = permanent (delisting); artifacts expire
);

CREATE INDEX `idx_ticker_quarantine_expiry` ON `ticker_quarantine` (`expires_at`);
