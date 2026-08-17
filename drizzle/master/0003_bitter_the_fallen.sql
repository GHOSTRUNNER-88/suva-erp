DROP INDEX `idx_company_members_uid` ON `company_members`;--> statement-breakpoint
ALTER TABLE `companies` MODIFY COLUMN `max_organizations` int NOT NULL DEFAULT 5;--> statement-breakpoint
ALTER TABLE `company_members` ADD CONSTRAINT `uq_company_members_firebase_uid` UNIQUE(`firebase_uid`);