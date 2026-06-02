CREATE TABLE `memoria_ingest_queue` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`url` text NOT NULL,
	`source_type` text DEFAULT 'unknown',
	`status` text DEFAULT 'pending',
	`vault_path` text,
	`error_message` text,
	`telegram_chat_id` integer,
	`created_at` text DEFAULT (datetime('now')),
	`processed_at` text
);
