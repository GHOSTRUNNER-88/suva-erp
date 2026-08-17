CREATE TABLE `companies` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(180) NOT NULL,
	`slug` varchar(120) NOT NULL,
	`company_db_name` varchar(64) NOT NULL,
	`plan_code` varchar(60),
	`status` enum('trial','active','suspended','cancelled') NOT NULL DEFAULT 'trial',
	`max_users` int NOT NULL DEFAULT 5,
	`max_organizations` int NOT NULL DEFAULT 1,
	`expires_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `companies_id` PRIMARY KEY(`id`),
	CONSTRAINT `companies_slug_unique` UNIQUE(`slug`),
	CONSTRAINT `companies_company_db_name_unique` UNIQUE(`company_db_name`)
);
