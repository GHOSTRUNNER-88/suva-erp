ALTER TABLE `inventory_transactions` DROP FOREIGN KEY `inventory_transactions_item_id_items_item_id_fk`;
--> statement-breakpoint
ALTER TABLE `inventory_transactions` DROP FOREIGN KEY `inventory_transactions_warehouse_id_warehouses_warehouse_id_fk`;
--> statement-breakpoint
ALTER TABLE `inventory_transactions` ADD CONSTRAINT `inventory_transactions_item_id_items_item_id_fk` FOREIGN KEY (`item_id`) REFERENCES `items`(`item_id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `inventory_transactions` ADD CONSTRAINT `inventory_transactions_warehouse_id_warehouses_warehouse_id_fk` FOREIGN KEY (`warehouse_id`) REFERENCES `warehouses`(`warehouse_id`) ON DELETE restrict ON UPDATE no action;