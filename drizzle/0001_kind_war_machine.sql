CREATE TABLE `acp_activities` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`type` text NOT NULL,
	`job_id` text,
	`offering` text,
	`counterparty` text,
	`amount` real,
	`details` text,
	`outcome` text,
	`created_at` text DEFAULT (datetime('now'))
);
--> statement-breakpoint
CREATE TABLE `acp_epoch_stats` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`epoch_number` integer NOT NULL,
	`start_date` text,
	`end_date` text,
	`rank` integer,
	`revenue` real,
	`jobs_completed` integer,
	`agent_score` real,
	`estimated_reward` real,
	`created_at` text DEFAULT (datetime('now'))
);
--> statement-breakpoint
CREATE TABLE `acp_offerings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`price` real NOT NULL,
	`category` text,
	`is_active` integer DEFAULT 1,
	`job_count` integer DEFAULT 0,
	`total_revenue` real DEFAULT 0,
	`last_job_at` text,
	`created_at` text DEFAULT (datetime('now')),
	`updated_at` text DEFAULT (datetime('now'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `acp_offerings_name_unique` ON `acp_offerings` (`name`);--> statement-breakpoint
CREATE TABLE `acp_wallet_snapshots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`usdc_balance` real,
	`eth_balance` real,
	`cbbtc_balance` real,
	`cbbtc_value_usd` real,
	`total_value_usd` real,
	`snapshot_at` text DEFAULT (datetime('now'))
);
--> statement-breakpoint
CREATE TABLE `analyst_calls` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`analyst_id` integer,
	`ticker` text NOT NULL,
	`action` text NOT NULL,
	`price_target` real,
	`price_at_call` real,
	`current_price` real,
	`call_date` text NOT NULL,
	`notes` text,
	`outcome` text,
	`created_at` text DEFAULT (datetime('now')),
	FOREIGN KEY (`analyst_id`) REFERENCES `analysts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `analysts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`firm` text NOT NULL,
	`specialty` text,
	`success_rate` real,
	`avg_return` real,
	`notes` text,
	`created_at` text DEFAULT (datetime('now')),
	`updated_at` text DEFAULT (datetime('now'))
);
--> statement-breakpoint
CREATE TABLE `congress_trades` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`member_name` text NOT NULL,
	`party` text,
	`state` text,
	`chamber` text,
	`ticker` text NOT NULL,
	`transaction_type` text NOT NULL,
	`amount_range` text,
	`transaction_date` text NOT NULL,
	`filed_date` text,
	`source_id` text,
	`created_at` text DEFAULT (datetime('now'))
);
--> statement-breakpoint
CREATE TABLE `darkpool_data` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`week_ending` text NOT NULL,
	`ticker` text,
	`ats_volume` real NOT NULL,
	`total_volume` real,
	`ats_percent` real,
	`issue_type` text,
	`created_at` text DEFAULT (datetime('now'))
);
--> statement-breakpoint
CREATE TABLE `gold_analysis` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`current_price` real,
	`ath` real,
	`ath_date` text,
	`key_levels` text,
	`scenarios` text,
	`thesis_notes` text,
	`updated_at` text DEFAULT (datetime('now'))
);
--> statement-breakpoint
CREATE TABLE `gold_flows` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`gld_shares_outstanding` real,
	`gld_nav` real,
	`estimated_flow_usd` real,
	`global_etf_flow_usd` real,
	`central_bank_tonnes` real,
	`source` text,
	`created_at` text DEFAULT (datetime('now'))
);
--> statement-breakpoint
CREATE TABLE `insider_trades` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`company` text NOT NULL,
	`ticker` text NOT NULL,
	`insider_name` text NOT NULL,
	`title` text,
	`transaction_type` text NOT NULL,
	`shares` real,
	`price` real,
	`value` real,
	`transaction_date` text NOT NULL,
	`filed_date` text,
	`source_id` text,
	`created_at` text DEFAULT (datetime('now'))
);
--> statement-breakpoint
CREATE TABLE `macro_insights` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`insights` text NOT NULL,
	`indicator_snapshot` text,
	`generated_at` text DEFAULT (datetime('now'))
);
--> statement-breakpoint
CREATE TABLE `market_reference` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`symbol` text NOT NULL,
	`name` text NOT NULL,
	`yahoo_ticker` text,
	`ath_price` real,
	`ath_date` text,
	`current_price` real,
	`key_thresholds` text,
	`notes` text,
	`updated_at` text DEFAULT (datetime('now'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `market_reference_symbol_unique` ON `market_reference` (`symbol`);--> statement-breakpoint
CREATE TABLE `stock_scans` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`scan_type` text NOT NULL,
	`scanned_at` text DEFAULT (datetime('now')),
	`results` text NOT NULL,
	`summary` text,
	`stock_count` integer DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE `trade_journal` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ticker` text NOT NULL,
	`action` text NOT NULL,
	`price` real NOT NULL,
	`shares` real,
	`date` text NOT NULL,
	`thesis` text NOT NULL,
	`catalysts` text,
	`invalidators` text,
	`outcome` text DEFAULT 'open',
	`exit_price` real,
	`exit_date` text,
	`lessons_learned` text,
	`emotional_state` text,
	`tags` text DEFAULT '[]',
	`created_at` text DEFAULT (datetime('now')),
	`updated_at` text DEFAULT (datetime('now'))
);
