CREATE TABLE `bank_accounts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`display_name` varchar(150),
	`bank_name` varchar(150) NOT NULL,
	`opening_balance` decimal(15,2) NOT NULL DEFAULT '0.00',
	`as_of_date` date NOT NULL,
	`print_on_invoice` tinyint NOT NULL DEFAULT 0,
	`account_number` varchar(100),
	`account_holder_name` varchar(150),
	`branch` varchar(150),
	`qr_code_url` varchar(500),
	`status` enum('active','inactive') NOT NULL DEFAULT 'active',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `bank_accounts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `bank_transactions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`bank_account_id` int NOT NULL,
	`txn_date` date NOT NULL,
	`txn_type` enum('credit','debit') NOT NULL,
	`transaction_type` enum('sales','purchase','payment_in','payment_out','expense','opening_balance','transfer','credit_note','debit_note','manual','vat_payment') NOT NULL,
	`transaction_ref_id` int,
	`amount` decimal(15,2) NOT NULL,
	`reference_no` varchar(100),
	`note` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `bank_transactions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `bank_transactions` ADD CONSTRAINT `bank_transactions_bank_account_id_bank_accounts_id_fk` FOREIGN KEY (`bank_account_id`) REFERENCES `bank_accounts`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `idx_bank_status_name` ON `bank_accounts` (`status`,`bank_name`,`display_name`);--> statement-breakpoint
CREATE INDEX `idx_bank_print_status` ON `bank_accounts` (`print_on_invoice`,`status`);--> statement-breakpoint
CREATE INDEX `idx_bank_account_id` ON `bank_transactions` (`bank_account_id`);--> statement-breakpoint
CREATE INDEX `idx_transaction_type` ON `bank_transactions` (`transaction_type`);--> statement-breakpoint
CREATE INDEX `idx_transaction_ref_id` ON `bank_transactions` (`transaction_ref_id`);--> statement-breakpoint
CREATE INDEX `idx_txn_date` ON `bank_transactions` (`txn_date`);--> statement-breakpoint
CREATE INDEX `idx_bt_account_date_id` ON `bank_transactions` (`bank_account_id`,`txn_date`,`id`);--> statement-breakpoint
CREATE INDEX `idx_bt_type_ref` ON `bank_transactions` (`transaction_type`,`transaction_ref_id`);--> statement-breakpoint
CREATE INDEX `idx_bt_date_id` ON `bank_transactions` (`txn_date`,`id`);