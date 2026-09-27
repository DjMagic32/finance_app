CREATE TABLE `categories` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`icon` text NOT NULL,
	`color` text NOT NULL,
	`kind` text NOT NULL,
	`is_essential` integer DEFAULT 0 NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`is_archived` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `debt_payments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`debt_id` integer NOT NULL,
	`due_date` text NOT NULL,
	`amount` real NOT NULL,
	`paid_at` text,
	`notification_ids` text DEFAULT '[]' NOT NULL,
	FOREIGN KEY (`debt_id`) REFERENCES `debts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `debts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`creditor` text NOT NULL,
	`description` text,
	`total_amount` real NOT NULL,
	`currency` text NOT NULL,
	`total_amount_usd` real NOT NULL,
	`start_date` text NOT NULL,
	`due_date` text NOT NULL,
	`schedule` text NOT NULL,
	`installment_amount` real NOT NULL,
	`status` text DEFAULT 'activa' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `exchange_rates` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`source` text NOT NULL,
	`rate` real NOT NULL,
	`fetched_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_rates_date_source` ON `exchange_rates` (`date`,`source`);--> statement-breakpoint
CREATE TABLE `gamification` (
	`id` integer PRIMARY KEY NOT NULL,
	`streak_days` integer DEFAULT 0 NOT NULL,
	`last_log_date` text,
	`best_streak` integer DEFAULT 0 NOT NULL,
	`badges` text DEFAULT '[]' NOT NULL,
	`score_history` text DEFAULT '[]' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `notes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`body` text,
	`kind` text DEFAULT 'nota' NOT NULL,
	`goal_amount_usd` real,
	`goal_saved_usd` real DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `transactions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`type` text NOT NULL,
	`category_id` integer,
	`amount` real NOT NULL,
	`currency` text NOT NULL,
	`amount_usd` real NOT NULL,
	`amount_ves` real NOT NULL,
	`rate_used` real,
	`rate_source` text,
	`note` text,
	`date` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action
);
