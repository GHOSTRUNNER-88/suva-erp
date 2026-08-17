CREATE TABLE `cheque_register` (
	`cheque_id` int AUTO_INCREMENT NOT NULL,
	`cheque_type` enum('received','issued') NOT NULL DEFAULT 'received',
	`cheque_number` varchar(80) NOT NULL,
	`cheque_date` date NOT NULL,
	`reminder_date` date NOT NULL,
	`party_id` int,
	`bank_account_id` int,
	`bank_name` varchar(180),
	`amount` decimal(14,2) NOT NULL DEFAULT '0.00',
	`status` enum('pending','cleared','bounced','cancelled') NOT NULL DEFAULT 'pending',
	`cleared_date` date,
	`notes` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `cheque_register_cheque_id` PRIMARY KEY(`cheque_id`)
);
--> statement-breakpoint
CREATE TABLE `credit_note_details` (
	`credit_note_detail_id` int AUTO_INCREMENT NOT NULL,
	`credit_note_id` int NOT NULL,
	`item_id` int NOT NULL,
	`variant_id` int,
	`unit_id` int NOT NULL,
	`quantity` decimal(14,2) NOT NULL DEFAULT '0.00',
	`rate` decimal(14,5) NOT NULL DEFAULT '0.00000',
	`disc_type` enum('percent','amount') NOT NULL DEFAULT 'percent',
	`disc_percent` decimal(8,2) NOT NULL DEFAULT '0.00',
	`disc_amount` decimal(14,2) NOT NULL DEFAULT '0.00',
	`line_subtotal` decimal(14,2) NOT NULL DEFAULT '0.00',
	`line_total` decimal(14,2) NOT NULL DEFAULT '0.00',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `credit_note_details_credit_note_detail_id` PRIMARY KEY(`credit_note_detail_id`)
);
--> statement-breakpoint
CREATE TABLE `credit_notes` (
	`credit_note_id` int AUTO_INCREMENT NOT NULL,
	`credit_note_number` varchar(50) NOT NULL,
	`credit_note_date` date NOT NULL,
	`credit_note_type` enum('sales_return','price_protection') NOT NULL DEFAULT 'sales_return',
	`party_id` int NOT NULL,
	`reference_no` varchar(100),
	`billing_name` varchar(225),
	`billing_address` text,
	`warehouse_id` int,
	`subtotal` decimal(14,2) NOT NULL DEFAULT '0.00',
	`disc_type` enum('percent','amount') NOT NULL DEFAULT 'percent',
	`disc_percent` decimal(8,2) NOT NULL DEFAULT '0.00',
	`disc_amount` decimal(14,2) NOT NULL DEFAULT '0.00',
	`vat_percent` decimal(5,2),
	`is_vat_applicable` tinyint NOT NULL DEFAULT 0,
	`vat_amount` decimal(14,2) NOT NULL DEFAULT '0.00',
	`total_amount` decimal(14,2) NOT NULL DEFAULT '0.00',
	`is_refunded` tinyint NOT NULL DEFAULT 0,
	`refund_amount` decimal(14,2) NOT NULL DEFAULT '0.00',
	`bank_account_id` int,
	`notes` text,
	`status` enum('draft','completed','cancelled') NOT NULL DEFAULT 'completed',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `credit_notes_credit_note_id` PRIMARY KEY(`credit_note_id`)
);
--> statement-breakpoint
CREATE TABLE `debit_note_details` (
	`debit_note_detail_id` int AUTO_INCREMENT NOT NULL,
	`debit_note_id` int NOT NULL,
	`item_id` int NOT NULL,
	`variant_id` int,
	`unit_id` int NOT NULL,
	`quantity` decimal(14,2) NOT NULL DEFAULT '0.00',
	`rate` decimal(14,5) NOT NULL DEFAULT '0.00000',
	`disc_type` enum('percent','amount') NOT NULL DEFAULT 'percent',
	`disc_percent` decimal(8,2) NOT NULL DEFAULT '0.00',
	`disc_amount` decimal(14,2) NOT NULL DEFAULT '0.00',
	`line_subtotal` decimal(14,2) NOT NULL DEFAULT '0.00',
	`line_total` decimal(14,2) NOT NULL DEFAULT '0.00',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `debit_note_details_debit_note_detail_id` PRIMARY KEY(`debit_note_detail_id`)
);
--> statement-breakpoint
CREATE TABLE `debit_notes` (
	`debit_note_id` int AUTO_INCREMENT NOT NULL,
	`debit_note_number` varchar(50) NOT NULL,
	`debit_note_date` date NOT NULL,
	`party_id` int NOT NULL,
	`reference_no` varchar(100),
	`supplier_name` varchar(225),
	`supplier_address` text,
	`warehouse_id` int,
	`subtotal` decimal(14,2) NOT NULL DEFAULT '0.00',
	`disc_type` enum('percent','amount') NOT NULL DEFAULT 'percent',
	`disc_percent` decimal(8,2) NOT NULL DEFAULT '0.00',
	`disc_amount` decimal(14,2) NOT NULL DEFAULT '0.00',
	`vat_percent` decimal(5,2),
	`is_vat_applicable` tinyint NOT NULL DEFAULT 0,
	`vat_amount` decimal(14,2) NOT NULL DEFAULT '0.00',
	`total_amount` decimal(14,2) NOT NULL DEFAULT '0.00',
	`is_refunded` tinyint NOT NULL DEFAULT 0,
	`refund_amount` decimal(14,2) NOT NULL DEFAULT '0.00',
	`bank_account_id` int,
	`notes` text,
	`status` enum('draft','completed','cancelled') NOT NULL DEFAULT 'completed',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `debit_notes_debit_note_id` PRIMARY KEY(`debit_note_id`)
);
--> statement-breakpoint
CREATE TABLE `delivery_challan_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`challan_id` int NOT NULL,
	`item_id` int NOT NULL,
	`variant_id` int,
	`unit_id` int,
	`quantity` decimal(15,4) NOT NULL DEFAULT '0.0000',
	`item_note` varchar(255),
	CONSTRAINT `delivery_challan_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `delivery_challans` (
	`challan_id` int AUTO_INCREMENT NOT NULL,
	`challan_number` varchar(50) NOT NULL,
	`challan_date` date NOT NULL,
	`party_id` int NOT NULL,
	`warehouse_id` int,
	`source_type` enum('manual','sale','purchase') NOT NULL DEFAULT 'manual',
	`source_id` int,
	`notes` text,
	`status` enum('pending','delivered','cancelled') NOT NULL DEFAULT 'pending',
	`stock_deducted` tinyint NOT NULL DEFAULT 0,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `delivery_challans_challan_id` PRIMARY KEY(`challan_id`)
);
--> statement-breakpoint
CREATE TABLE `expense_categories` (
	`category_id` int AUTO_INCREMENT NOT NULL,
	`category_name` varchar(150) NOT NULL,
	`description` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `expense_categories_category_id` PRIMARY KEY(`category_id`),
	CONSTRAINT `uq_expense_category_name` UNIQUE(`category_name`)
);
--> statement-breakpoint
CREATE TABLE `expenses` (
	`expense_id` int AUTO_INCREMENT NOT NULL,
	`voucher_number` int NOT NULL,
	`expense_number` varchar(50) NOT NULL,
	`expense_date` date NOT NULL,
	`category_id` int,
	`party_id` int,
	`description` varchar(500),
	`taxable_amount` decimal(14,5) NOT NULL DEFAULT '0.00000',
	`non_taxable_amount` decimal(14,5) NOT NULL DEFAULT '0.00000',
	`subtotal` decimal(14,2) NOT NULL DEFAULT '0.00',
	`vat_percent` decimal(5,2),
	`vat_amount` decimal(14,2) NOT NULL DEFAULT '0.00',
	`is_vat_applicable` tinyint NOT NULL DEFAULT 0,
	`amount` decimal(14,2) NOT NULL DEFAULT '0.00',
	`bank_account_id` int,
	`reference_no` varchar(100),
	`notes` text,
	`status` enum('draft','completed','cancelled') NOT NULL DEFAULT 'completed',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `expenses_expense_id` PRIMARY KEY(`expense_id`),
	CONSTRAINT `uq_expense_voucher_number` UNIQUE(`voucher_number`)
);
--> statement-breakpoint
CREATE TABLE `payment_allocations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`payment_id` int NOT NULL,
	`document_type` enum('sales_invoice','purchase_bill') NOT NULL,
	`document_id` int NOT NULL,
	`allocated_amount` decimal(14,2) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `payment_allocations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `payments` (
	`payment_id` int AUTO_INCREMENT NOT NULL,
	`payment_type` enum('in','out') NOT NULL,
	`payment_date` date NOT NULL,
	`receipt_number` varchar(50) NOT NULL,
	`party_id` int,
	`bank_account_id` int NOT NULL,
	`amount` decimal(14,2) NOT NULL DEFAULT '0.00',
	`notes` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `payments_payment_id` PRIMARY KEY(`payment_id`),
	CONSTRAINT `uq_receipt_number` UNIQUE(`receipt_number`)
);
--> statement-breakpoint
CREATE TABLE `purchase_bill_details` (
	`purchase_bill_detail_id` int AUTO_INCREMENT NOT NULL,
	`bill_id` int NOT NULL,
	`item_id` int NOT NULL,
	`variant_id` int,
	`unit_id` int NOT NULL,
	`quantity` decimal(14,2) NOT NULL DEFAULT '0.00',
	`rate` decimal(14,5) NOT NULL DEFAULT '0.00000',
	`disc_type` enum('percent','amount') NOT NULL DEFAULT 'percent',
	`disc_percent` decimal(8,2) NOT NULL DEFAULT '0.00',
	`disc_amount` decimal(14,2) NOT NULL DEFAULT '0.00',
	`line_subtotal` decimal(14,2) NOT NULL DEFAULT '0.00',
	`line_total` decimal(14,2) NOT NULL DEFAULT '0.00',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `purchase_bill_details_purchase_bill_detail_id` PRIMARY KEY(`purchase_bill_detail_id`)
);
--> statement-breakpoint
CREATE TABLE `purchase_bills` (
	`bill_id` int AUTO_INCREMENT NOT NULL,
	`bill_number` varchar(50) NOT NULL,
	`bill_date` date NOT NULL,
	`party_id` int NOT NULL,
	`supplier_name` varchar(225),
	`supplier_address` text,
	`pan_number` varchar(50),
	`bank_account_id` int,
	`warehouse_id` int,
	`subtotal` decimal(14,2) NOT NULL DEFAULT '0.00',
	`disc_type` enum('percent','amount') NOT NULL DEFAULT 'percent',
	`disc_percent` decimal(8,2) NOT NULL DEFAULT '0.00',
	`disc_amount` decimal(14,2) NOT NULL DEFAULT '0.00',
	`vat_percent` decimal(5,2),
	`is_vat_applicable` tinyint NOT NULL DEFAULT 0,
	`vat_amount` decimal(14,2) NOT NULL DEFAULT '0.00',
	`total_amount` decimal(14,2) NOT NULL DEFAULT '0.00',
	`is_paid` tinyint NOT NULL DEFAULT 1,
	`paid_amount` decimal(14,2) NOT NULL DEFAULT '0.00',
	`due_amount` decimal(14,2) NOT NULL DEFAULT '0.00',
	`notes` text,
	`status` enum('draft','completed','cancelled') NOT NULL DEFAULT 'completed',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `purchase_bills_bill_id` PRIMARY KEY(`bill_id`)
);
--> statement-breakpoint
CREATE TABLE `purchase_order_details` (
	`purchase_order_detail_id` int AUTO_INCREMENT NOT NULL,
	`order_id` int NOT NULL,
	`item_id` int NOT NULL,
	`variant_id` int,
	`unit_id` int NOT NULL,
	`quantity` int NOT NULL DEFAULT 0,
	`rate` decimal(14,5) NOT NULL DEFAULT '0.00000',
	`disc_type` enum('percent','amount') NOT NULL DEFAULT 'percent',
	`disc_percent` decimal(8,2) NOT NULL DEFAULT '0.00',
	`disc_amount` decimal(14,2) NOT NULL DEFAULT '0.00',
	`line_subtotal` decimal(14,2) NOT NULL DEFAULT '0.00',
	`line_total` decimal(14,2) NOT NULL DEFAULT '0.00',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `purchase_order_details_purchase_order_detail_id` PRIMARY KEY(`purchase_order_detail_id`)
);
--> statement-breakpoint
CREATE TABLE `purchase_orders` (
	`order_id` int AUTO_INCREMENT NOT NULL,
	`order_number` varchar(50) NOT NULL,
	`order_date` date NOT NULL,
	`expected_date` date,
	`party_id` int NOT NULL,
	`supplier_name` varchar(225),
	`supplier_address` text,
	`pan_number` varchar(50),
	`warehouse_id` int,
	`subtotal` decimal(14,2) NOT NULL DEFAULT '0.00',
	`disc_type` enum('percent','amount') NOT NULL DEFAULT 'percent',
	`disc_percent` decimal(8,2) NOT NULL DEFAULT '0.00',
	`disc_amount` decimal(14,2) NOT NULL DEFAULT '0.00',
	`vat_percent` decimal(5,2),
	`is_vat_applicable` tinyint NOT NULL DEFAULT 0,
	`vat_amount` decimal(14,2) NOT NULL DEFAULT '0.00',
	`total_amount` decimal(14,2) NOT NULL DEFAULT '0.00',
	`notes` text,
	`status` enum('draft','ordered','received','cancelled') NOT NULL DEFAULT 'ordered',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `purchase_orders_order_id` PRIMARY KEY(`order_id`)
);
--> statement-breakpoint
CREATE TABLE `sales_invoice_details` (
	`sales_invoice_detail_id` int AUTO_INCREMENT NOT NULL,
	`invoice_id` int NOT NULL,
	`item_id` int NOT NULL,
	`variant_id` int,
	`unit_id` int NOT NULL,
	`quantity` decimal(14,2) NOT NULL DEFAULT '0.00',
	`rate` decimal(14,5) NOT NULL DEFAULT '0.00000',
	`disc_type` enum('percent','amount') NOT NULL DEFAULT 'percent',
	`disc_percent` decimal(8,2) NOT NULL DEFAULT '0.00',
	`disc_amount` decimal(14,2) NOT NULL DEFAULT '0.00',
	`line_subtotal` decimal(14,2) NOT NULL DEFAULT '0.00',
	`line_total` decimal(14,2) NOT NULL DEFAULT '0.00',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `sales_invoice_details_sales_invoice_detail_id` PRIMARY KEY(`sales_invoice_detail_id`)
);
--> statement-breakpoint
CREATE TABLE `sales_invoices` (
	`invoice_id` int AUTO_INCREMENT NOT NULL,
	`invoice_number` varchar(50) NOT NULL,
	`invoice_date` date NOT NULL,
	`party_id` int NOT NULL,
	`billing_name` varchar(225),
	`billing_address` text,
	`pan_number` varchar(50),
	`bank_account_id` int,
	`warehouse_id` int,
	`subtotal` decimal(14,2) NOT NULL DEFAULT '0.00',
	`disc_type` enum('percent','amount') NOT NULL DEFAULT 'percent',
	`disc_percent` decimal(8,2) NOT NULL DEFAULT '0.00',
	`disc_amount` decimal(14,2) NOT NULL DEFAULT '0.00',
	`vat_percent` decimal(5,2),
	`is_vat_applicable` tinyint NOT NULL DEFAULT 0,
	`vat_amount` decimal(14,2) NOT NULL DEFAULT '0.00',
	`total_amount` decimal(14,2) NOT NULL DEFAULT '0.00',
	`is_received` tinyint NOT NULL DEFAULT 1,
	`received_amount` decimal(14,2) NOT NULL DEFAULT '0.00',
	`due_amount` decimal(14,2) NOT NULL DEFAULT '0.00',
	`notes` text,
	`status` enum('draft','completed','cancelled') NOT NULL DEFAULT 'completed',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `sales_invoices_invoice_id` PRIMARY KEY(`invoice_id`)
);
--> statement-breakpoint
CREATE TABLE `sales_order_details` (
	`sales_order_detail_id` int AUTO_INCREMENT NOT NULL,
	`order_id` int NOT NULL,
	`item_id` int NOT NULL,
	`variant_id` int,
	`unit_id` int NOT NULL,
	`quantity` int NOT NULL DEFAULT 0,
	`rate` decimal(14,5) NOT NULL DEFAULT '0.00000',
	`disc_type` enum('percent','amount') NOT NULL DEFAULT 'percent',
	`disc_percent` decimal(8,2) NOT NULL DEFAULT '0.00',
	`disc_amount` decimal(14,2) NOT NULL DEFAULT '0.00',
	`line_subtotal` decimal(14,2) NOT NULL DEFAULT '0.00',
	`line_total` decimal(14,2) NOT NULL DEFAULT '0.00',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `sales_order_details_sales_order_detail_id` PRIMARY KEY(`sales_order_detail_id`)
);
--> statement-breakpoint
CREATE TABLE `sales_orders` (
	`order_id` int AUTO_INCREMENT NOT NULL,
	`order_number` varchar(50) NOT NULL,
	`order_date` date NOT NULL,
	`expected_date` date,
	`party_id` int NOT NULL,
	`billing_name` varchar(225),
	`billing_address` text,
	`pan_number` varchar(50),
	`warehouse_id` int,
	`subtotal` decimal(14,2) NOT NULL DEFAULT '0.00',
	`disc_type` enum('percent','amount') NOT NULL DEFAULT 'percent',
	`disc_percent` decimal(8,2) NOT NULL DEFAULT '0.00',
	`disc_amount` decimal(14,2) NOT NULL DEFAULT '0.00',
	`vat_percent` decimal(5,2),
	`is_vat_applicable` tinyint NOT NULL DEFAULT 0,
	`vat_amount` decimal(14,2) NOT NULL DEFAULT '0.00',
	`total_amount` decimal(14,2) NOT NULL DEFAULT '0.00',
	`notes` text,
	`status` enum('draft','confirmed','converted','cancelled') NOT NULL DEFAULT 'confirmed',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `sales_orders_order_id` PRIMARY KEY(`order_id`)
);
--> statement-breakpoint
CREATE TABLE `sales_quotation_details` (
	`sales_quotation_detail_id` int AUTO_INCREMENT NOT NULL,
	`quotation_id` int NOT NULL,
	`item_id` int NOT NULL,
	`variant_id` int,
	`unit_id` int NOT NULL,
	`quantity` int NOT NULL DEFAULT 0,
	`rate` decimal(14,5) NOT NULL DEFAULT '0.00000',
	`disc_type` enum('percent','amount') NOT NULL DEFAULT 'percent',
	`disc_percent` decimal(8,2) NOT NULL DEFAULT '0.00',
	`disc_amount` decimal(14,2) NOT NULL DEFAULT '0.00',
	`line_subtotal` decimal(14,2) NOT NULL DEFAULT '0.00',
	`line_total` decimal(14,2) NOT NULL DEFAULT '0.00',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `sales_quotation_details_sales_quotation_detail_id` PRIMARY KEY(`sales_quotation_detail_id`)
);
--> statement-breakpoint
CREATE TABLE `sales_quotations` (
	`quotation_id` int AUTO_INCREMENT NOT NULL,
	`quotation_number` varchar(50) NOT NULL,
	`quotation_date` date NOT NULL,
	`valid_until` date,
	`party_id` int NOT NULL,
	`billing_name` varchar(225),
	`billing_address` text,
	`pan_number` varchar(50),
	`warehouse_id` int,
	`subtotal` decimal(14,2) NOT NULL DEFAULT '0.00',
	`disc_type` enum('percent','amount') NOT NULL DEFAULT 'percent',
	`disc_percent` decimal(8,2) NOT NULL DEFAULT '0.00',
	`disc_amount` decimal(14,2) NOT NULL DEFAULT '0.00',
	`vat_percent` decimal(5,2),
	`is_vat_applicable` tinyint NOT NULL DEFAULT 0,
	`vat_amount` decimal(14,2) NOT NULL DEFAULT '0.00',
	`total_amount` decimal(14,2) NOT NULL DEFAULT '0.00',
	`notes` text,
	`status` enum('draft','sent','accepted','converted','expired','cancelled') NOT NULL DEFAULT 'sent',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `sales_quotations_quotation_id` PRIMARY KEY(`quotation_id`)
);
--> statement-breakpoint
ALTER TABLE `inventory_transactions` MODIFY COLUMN `change_type` enum('set','add','remove','transfer_in','transfer_out','sale','sales_return','purchase','purchase_return','challan_out','challan_in') NOT NULL;--> statement-breakpoint
ALTER TABLE `cheque_register` ADD CONSTRAINT `cheque_register_party_id_parties_party_id_fk` FOREIGN KEY (`party_id`) REFERENCES `parties`(`party_id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `cheque_register` ADD CONSTRAINT `cheque_register_bank_account_id_bank_accounts_id_fk` FOREIGN KEY (`bank_account_id`) REFERENCES `bank_accounts`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `credit_note_details` ADD CONSTRAINT `credit_note_details_item_id_items_item_id_fk` FOREIGN KEY (`item_id`) REFERENCES `items`(`item_id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `credit_note_details` ADD CONSTRAINT `credit_note_details_variant_id_attribute_values_value_id_fk` FOREIGN KEY (`variant_id`) REFERENCES `attribute_values`(`value_id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `credit_note_details` ADD CONSTRAINT `credit_note_details_unit_id_units_unit_id_fk` FOREIGN KEY (`unit_id`) REFERENCES `units`(`unit_id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `credit_note_details` ADD CONSTRAINT `fk_credit_note_details_note` FOREIGN KEY (`credit_note_id`) REFERENCES `credit_notes`(`credit_note_id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `credit_notes` ADD CONSTRAINT `credit_notes_party_id_parties_party_id_fk` FOREIGN KEY (`party_id`) REFERENCES `parties`(`party_id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `credit_notes` ADD CONSTRAINT `credit_notes_warehouse_id_warehouses_warehouse_id_fk` FOREIGN KEY (`warehouse_id`) REFERENCES `warehouses`(`warehouse_id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `credit_notes` ADD CONSTRAINT `credit_notes_bank_account_id_bank_accounts_id_fk` FOREIGN KEY (`bank_account_id`) REFERENCES `bank_accounts`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `debit_note_details` ADD CONSTRAINT `debit_note_details_debit_note_id_debit_notes_debit_note_id_fk` FOREIGN KEY (`debit_note_id`) REFERENCES `debit_notes`(`debit_note_id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `debit_note_details` ADD CONSTRAINT `debit_note_details_item_id_items_item_id_fk` FOREIGN KEY (`item_id`) REFERENCES `items`(`item_id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `debit_note_details` ADD CONSTRAINT `debit_note_details_variant_id_attribute_values_value_id_fk` FOREIGN KEY (`variant_id`) REFERENCES `attribute_values`(`value_id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `debit_note_details` ADD CONSTRAINT `debit_note_details_unit_id_units_unit_id_fk` FOREIGN KEY (`unit_id`) REFERENCES `units`(`unit_id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `debit_notes` ADD CONSTRAINT `debit_notes_party_id_parties_party_id_fk` FOREIGN KEY (`party_id`) REFERENCES `parties`(`party_id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `debit_notes` ADD CONSTRAINT `debit_notes_warehouse_id_warehouses_warehouse_id_fk` FOREIGN KEY (`warehouse_id`) REFERENCES `warehouses`(`warehouse_id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `debit_notes` ADD CONSTRAINT `debit_notes_bank_account_id_bank_accounts_id_fk` FOREIGN KEY (`bank_account_id`) REFERENCES `bank_accounts`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `delivery_challan_items` ADD CONSTRAINT `delivery_challan_items_item_id_items_item_id_fk` FOREIGN KEY (`item_id`) REFERENCES `items`(`item_id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `delivery_challan_items` ADD CONSTRAINT `fk_delivery_challan_items_challan` FOREIGN KEY (`challan_id`) REFERENCES `delivery_challans`(`challan_id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `delivery_challans` ADD CONSTRAINT `delivery_challans_party_id_parties_party_id_fk` FOREIGN KEY (`party_id`) REFERENCES `parties`(`party_id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `delivery_challans` ADD CONSTRAINT `delivery_challans_warehouse_id_warehouses_warehouse_id_fk` FOREIGN KEY (`warehouse_id`) REFERENCES `warehouses`(`warehouse_id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `expenses` ADD CONSTRAINT `expenses_category_id_expense_categories_category_id_fk` FOREIGN KEY (`category_id`) REFERENCES `expense_categories`(`category_id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `expenses` ADD CONSTRAINT `expenses_party_id_parties_party_id_fk` FOREIGN KEY (`party_id`) REFERENCES `parties`(`party_id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `expenses` ADD CONSTRAINT `expenses_bank_account_id_bank_accounts_id_fk` FOREIGN KEY (`bank_account_id`) REFERENCES `bank_accounts`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `payment_allocations` ADD CONSTRAINT `payment_allocations_payment_id_payments_payment_id_fk` FOREIGN KEY (`payment_id`) REFERENCES `payments`(`payment_id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `payments` ADD CONSTRAINT `payments_party_id_parties_party_id_fk` FOREIGN KEY (`party_id`) REFERENCES `parties`(`party_id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `payments` ADD CONSTRAINT `payments_bank_account_id_bank_accounts_id_fk` FOREIGN KEY (`bank_account_id`) REFERENCES `bank_accounts`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `purchase_bill_details` ADD CONSTRAINT `purchase_bill_details_bill_id_purchase_bills_bill_id_fk` FOREIGN KEY (`bill_id`) REFERENCES `purchase_bills`(`bill_id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `purchase_bill_details` ADD CONSTRAINT `purchase_bill_details_item_id_items_item_id_fk` FOREIGN KEY (`item_id`) REFERENCES `items`(`item_id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `purchase_bill_details` ADD CONSTRAINT `purchase_bill_details_variant_id_attribute_values_value_id_fk` FOREIGN KEY (`variant_id`) REFERENCES `attribute_values`(`value_id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `purchase_bill_details` ADD CONSTRAINT `purchase_bill_details_unit_id_units_unit_id_fk` FOREIGN KEY (`unit_id`) REFERENCES `units`(`unit_id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `purchase_bills` ADD CONSTRAINT `purchase_bills_party_id_parties_party_id_fk` FOREIGN KEY (`party_id`) REFERENCES `parties`(`party_id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `purchase_bills` ADD CONSTRAINT `purchase_bills_bank_account_id_bank_accounts_id_fk` FOREIGN KEY (`bank_account_id`) REFERENCES `bank_accounts`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `purchase_bills` ADD CONSTRAINT `purchase_bills_warehouse_id_warehouses_warehouse_id_fk` FOREIGN KEY (`warehouse_id`) REFERENCES `warehouses`(`warehouse_id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `purchase_order_details` ADD CONSTRAINT `purchase_order_details_order_id_purchase_orders_order_id_fk` FOREIGN KEY (`order_id`) REFERENCES `purchase_orders`(`order_id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `purchase_order_details` ADD CONSTRAINT `purchase_order_details_item_id_items_item_id_fk` FOREIGN KEY (`item_id`) REFERENCES `items`(`item_id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `purchase_order_details` ADD CONSTRAINT `purchase_order_details_variant_id_attribute_values_value_id_fk` FOREIGN KEY (`variant_id`) REFERENCES `attribute_values`(`value_id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `purchase_order_details` ADD CONSTRAINT `purchase_order_details_unit_id_units_unit_id_fk` FOREIGN KEY (`unit_id`) REFERENCES `units`(`unit_id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `purchase_orders` ADD CONSTRAINT `purchase_orders_party_id_parties_party_id_fk` FOREIGN KEY (`party_id`) REFERENCES `parties`(`party_id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `purchase_orders` ADD CONSTRAINT `purchase_orders_warehouse_id_warehouses_warehouse_id_fk` FOREIGN KEY (`warehouse_id`) REFERENCES `warehouses`(`warehouse_id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sales_invoice_details` ADD CONSTRAINT `sales_invoice_details_invoice_id_sales_invoices_invoice_id_fk` FOREIGN KEY (`invoice_id`) REFERENCES `sales_invoices`(`invoice_id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sales_invoice_details` ADD CONSTRAINT `sales_invoice_details_item_id_items_item_id_fk` FOREIGN KEY (`item_id`) REFERENCES `items`(`item_id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sales_invoice_details` ADD CONSTRAINT `sales_invoice_details_variant_id_attribute_values_value_id_fk` FOREIGN KEY (`variant_id`) REFERENCES `attribute_values`(`value_id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sales_invoice_details` ADD CONSTRAINT `sales_invoice_details_unit_id_units_unit_id_fk` FOREIGN KEY (`unit_id`) REFERENCES `units`(`unit_id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sales_invoices` ADD CONSTRAINT `sales_invoices_party_id_parties_party_id_fk` FOREIGN KEY (`party_id`) REFERENCES `parties`(`party_id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sales_invoices` ADD CONSTRAINT `sales_invoices_bank_account_id_bank_accounts_id_fk` FOREIGN KEY (`bank_account_id`) REFERENCES `bank_accounts`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sales_invoices` ADD CONSTRAINT `sales_invoices_warehouse_id_warehouses_warehouse_id_fk` FOREIGN KEY (`warehouse_id`) REFERENCES `warehouses`(`warehouse_id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sales_order_details` ADD CONSTRAINT `sales_order_details_order_id_sales_orders_order_id_fk` FOREIGN KEY (`order_id`) REFERENCES `sales_orders`(`order_id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sales_order_details` ADD CONSTRAINT `sales_order_details_item_id_items_item_id_fk` FOREIGN KEY (`item_id`) REFERENCES `items`(`item_id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sales_order_details` ADD CONSTRAINT `sales_order_details_variant_id_attribute_values_value_id_fk` FOREIGN KEY (`variant_id`) REFERENCES `attribute_values`(`value_id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sales_order_details` ADD CONSTRAINT `sales_order_details_unit_id_units_unit_id_fk` FOREIGN KEY (`unit_id`) REFERENCES `units`(`unit_id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sales_orders` ADD CONSTRAINT `sales_orders_party_id_parties_party_id_fk` FOREIGN KEY (`party_id`) REFERENCES `parties`(`party_id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sales_orders` ADD CONSTRAINT `sales_orders_warehouse_id_warehouses_warehouse_id_fk` FOREIGN KEY (`warehouse_id`) REFERENCES `warehouses`(`warehouse_id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sales_quotation_details` ADD CONSTRAINT `sales_quotation_details_item_id_items_item_id_fk` FOREIGN KEY (`item_id`) REFERENCES `items`(`item_id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sales_quotation_details` ADD CONSTRAINT `sales_quotation_details_variant_id_attribute_values_value_id_fk` FOREIGN KEY (`variant_id`) REFERENCES `attribute_values`(`value_id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sales_quotation_details` ADD CONSTRAINT `sales_quotation_details_unit_id_units_unit_id_fk` FOREIGN KEY (`unit_id`) REFERENCES `units`(`unit_id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sales_quotation_details` ADD CONSTRAINT `fk_sales_quotation_details_quotation` FOREIGN KEY (`quotation_id`) REFERENCES `sales_quotations`(`quotation_id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sales_quotations` ADD CONSTRAINT `sales_quotations_party_id_parties_party_id_fk` FOREIGN KEY (`party_id`) REFERENCES `parties`(`party_id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sales_quotations` ADD CONSTRAINT `sales_quotations_warehouse_id_warehouses_warehouse_id_fk` FOREIGN KEY (`warehouse_id`) REFERENCES `warehouses`(`warehouse_id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `idx_cheque_date_status` ON `cheque_register` (`cheque_date`,`status`);--> statement-breakpoint
CREATE INDEX `idx_cheque_reminder_status` ON `cheque_register` (`reminder_date`,`status`);--> statement-breakpoint
CREATE INDEX `idx_cheque_type_date` ON `cheque_register` (`cheque_type`,`cheque_date`);--> statement-breakpoint
CREATE INDEX `idx_cheque_party` ON `cheque_register` (`party_id`);--> statement-breakpoint
CREATE INDEX `idx_cheque_bank` ON `cheque_register` (`bank_account_id`);--> statement-breakpoint
CREATE INDEX `idx_cnd_cn_id` ON `credit_note_details` (`credit_note_id`);--> statement-breakpoint
CREATE INDEX `idx_cnd_item` ON `credit_note_details` (`item_id`);--> statement-breakpoint
CREATE INDEX `idx_cn_date` ON `credit_notes` (`credit_note_date`);--> statement-breakpoint
CREATE INDEX `idx_cn_party_id` ON `credit_notes` (`party_id`);--> statement-breakpoint
CREATE INDEX `idx_cn_party_date_status` ON `credit_notes` (`party_id`,`credit_note_date`,`status`);--> statement-breakpoint
CREATE INDEX `idx_cn_type_date` ON `credit_notes` (`credit_note_type`,`credit_note_date`);--> statement-breakpoint
CREATE INDEX `idx_dnd_dn_id` ON `debit_note_details` (`debit_note_id`);--> statement-breakpoint
CREATE INDEX `idx_dnd_item` ON `debit_note_details` (`item_id`);--> statement-breakpoint
CREATE INDEX `idx_dn_date` ON `debit_notes` (`debit_note_date`);--> statement-breakpoint
CREATE INDEX `idx_dn_party_id` ON `debit_notes` (`party_id`);--> statement-breakpoint
CREATE INDEX `idx_dn_party_date_status` ON `debit_notes` (`party_id`,`debit_note_date`,`status`);--> statement-breakpoint
CREATE INDEX `idx_dci_challan` ON `delivery_challan_items` (`challan_id`);--> statement-breakpoint
CREATE INDEX `idx_dci_item` ON `delivery_challan_items` (`item_id`);--> statement-breakpoint
CREATE INDEX `idx_dc_date` ON `delivery_challans` (`challan_date`);--> statement-breakpoint
CREATE INDEX `idx_dc_party` ON `delivery_challans` (`party_id`);--> statement-breakpoint
CREATE INDEX `idx_dc_status` ON `delivery_challans` (`status`);--> statement-breakpoint
CREATE INDEX `idx_dc_party_date_status` ON `delivery_challans` (`party_id`,`challan_date`,`status`);--> statement-breakpoint
CREATE INDEX `idx_dc_source` ON `delivery_challans` (`source_type`,`source_id`);--> statement-breakpoint
CREATE INDEX `idx_expense_party_number` ON `expenses` (`party_id`,`expense_number`);--> statement-breakpoint
CREATE INDEX `idx_expense_date` ON `expenses` (`expense_date`);--> statement-breakpoint
CREATE INDEX `idx_expense_category_id` ON `expenses` (`category_id`);--> statement-breakpoint
CREATE INDEX `idx_expense_party_id` ON `expenses` (`party_id`);--> statement-breakpoint
CREATE INDEX `idx_expense_date_status` ON `expenses` (`expense_date`,`status`);--> statement-breakpoint
CREATE INDEX `idx_expense_bank_date` ON `expenses` (`bank_account_id`,`expense_date`);--> statement-breakpoint
CREATE INDEX `idx_pa_document` ON `payment_allocations` (`document_type`,`document_id`);--> statement-breakpoint
CREATE INDEX `idx_pa_payment` ON `payment_allocations` (`payment_id`);--> statement-breakpoint
CREATE INDEX `idx_payment_date` ON `payments` (`payment_date`);--> statement-breakpoint
CREATE INDEX `idx_payment_type` ON `payments` (`payment_type`);--> statement-breakpoint
CREATE INDEX `idx_payment_party_type_date` ON `payments` (`party_id`,`payment_type`,`payment_date`);--> statement-breakpoint
CREATE INDEX `idx_payment_bank_date` ON `payments` (`bank_account_id`,`payment_date`);--> statement-breakpoint
CREATE INDEX `idx_pbd_bill_id` ON `purchase_bill_details` (`bill_id`);--> statement-breakpoint
CREATE INDEX `idx_pbd_item_id` ON `purchase_bill_details` (`item_id`);--> statement-breakpoint
CREATE INDEX `idx_pbd_variant_id` ON `purchase_bill_details` (`variant_id`);--> statement-breakpoint
CREATE INDEX `idx_bill_date` ON `purchase_bills` (`bill_date`);--> statement-breakpoint
CREATE INDEX `idx_bill_party_id` ON `purchase_bills` (`party_id`);--> statement-breakpoint
CREATE INDEX `idx_bill_bank_account_id` ON `purchase_bills` (`bank_account_id`);--> statement-breakpoint
CREATE INDEX `idx_bill_status` ON `purchase_bills` (`status`);--> statement-breakpoint
CREATE INDEX `idx_pb_party_date_status` ON `purchase_bills` (`party_id`,`bill_date`,`status`);--> statement-breakpoint
CREATE INDEX `idx_pod_order` ON `purchase_order_details` (`order_id`);--> statement-breakpoint
CREATE INDEX `idx_pod_item` ON `purchase_order_details` (`item_id`);--> statement-breakpoint
CREATE INDEX `idx_pod_variant` ON `purchase_order_details` (`variant_id`);--> statement-breakpoint
CREATE INDEX `idx_purchase_order_date` ON `purchase_orders` (`order_date`);--> statement-breakpoint
CREATE INDEX `idx_purchase_order_party` ON `purchase_orders` (`party_id`);--> statement-breakpoint
CREATE INDEX `idx_purchase_order_status` ON `purchase_orders` (`status`);--> statement-breakpoint
CREATE INDEX `idx_po_party_date_status` ON `purchase_orders` (`party_id`,`order_date`,`status`);--> statement-breakpoint
CREATE INDEX `idx_sales_invoice_details_invoice_id` ON `sales_invoice_details` (`invoice_id`);--> statement-breakpoint
CREATE INDEX `idx_sales_invoice_details_item_id` ON `sales_invoice_details` (`item_id`);--> statement-breakpoint
CREATE INDEX `idx_sales_invoice_details_variant_id` ON `sales_invoice_details` (`variant_id`);--> statement-breakpoint
CREATE INDEX `idx_sales_invoice_date` ON `sales_invoices` (`invoice_date`);--> statement-breakpoint
CREATE INDEX `idx_sales_invoice_party_id` ON `sales_invoices` (`party_id`);--> statement-breakpoint
CREATE INDEX `idx_sales_invoice_bank_account_id` ON `sales_invoices` (`bank_account_id`);--> statement-breakpoint
CREATE INDEX `idx_sales_invoice_status` ON `sales_invoices` (`status`);--> statement-breakpoint
CREATE INDEX `idx_si_party_date_status` ON `sales_invoices` (`party_id`,`invoice_date`,`status`);--> statement-breakpoint
CREATE INDEX `idx_sod_order` ON `sales_order_details` (`order_id`);--> statement-breakpoint
CREATE INDEX `idx_sod_item` ON `sales_order_details` (`item_id`);--> statement-breakpoint
CREATE INDEX `idx_sod_variant` ON `sales_order_details` (`variant_id`);--> statement-breakpoint
CREATE INDEX `idx_sales_order_date` ON `sales_orders` (`order_date`);--> statement-breakpoint
CREATE INDEX `idx_sales_order_party` ON `sales_orders` (`party_id`);--> statement-breakpoint
CREATE INDEX `idx_sales_order_status` ON `sales_orders` (`status`);--> statement-breakpoint
CREATE INDEX `idx_so_party_date_status` ON `sales_orders` (`party_id`,`order_date`,`status`);--> statement-breakpoint
CREATE INDEX `idx_sqd_quotation` ON `sales_quotation_details` (`quotation_id`);--> statement-breakpoint
CREATE INDEX `idx_sqd_item` ON `sales_quotation_details` (`item_id`);--> statement-breakpoint
CREATE INDEX `idx_sqd_variant` ON `sales_quotation_details` (`variant_id`);--> statement-breakpoint
CREATE INDEX `idx_sales_quotation_date` ON `sales_quotations` (`quotation_date`);--> statement-breakpoint
CREATE INDEX `idx_sales_quotation_party` ON `sales_quotations` (`party_id`);--> statement-breakpoint
CREATE INDEX `idx_sales_quotation_status` ON `sales_quotations` (`status`);--> statement-breakpoint
CREATE INDEX `idx_sq_party_date_status` ON `sales_quotations` (`party_id`,`quotation_date`,`status`);