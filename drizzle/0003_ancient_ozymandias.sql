CREATE TABLE `acp_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`offering` text NOT NULL,
	`buyer` text,
	`amount` real,
	`input` text,
	`status` text DEFAULT 'pending',
	`result` text,
	`error` text,
	`started_at` text,
	`completed_at` text,
	`execution_ms` integer,
	`created_at` text DEFAULT (datetime('now'))
);
