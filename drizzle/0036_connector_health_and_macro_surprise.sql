-- Connector health for the daily-note pipeline, and the macro surprise archive.
-- See docs/implementation-plans/2026-08-13-tape-accuracy.md Parts D and E.

CREATE TABLE IF NOT EXISTS `connector_health` (
	`name` text PRIMARY KEY NOT NULL,
	`last_status` text NOT NULL,
	`streak_count` integer DEFAULT 0 NOT NULL,
	`last_run_date` text NOT NULL,
	`last_alerted_date` text,
	`last_detail` text,
	`updated_at` text DEFAULT (datetime('now'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `macro_surprise_history` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`release_id` integer NOT NULL,
	`series_id` text NOT NULL,
	`release_date` text NOT NULL,
	`consensus` real,
	`actual` real NOT NULL,
	`prior` real,
	`surprise` real,
	`spy_pct` real,
	`tnx_bp` real,
	`vix_chg` real,
	`measured_as` text DEFAULT 'close-to-close' NOT NULL,
	`consensus_captured` text DEFAULT 'same-day' NOT NULL,
	`created_at` text DEFAULT (datetime('now'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `macro_surprise_unique` ON `macro_surprise_history` (`release_id`,`series_id`,`release_date`);
