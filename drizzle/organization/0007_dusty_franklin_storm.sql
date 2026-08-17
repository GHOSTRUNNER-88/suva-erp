CREATE TABLE `inventory_transactions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`item_id` int NOT NULL,
	`variant_id` int NOT NULL DEFAULT 0,
	`warehouse_id` int NOT NULL,
	`change_type` enum('set','add','remove','transfer_in','transfer_out') NOT NULL,
	`quantity_change` decimal(14,4) NOT NULL,
	`quantity_after` decimal(14,4) NOT NULL,
	`note` varchar(500),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `inventory_transactions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `inventory_transactions` ADD CONSTRAINT `inventory_transactions_item_id_items_item_id_fk` FOREIGN KEY (`item_id`) REFERENCES `items`(`item_id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `inventory_transactions` ADD CONSTRAINT `inventory_transactions_warehouse_id_warehouses_warehouse_id_fk` FOREIGN KEY (`warehouse_id`) REFERENCES `warehouses`(`warehouse_id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `idx_inv_txn_lookup` ON `inventory_transactions` (`item_id`,`variant_id`,`warehouse_id`,`created_at`);