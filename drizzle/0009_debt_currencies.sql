ALTER TABLE `debt_transaction_allocations` ADD COLUMN `debt_amount_cents` integer NOT NULL DEFAULT 0;
--> statement-breakpoint
UPDATE `debt_transaction_allocations` SET `debt_amount_cents` = `amount_cents`;
