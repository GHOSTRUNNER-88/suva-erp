CREATE TABLE `organization_users` (
	`id` int AUTO_INCREMENT NOT NULL,
	`organization_id` int NOT NULL,
	`user_id` int NOT NULL,
	`role` enum('owner','admin','member') NOT NULL DEFAULT 'member',
	`status` enum('active','invited','disabled') NOT NULL DEFAULT 'active',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `organization_users_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_organization_users_org_user` UNIQUE(`organization_id`,`user_id`)
);
