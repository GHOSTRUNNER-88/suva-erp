ALTER TABLE `parties` ADD `opening_balance` decimal(14,2) DEFAULT '0.00' NOT NULL;--> statement-breakpoint
ALTER TABLE `parties` ADD `opening_balance_type` enum('Dr','Cr') DEFAULT 'Dr' NOT NULL;--> statement-breakpoint
ALTER TABLE `parties` ADD `balance` decimal(14,2) DEFAULT '0.00' NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_party_balance` ON `parties` (`balance`);