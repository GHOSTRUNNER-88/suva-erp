CREATE TABLE `company_members` (
	`id` int AUTO_INCREMENT NOT NULL,
	`firebase_uid` varchar(128) NOT NULL,
	`company_id` int NOT NULL,
	`company_user_id` int NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `company_members_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_company_members_uid_company` UNIQUE(`firebase_uid`,`company_id`)
);
--> statement-breakpoint
ALTER TABLE `company_members` ADD CONSTRAINT `company_members_company_id_companies_id_fk` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `idx_company_members_uid` ON `company_members` (`firebase_uid`);