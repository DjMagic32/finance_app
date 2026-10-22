CREATE TABLE `project_allocations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`transaction_id` integer NOT NULL,
	`card_id` integer NOT NULL,
	`subtask_id` integer,
	`amount` real NOT NULL,
	`currency` text NOT NULL,
	`amount_usd` real NOT NULL,
	`amount_ves` real NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`transaction_id`) REFERENCES `transactions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`card_id`) REFERENCES `project_cards`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`subtask_id`) REFERENCES `project_subtasks`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_alloc_tx` ON `project_allocations` (`transaction_id`);--> statement-breakpoint
CREATE INDEX `idx_alloc_card` ON `project_allocations` (`card_id`);--> statement-breakpoint
CREATE INDEX `idx_alloc_subtask` ON `project_allocations` (`subtask_id`);--> statement-breakpoint
CREATE TABLE `project_boards` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`icon` text DEFAULT 'view-dashboard' NOT NULL,
	`color` text DEFAULT '#1565C0' NOT NULL,
	`budget_amount` real,
	`budget_currency` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`is_archived` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `project_cards` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`board_id` integer NOT NULL,
	`column_id` integer NOT NULL,
	`title` text NOT NULL,
	`note` text,
	`estimated_amount` real,
	`estimated_currency` text,
	`due_date` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`is_archived` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`completed_at` text,
	FOREIGN KEY (`board_id`) REFERENCES `project_boards`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`column_id`) REFERENCES `project_columns`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_pcard_board` ON `project_cards` (`board_id`);--> statement-breakpoint
CREATE INDEX `idx_pcard_column` ON `project_cards` (`column_id`);--> statement-breakpoint
CREATE TABLE `project_columns` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`board_id` integer NOT NULL,
	`name` text NOT NULL,
	`color` text DEFAULT '#90A4AE' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`is_done` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`board_id`) REFERENCES `project_boards`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_pcol_board` ON `project_columns` (`board_id`);--> statement-breakpoint
CREATE TABLE `project_subtasks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`card_id` integer NOT NULL,
	`title` text NOT NULL,
	`estimated_amount` real,
	`estimated_currency` text,
	`done` integer DEFAULT 0 NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`card_id`) REFERENCES `project_cards`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_psub_card` ON `project_subtasks` (`card_id`);