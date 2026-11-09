CREATE TABLE `work_companies` (`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL, `name` text NOT NULL);
--> statement-breakpoint
CREATE TABLE `work_employees` (`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL, `name` text NOT NULL);
--> statement-breakpoint
CREATE TABLE `work_weeks` (`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL, `company_id` integer NOT NULL, `start_date` text NOT NULL, `end_date` text NOT NULL, `currency` text NOT NULL, `expected_cents` integer NOT NULL, FOREIGN KEY (`company_id`) REFERENCES `work_companies`(`id`));
