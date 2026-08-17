CREATE TABLE `units` (
	`unit_id` int AUTO_INCREMENT NOT NULL,
	`unit_name` varchar(50) NOT NULL,
	`unit_code` varchar(20) NOT NULL,
	`unit_type` varchar(30),
	`is_active` tinyint NOT NULL DEFAULT 1,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `units_unit_id` PRIMARY KEY(`unit_id`),
	CONSTRAINT `uq_unit_name` UNIQUE(`unit_name`),
	CONSTRAINT `uq_unit_code` UNIQUE(`unit_code`)
);
