CREATE TABLE `settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`organization_name` varchar(255) NOT NULL DEFAULT '',
	`address` text,
	`phone` varchar(50),
	`email` varchar(100),
	`pan_number` varchar(50),
	`logo_path` varchar(255),
	`currency_symbol` varchar(10) NOT NULL DEFAULT 'NPR',
	`invoice_prefix` varchar(20) NOT NULL DEFAULT 'INV',
	`bill_prefix` varchar(20) NOT NULL DEFAULT 'BILL',
	`default_vat_enabled` tinyint NOT NULL DEFAULT 1,
	`default_vat_percent` decimal(5,2) NOT NULL DEFAULT '13.00',
	`fiscal_year_start` date,
	`negative_stock_action` tinyint NOT NULL DEFAULT 1,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `settings_id` PRIMARY KEY(`id`)
);
