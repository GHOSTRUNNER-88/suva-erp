CREATE TABLE `item_party_group_prices` (
	`id` int AUTO_INCREMENT NOT NULL,
	`item_id` int NOT NULL,
	`party_group_id` int NOT NULL,
	`selling_price` decimal(14,5) NOT NULL DEFAULT '0.00000',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `item_party_group_prices_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_item_party_group` UNIQUE(`item_id`,`party_group_id`)
);
--> statement-breakpoint
ALTER TABLE `item_categories` ADD `icon` varchar(50);--> statement-breakpoint
ALTER TABLE `items` ADD `conversion_factor` int;--> statement-breakpoint
ALTER TABLE `item_party_group_prices` ADD CONSTRAINT `item_party_group_prices_item_id_items_item_id_fk` FOREIGN KEY (`item_id`) REFERENCES `items`(`item_id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `item_party_group_prices` ADD CONSTRAINT `item_party_group_prices_party_group_id_party_groups_group_id_fk` FOREIGN KEY (`party_group_id`) REFERENCES `party_groups`(`group_id`) ON DELETE cascade ON UPDATE no action;