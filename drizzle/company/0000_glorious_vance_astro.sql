CREATE TABLE `organizations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(180) NOT NULL,
	`organization_db_name` varchar(64) NOT NULL,
	`fiscal_year_start` date,
	`is_default` tinyint NOT NULL DEFAULT 0,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `organizations_id` PRIMARY KEY(`id`),
	CONSTRAINT `organizations_organization_db_name_unique` UNIQUE(`organization_db_name`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` int AUTO_INCREMENT NOT NULL,
	`first_name` varchar(100) NOT NULL,
	`last_name` varchar(100),
	`email` varchar(190) NOT NULL,
	`phone_number` varchar(20),
	`firebase_uid` varchar(128) NOT NULL,
	`role` enum('owner','admin','member') NOT NULL DEFAULT 'member',
	`is_active` tinyint NOT NULL DEFAULT 1,
	`last_organization_id` int,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_email_unique` UNIQUE(`email`),
	CONSTRAINT `users_firebase_uid_unique` UNIQUE(`firebase_uid`)
);
