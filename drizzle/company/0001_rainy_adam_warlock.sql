ALTER TABLE `organizations` ADD `industry` varchar(120);--> statement-breakpoint
ALTER TABLE `organizations` ADD `address` text;--> statement-breakpoint
ALTER TABLE `organizations` ADD `accounting_start_date` date;--> statement-breakpoint
ALTER TABLE `organizations` ADD `is_vat_registered` tinyint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `organizations` ADD `email` varchar(190);--> statement-breakpoint
ALTER TABLE `organizations` ADD `phone_number` varchar(30);--> statement-breakpoint
ALTER TABLE `organizations` ADD `pan_number` varchar(20);--> statement-breakpoint
ALTER TABLE `organizations` ADD `website` varchar(190);--> statement-breakpoint
ALTER TABLE `organizations` ADD `enabled_features` text;