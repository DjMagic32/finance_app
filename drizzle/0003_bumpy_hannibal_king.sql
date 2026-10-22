ALTER TABLE `transactions` ADD `external_source` text;--> statement-breakpoint
ALTER TABLE `transactions` ADD `external_ref` text;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_tx_source_ref` ON `transactions` (`external_source`,`external_ref`);