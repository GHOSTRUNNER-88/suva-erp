ALTER TABLE `companies` ADD `pan_number` varchar(20);--> statement-breakpoint
ALTER TABLE `companies` ADD CONSTRAINT `companies_pan_number_unique` UNIQUE(`pan_number`);