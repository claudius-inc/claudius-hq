CREATE TABLE `acp_competitor_snapshots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`competitor_id` integer NOT NULL,
	`price` real NOT NULL,
	`jobs_count` integer,
	`description` text,
	`snapshot_at` text DEFAULT (datetime('now')),
	FOREIGN KEY (`competitor_id`) REFERENCES `acp_competitors`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `acp_competitors` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`agent_name` text NOT NULL,
	`agent_wallet` text,
	`offering_name` text NOT NULL,
	`price` real NOT NULL,
	`description` text,
	`category` text,
	`jobs_count` integer DEFAULT 0,
	`total_revenue` real,
	`is_active` integer DEFAULT 1,
	`first_seen` text DEFAULT (datetime('now')),
	`last_checked` text DEFAULT (datetime('now')),
	`notes` text,
	`tags` text,
	`created_at` text DEFAULT (datetime('now')),
	`updated_at` text DEFAULT (datetime('now'))
);
--> statement-breakpoint
CREATE TABLE `acp_decisions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`decision_type` text,
	`offering` text,
	`old_value` text,
	`new_value` text,
	`reasoning` text,
	`outcome` text,
	`created_at` text DEFAULT (datetime('now'))
);
--> statement-breakpoint
CREATE TABLE `acp_marketing` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`channel` text,
	`content` text NOT NULL,
	`target_offering` text,
	`status` text DEFAULT 'draft',
	`scheduled_at` text,
	`posted_at` text,
	`tweet_id` text,
	`engagement_likes` integer DEFAULT 0,
	`engagement_retweets` integer DEFAULT 0,
	`engagement_replies` integer DEFAULT 0,
	`jobs_attributed` integer DEFAULT 0,
	`revenue_attributed` real DEFAULT 0,
	`created_at` text DEFAULT (datetime('now'))
);
--> statement-breakpoint
CREATE TABLE `acp_offering_experiments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`offering_id` integer,
	`name` text NOT NULL,
	`price` real NOT NULL,
	`description` text,
	`hypothesis` text,
	`status` text DEFAULT 'active',
	`start_date` text DEFAULT (datetime('now')),
	`end_date` text,
	`results_summary` text,
	`control_offering_id` integer,
	`variant_label` text,
	`created_at` text DEFAULT (datetime('now')),
	`updated_at` text DEFAULT (datetime('now')),
	FOREIGN KEY (`offering_id`) REFERENCES `acp_offerings`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `acp_offering_metrics` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`offering_id` integer NOT NULL,
	`date` text NOT NULL,
	`jobs_count` integer DEFAULT 0,
	`revenue` real DEFAULT 0,
	`unique_buyers` integer DEFAULT 0,
	`views` integer DEFAULT 0,
	`conversion_rate` real,
	`avg_completion_time_ms` integer,
	`failure_count` integer DEFAULT 0,
	`created_at` text DEFAULT (datetime('now')),
	FOREIGN KEY (`offering_id`) REFERENCES `acp_offerings`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `acp_price_experiments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`offering_id` integer NOT NULL,
	`old_price` real NOT NULL,
	`new_price` real NOT NULL,
	`changed_at` text DEFAULT (datetime('now')),
	`reason` text,
	`jobs_before_7d` integer,
	`jobs_after_7d` integer,
	`revenue_before_7d` real,
	`revenue_after_7d` real,
	`revenue_delta` real,
	`conversion_before` real,
	`conversion_after` real,
	`status` text DEFAULT 'measuring',
	`evaluation_date` text,
	`notes` text,
	`created_at` text DEFAULT (datetime('now')),
	FOREIGN KEY (`offering_id`) REFERENCES `acp_offerings`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `acp_state` (
	`id` integer PRIMARY KEY NOT NULL,
	`current_pillar` text DEFAULT 'quality' NOT NULL,
	`current_epoch` integer,
	`epoch_start` text,
	`epoch_end` text,
	`jobs_this_epoch` integer DEFAULT 0,
	`revenue_this_epoch` real DEFAULT 0,
	`target_jobs` integer,
	`target_revenue` real,
	`target_rank` integer,
	`server_running` integer DEFAULT 1,
	`server_pid` integer,
	`last_heartbeat` text,
	`updated_at` text DEFAULT (datetime('now'))
);
--> statement-breakpoint
CREATE TABLE `acp_strategy` (
	`id` text PRIMARY KEY NOT NULL,
	`category` text,
	`key` text NOT NULL,
	`value` text,
	`notes` text,
	`updated_at` text DEFAULT (datetime('now'))
);
--> statement-breakpoint
CREATE TABLE `acp_tasks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`pillar` text NOT NULL,
	`priority` integer DEFAULT 50,
	`title` text NOT NULL,
	`description` text,
	`status` text DEFAULT 'pending',
	`assigned_at` text,
	`completed_at` text,
	`result` text,
	`created_at` text DEFAULT (datetime('now'))
);
--> statement-breakpoint
CREATE TABLE `market_cache` (
	`key` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`updated_at` text DEFAULT (datetime('now'))
);
--> statement-breakpoint
CREATE TABLE `memoria_entries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`content` text NOT NULL,
	`source_type` text NOT NULL,
	`source_title` text,
	`source_author` text,
	`source_url` text,
	`source_location` text,
	`my_note` text,
	`ai_tags` text,
	`ai_summary` text,
	`is_favorite` integer DEFAULT 0,
	`is_archived` integer DEFAULT 0,
	`created_at` text DEFAULT (datetime('now')),
	`updated_at` text DEFAULT (datetime('now')),
	`captured_at` text,
	`last_surfaced_at` text
);
--> statement-breakpoint
CREATE TABLE `memoria_entry_tags` (
	`entry_id` integer NOT NULL,
	`tag_id` integer NOT NULL,
	FOREIGN KEY (`entry_id`) REFERENCES `memoria_entries`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `memoria_tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `memoria_insights` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`insight_type` text,
	`title` text,
	`content` text NOT NULL,
	`entry_ids` text,
	`generated_at` text DEFAULT (datetime('now'))
);
--> statement-breakpoint
CREATE TABLE `memoria_tags` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`color` text,
	`created_at` text DEFAULT (datetime('now'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `memoria_tags_name_unique` ON `memoria_tags` (`name`);--> statement-breakpoint
ALTER TABLE `acp_offerings` ADD `handler_path` text;--> statement-breakpoint
ALTER TABLE `acp_offerings` ADD `requirements` text;--> statement-breakpoint
ALTER TABLE `acp_offerings` ADD `deliverable` text;--> statement-breakpoint
ALTER TABLE `acp_offerings` ADD `required_funds` integer DEFAULT 0;