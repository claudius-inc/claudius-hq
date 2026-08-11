-- Storage for the combination explorer.
--
-- TWO TABLES, TWO PURPOSES
--
-- `perp_combo_results` is the LEDGER: every combination a search actually
-- evaluated, with its train and holdout numbers. Small, queryable, and the thing
-- that answers "has this set been tried before". Negative results are kept
-- deliberately — they are what stops the same idea being re-tested each quarter.
--
-- `perp_explorer_panel` is the PAYLOAD: a quantized, downsampled slice of the
-- research panel that the browser scores against directly, so a reader can tick
-- signals and see the result without a round trip. It is chunked because a
-- single ~1 MB row is close enough to row-size limits to be worth not betting
-- on; the API route concatenates the chunks in order.
--
-- WHY THE PAYLOAD CAN BE QUANTIZED AT ALL
--
-- The browser never sees raw indicator values. It sees the CROSS-SECTIONAL
-- RANK-Z of each signal, which is what combination scoring consumes: a
-- combination is an average of rank columns, then a sort. Rank-z lives in
-- [-1, 1], so one signed byte carries it to a resolution of 1/127 — far finer
-- than the ranking itself is meaningful at. That is the difference between a
-- 35 MB payload and a 1 MB one.
--
-- The panel is a research artifact, not a source of truth for the daily report:
-- it is downsampled, so its numbers are indicative. The page says so.

CREATE TABLE IF NOT EXISTS `perp_combo_results` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `run_date` text NOT NULL,
  `horizon` integer NOT NULL,
  `objective` text NOT NULL,
  -- Pipe-joined signal names, sorted, so a set has one canonical spelling.
  `signals` text NOT NULL,
  `k` integer NOT NULL,
  -- Independent bets, not indicator count: two signals at 0.9 correlation are
  -- k=2 and effective rank ~1.1.
  `effective_rank` real,
  `train_value` real,
  `holdout_value` real,
  `holdout_ic` real,
  `holdout_ic_t` real,
  `holdout_capture` real,
  `holdout_basket` real,
  `holdout_basket_t` real,
  `holdout_abs` real,
  `baseline_abs` real,
  `n_timestamps` integer,
  -- 1 for the best set at its k; the row a frontier chart plots.
  `is_frontier` integer DEFAULT 0,
  -- 1 for the set the run actually selected, after choosing k on train.
  `is_champion` integer DEFAULT 0,
  `created_at` text DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS `idx_combo_results_unique`
  ON `perp_combo_results` (`run_date`, `horizon`, `objective`, `signals`);
CREATE INDEX IF NOT EXISTS `idx_combo_results_lookup`
  ON `perp_combo_results` (`horizon`, `objective`, `run_date`);

CREATE TABLE IF NOT EXISTS `perp_explorer_panel` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `run_date` text NOT NULL,
  `horizon` integer NOT NULL,
  `chunk_index` integer NOT NULL,
  `chunk` blob NOT NULL,
  `created_at` text DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS `idx_explorer_panel_chunk`
  ON `perp_explorer_panel` (`run_date`, `horizon`, `chunk_index`);

-- The header describing one payload: which signals, how many rows, what was
-- dropped in downsampling. Separate from the chunks so the API route can answer
-- "what is available" without reading a megabyte.
CREATE TABLE IF NOT EXISTS `perp_explorer_meta` (
  `run_date` text NOT NULL,
  `horizon` integer NOT NULL,
  `header` text NOT NULL,
  `n_chunks` integer NOT NULL,
  `bytes` integer NOT NULL,
  `created_at` text DEFAULT (datetime('now')),
  PRIMARY KEY (`run_date`, `horizon`)
);
