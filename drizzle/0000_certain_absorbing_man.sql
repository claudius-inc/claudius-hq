CREATE TABLE `ibkr_fx_rates` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`from_currency` text NOT NULL,
	`to_currency` text NOT NULL,
	`rate` real NOT NULL,
	`created_at` text DEFAULT (datetime('now'))
);
--> statement-breakpoint
CREATE TABLE `ibkr_imports` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`filename` text NOT NULL,
	`statement_start` text,
	`statement_end` text,
	`trade_count` integer DEFAULT 0,
	`dividend_count` integer DEFAULT 0,
	`created_at` text DEFAULT (datetime('now'))
);
--> statement-breakpoint
CREATE TABLE `ibkr_income` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`import_id` integer,
	`date` text NOT NULL,
	`symbol` text NOT NULL,
	`description` text,
	`income_type` text NOT NULL,
	`amount` real NOT NULL,
	`currency` text DEFAULT 'USD' NOT NULL,
	`fx_rate` real DEFAULT 1,
	`created_at` text DEFAULT (datetime('now')),
	FOREIGN KEY (`import_id`) REFERENCES `ibkr_imports`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `ibkr_portfolio_meta` (
	`id` integer PRIMARY KEY NOT NULL,
	`total_realized_pnl` real DEFAULT 0,
	`total_realized_pnl_base` real DEFAULT 0,
	`base_currency` text DEFAULT 'SGD',
	`updated_at` text DEFAULT (datetime('now'))
);
--> statement-breakpoint
CREATE TABLE `ibkr_positions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`symbol` text NOT NULL,
	`quantity` real NOT NULL,
	`avg_cost` real NOT NULL,
	`currency` text DEFAULT 'USD' NOT NULL,
	`total_cost` real NOT NULL,
	`total_cost_base` real DEFAULT 0,
	`realized_pnl` real DEFAULT 0,
	`realized_pnl_base` real DEFAULT 0,
	`avg_fx_rate` real DEFAULT 1,
	`last_updated` text DEFAULT (datetime('now'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ibkr_positions_symbol_unique` ON `ibkr_positions` (`symbol`);--> statement-breakpoint
CREATE TABLE `ibkr_trades` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`import_id` integer,
	`trade_date` text NOT NULL,
	`settle_date` text,
	`symbol` text NOT NULL,
	`description` text,
	`asset_class` text,
	`action` text NOT NULL,
	`quantity` real NOT NULL,
	`price` real NOT NULL,
	`currency` text DEFAULT 'USD' NOT NULL,
	`fx_rate` real DEFAULT 1,
	`proceeds` real,
	`cost_basis` real,
	`realized_pnl` real,
	`commission` real DEFAULT 0,
	`fees` real DEFAULT 0,
	`created_at` text DEFAULT (datetime('now')),
	FOREIGN KEY (`import_id`) REFERENCES `ibkr_imports`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `ideas` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '',
	`source` text DEFAULT '',
	`market_notes` text DEFAULT '',
	`effort_estimate` text DEFAULT 'unknown',
	`potential` text DEFAULT 'unknown',
	`status` text DEFAULT 'new',
	`promoted_to_project_id` integer,
	`tags` text DEFAULT '[]',
	`created_at` text DEFAULT (datetime('now')),
	`updated_at` text DEFAULT (datetime('now')),
	FOREIGN KEY (`promoted_to_project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `portfolio_holdings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ticker` text NOT NULL,
	`target_allocation` real NOT NULL,
	`cost_basis` real,
	`shares` real,
	`added_at` text DEFAULT (datetime('now')),
	`updated_at` text DEFAULT (datetime('now'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `portfolio_holdings_ticker_unique` ON `portfolio_holdings` (`ticker`);--> statement-breakpoint
CREATE TABLE `portfolio_reports` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`content` text NOT NULL,
	`summary` text,
	`total_tickers` integer,
	`created_at` text DEFAULT (datetime('now'))
);
--> statement-breakpoint
CREATE TABLE `projects` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '',
	`status` text DEFAULT 'backlog',
	`phase` text DEFAULT 'build',
	`repo_url` text DEFAULT '',
	`deploy_url` text DEFAULT '',
	`test_count` integer DEFAULT 0,
	`build_status` text DEFAULT 'unknown',
	`last_deploy_time` text DEFAULT '',
	`target_audience` text DEFAULT '',
	`action_plan` text DEFAULT '',
	`plan_tech` text DEFAULT '',
	`plan_distribution` text DEFAULT '',
	`created_at` text DEFAULT (datetime('now')),
	`updated_at` text DEFAULT (datetime('now'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `projects_name_unique` ON `projects` (`name`);--> statement-breakpoint
CREATE TABLE `research_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`ticker` text NOT NULL,
	`status` text DEFAULT 'pending',
	`progress` integer DEFAULT 0,
	`error_message` text,
	`report_id` integer,
	`created_at` text DEFAULT (datetime('now')),
	`updated_at` text DEFAULT (datetime('now')),
	FOREIGN KEY (`report_id`) REFERENCES `stock_reports`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `research_pages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` integer NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`content` text NOT NULL,
	`sort_order` integer DEFAULT 0,
	`created_at` text DEFAULT (datetime('now')),
	`updated_at` text DEFAULT (datetime('now'))
);
--> statement-breakpoint
CREATE TABLE `stock_alerts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ticker` text NOT NULL,
	`accumulate_low` real,
	`accumulate_high` real,
	`strong_buy_low` real,
	`strong_buy_high` real,
	`status` text DEFAULT 'watching',
	`last_triggered` text,
	`notes` text,
	`created_at` text DEFAULT (datetime('now')),
	`updated_at` text DEFAULT (datetime('now'))
);
--> statement-breakpoint
CREATE TABLE `stock_reports` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ticker` text NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`content` text DEFAULT '' NOT NULL,
	`report_type` text DEFAULT 'sun-tzu' NOT NULL,
	`company_name` text DEFAULT '',
	`related_tickers` text DEFAULT '',
	`created_at` text DEFAULT (datetime('now'))
);
--> statement-breakpoint
CREATE TABLE `telegram_pending` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`telegram_id` integer NOT NULL,
	`chat_id` integer NOT NULL,
	`message_id` integer NOT NULL,
	`action_type` text NOT NULL,
	`payload` text,
	`created_at` text DEFAULT (datetime('now'))
);
--> statement-breakpoint
CREATE TABLE `telegram_users` (
	`telegram_id` integer PRIMARY KEY NOT NULL,
	`username` text,
	`first_name` text,
	`alert_theme_movers` integer DEFAULT 1,
	`alert_sector_rotation` integer DEFAULT 1,
	`alert_threshold` real DEFAULT 5,
	`created_at` text DEFAULT (datetime('now'))
);
--> statement-breakpoint
CREATE TABLE `theme_stocks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`theme_id` integer NOT NULL,
	`ticker` text NOT NULL,
	`target_price` real,
	`status` text DEFAULT 'watching',
	`notes` text,
	`added_at` text DEFAULT (datetime('now')),
	FOREIGN KEY (`theme_id`) REFERENCES `themes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `themes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '',
	`created_at` text DEFAULT (datetime('now'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `themes_name_unique` ON `themes` (`name`);--> statement-breakpoint
CREATE TABLE `watchlist` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ticker` text NOT NULL,
	`target_price` real,
	`notes` text,
	`status` text DEFAULT 'watching',
	`added_at` text DEFAULT (datetime('now')),
	`updated_at` text DEFAULT (datetime('now'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `watchlist_ticker_unique` ON `watchlist` (`ticker`);