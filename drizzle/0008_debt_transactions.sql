CREATE TABLE `debt_transaction_allocations` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `transaction_id` integer NOT NULL REFERENCES `transactions`(`id`),
  `payment_id` integer NOT NULL REFERENCES `debt_payments`(`id`),
  `amount_cents` integer NOT NULL CHECK (`amount_cents` > 0),
  `created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_debt_tx_payment` ON `debt_transaction_allocations` (`transaction_id`, `payment_id`);
