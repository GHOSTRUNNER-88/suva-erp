CREATE TABLE `inventories` (
	`inventory_id` int AUTO_INCREMENT NOT NULL,
	`item_id` int NOT NULL,
	`variant_id` int NOT NULL DEFAULT 0,
	`warehouse_id` int NOT NULL,
	`unit_id` int NOT NULL,
	`quantity` decimal(14,4) NOT NULL DEFAULT '0.0000',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `inventories_inventory_id` PRIMARY KEY(`inventory_id`),
	CONSTRAINT `uq_inventory_item_variant_warehouse` UNIQUE(`item_id`,`variant_id`,`warehouse_id`)
);
--> statement-breakpoint
CREATE TABLE `item_categories` (
	`category_id` int AUTO_INCREMENT NOT NULL,
	`category_name` varchar(150) NOT NULL,
	`description` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `item_categories_category_id` PRIMARY KEY(`category_id`),
	CONSTRAINT `uq_item_category_name` UNIQUE(`category_name`)
);
--> statement-breakpoint
CREATE TABLE `items` (
	`item_id` int AUTO_INCREMENT NOT NULL,
	`item_name` varchar(225) NOT NULL,
	`category_id` int,
	`barcode_input` tinyint NOT NULL DEFAULT 0,
	`barcode_value` varchar(225),
	`primary_unit_id` int NOT NULL,
	`secondary_unit_id` int,
	`purchase_price` decimal(14,5) NOT NULL DEFAULT '0.00000',
	`selling_price` decimal(14,5) NOT NULL DEFAULT '0.00000',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `items_item_id` PRIMARY KEY(`item_id`)
);
--> statement-breakpoint
CREATE TABLE `parties` (
	`party_id` int AUTO_INCREMENT NOT NULL,
	`party_name` varchar(225) NOT NULL,
	`party_type` enum('Customer','Supplier','Both') NOT NULL DEFAULT 'Customer',
	`phone_number` varchar(20),
	`address` text,
	`pan_number` varchar(50),
	`party_group_id` int,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `parties_party_id` PRIMARY KEY(`party_id`),
	CONSTRAINT `uq_party_name` UNIQUE(`party_name`)
);
--> statement-breakpoint
CREATE TABLE `party_groups` (
	`group_id` int AUTO_INCREMENT NOT NULL,
	`group_name` varchar(150) NOT NULL,
	`description` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `party_groups_group_id` PRIMARY KEY(`group_id`),
	CONSTRAINT `uq_party_group_name` UNIQUE(`group_name`)
);
--> statement-breakpoint
CREATE TABLE `warehouses` (
	`warehouse_id` int AUTO_INCREMENT NOT NULL,
	`primary_warehouse` tinyint NOT NULL DEFAULT 0,
	`warehouse_name` varchar(225) NOT NULL,
	`warehouse_type` enum('Godown','Retail Store','Wholesale Store','Assembly Plant','Others') NOT NULL DEFAULT 'Godown',
	`phone_number` varchar(20) NOT NULL,
	`store_address` varchar(225),
	`invoice_prefix` varchar(10) NOT NULL DEFAULT '',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `warehouses_warehouse_id` PRIMARY KEY(`warehouse_id`),
	CONSTRAINT `uq_warehouse_name` UNIQUE(`warehouse_name`),
	CONSTRAINT `uq_warehouse_phone` UNIQUE(`phone_number`)
);
--> statement-breakpoint
ALTER TABLE `inventories` ADD CONSTRAINT `inventories_item_id_items_item_id_fk` FOREIGN KEY (`item_id`) REFERENCES `items`(`item_id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `inventories` ADD CONSTRAINT `inventories_warehouse_id_warehouses_warehouse_id_fk` FOREIGN KEY (`warehouse_id`) REFERENCES `warehouses`(`warehouse_id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `inventories` ADD CONSTRAINT `inventories_unit_id_units_unit_id_fk` FOREIGN KEY (`unit_id`) REFERENCES `units`(`unit_id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `items` ADD CONSTRAINT `items_category_id_item_categories_category_id_fk` FOREIGN KEY (`category_id`) REFERENCES `item_categories`(`category_id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `items` ADD CONSTRAINT `items_primary_unit_id_units_unit_id_fk` FOREIGN KEY (`primary_unit_id`) REFERENCES `units`(`unit_id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `items` ADD CONSTRAINT `items_secondary_unit_id_units_unit_id_fk` FOREIGN KEY (`secondary_unit_id`) REFERENCES `units`(`unit_id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `parties` ADD CONSTRAINT `parties_party_group_id_party_groups_group_id_fk` FOREIGN KEY (`party_group_id`) REFERENCES `party_groups`(`group_id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `idx_inv_warehouse` ON `inventories` (`warehouse_id`);--> statement-breakpoint
CREATE INDEX `idx_inv_item` ON `inventories` (`item_id`);--> statement-breakpoint
CREATE INDEX `idx_inv_warehouse_qty` ON `inventories` (`warehouse_id`,`quantity`);--> statement-breakpoint
CREATE INDEX `idx_inv_item_warehouse_qty` ON `inventories` (`item_id`,`warehouse_id`,`quantity`);--> statement-breakpoint
CREATE INDEX `idx_inv_qty` ON `inventories` (`quantity`);--> statement-breakpoint
CREATE INDEX `idx_items_name` ON `items` (`item_name`);--> statement-breakpoint
CREATE INDEX `idx_items_category_name` ON `items` (`category_id`,`item_name`);--> statement-breakpoint
CREATE INDEX `idx_items_barcode` ON `items` (`barcode_value`);--> statement-breakpoint
CREATE INDEX `idx_party_type` ON `parties` (`party_type`);--> statement-breakpoint
CREATE INDEX `idx_party_phone` ON `parties` (`phone_number`);--> statement-breakpoint
CREATE INDEX `idx_party_group_id` ON `parties` (`party_group_id`);--> statement-breakpoint
CREATE INDEX `idx_party_type_name` ON `parties` (`party_type`,`party_name`);