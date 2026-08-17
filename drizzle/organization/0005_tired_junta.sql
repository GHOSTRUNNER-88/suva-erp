CREATE TABLE `attribute_values` (
	`value_id` int AUTO_INCREMENT NOT NULL,
	`attr_id` int NOT NULL,
	`value_name` varchar(50) NOT NULL,
	`value_slug` varchar(50) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `attribute_values_value_id` PRIMARY KEY(`value_id`),
	CONSTRAINT `uq_attribute_value_attr_name` UNIQUE(`attr_id`,`value_name`),
	CONSTRAINT `uq_attribute_value_attr_slug` UNIQUE(`attr_id`,`value_slug`)
);
--> statement-breakpoint
CREATE TABLE `attributes` (
	`attr_id` int AUTO_INCREMENT NOT NULL,
	`attr_name` varchar(50) NOT NULL,
	`attr_slug` varchar(50) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `attributes_attr_id` PRIMARY KEY(`attr_id`),
	CONSTRAINT `uq_attr_name` UNIQUE(`attr_name`),
	CONSTRAINT `uq_attr_slug` UNIQUE(`attr_slug`)
);
--> statement-breakpoint
CREATE TABLE `item_attribute_values` (
	`item_variant_id` int AUTO_INCREMENT NOT NULL,
	`item_id` int NOT NULL,
	`value_id` int NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `item_attribute_values_item_variant_id` PRIMARY KEY(`item_variant_id`),
	CONSTRAINT `uq_item_attribute_value` UNIQUE(`item_id`,`value_id`)
);
--> statement-breakpoint
ALTER TABLE `attribute_values` ADD CONSTRAINT `attribute_values_attr_id_attributes_attr_id_fk` FOREIGN KEY (`attr_id`) REFERENCES `attributes`(`attr_id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `item_attribute_values` ADD CONSTRAINT `item_attribute_values_item_id_items_item_id_fk` FOREIGN KEY (`item_id`) REFERENCES `items`(`item_id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `item_attribute_values` ADD CONSTRAINT `item_attribute_values_value_id_attribute_values_value_id_fk` FOREIGN KEY (`value_id`) REFERENCES `attribute_values`(`value_id`) ON DELETE cascade ON UPDATE no action;