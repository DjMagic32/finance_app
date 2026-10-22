ALTER TABLE `transactions` ADD `bank_description` text;--> statement-breakpoint
UPDATE `transactions` SET `bank_description` = `note`, `note` = NULL WHERE `external_source` = 'mercantil_pdf';