CREATE TABLE `app_meta` (
	`meta_key` varchar(64) NOT NULL,
	`meta_value` varchar(255) NOT NULL,
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `app_meta_meta_key` PRIMARY KEY(`meta_key`)
);
--> statement-breakpoint
CREATE TABLE `asset_types` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` varchar(32) NOT NULL,
	`name` varchar(120) NOT NULL,
	`archived_at` datetime,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `asset_types_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_asset_type_code` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `assets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` varchar(40) NOT NULL,
	`legacy_asset_no` varchar(60),
	`name` varchar(191) NOT NULL,
	`type_id` int NOT NULL,
	`brand` varchar(120),
	`model` varchar(120),
	`serial_number` varchar(120),
	`owner_unit_id` int NOT NULL,
	`location_id` int,
	`location_detail` varchar(255),
	`status` enum('active','faulty','under_repair','inactive','disposed') NOT NULL DEFAULT 'active',
	`purchase_date` date,
	`install_date` date,
	`price` decimal(12,2),
	`vendor` varchar(191),
	`warranty_end` date,
	`attributes` text,
	`notes` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `assets_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_asset_code` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `locations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`parent_id` int,
	`kind` varchar(16) NOT NULL,
	`code` varchar(32) NOT NULL,
	`name` varchar(191) NOT NULL,
	`archived_at` datetime,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `locations_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_loc_code` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `maintenance_plans` (
	`id` int AUTO_INCREMENT NOT NULL,
	`asset_id` int NOT NULL,
	`title` varchar(191) NOT NULL,
	`interval_value` int NOT NULL,
	`interval_unit` enum('day','month') NOT NULL,
	`start_date` date NOT NULL,
	`next_due_date` date,
	`active` int NOT NULL DEFAULT 1,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `maintenance_plans_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `organization_units` (
	`id` int AUTO_INCREMENT NOT NULL,
	`parent_id` int,
	`code` varchar(32) NOT NULL,
	`name` varchar(191) NOT NULL,
	`archived_at` datetime,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `organization_units_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_org_code` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `work_orders` (
	`id` int AUTO_INCREMENT NOT NULL,
	`number` varchar(32) NOT NULL,
	`asset_id` int NOT NULL,
	`plan_id` int,
	`kind` enum('planned','repair','inspection') NOT NULL,
	`status` enum('open','assigned','in_progress','done','cancelled') NOT NULL DEFAULT 'open',
	`priority` enum('low','normal','high','urgent') NOT NULL DEFAULT 'normal',
	`title` varchar(191) NOT NULL,
	`description` text,
	`due_date` date,
	`performed_on` date,
	`completed_at` datetime,
	`labor_cost` decimal(12,2),
	`parts_cost` decimal(12,2),
	`other_cost` decimal(12,2),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `work_orders_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_wo_number` UNIQUE(`number`)
);
--> statement-breakpoint
CREATE INDEX `ix_asset_owner_type_status` ON `assets` (`owner_unit_id`,`type_id`,`status`);--> statement-breakpoint
CREATE INDEX `ix_asset_type` ON `assets` (`type_id`);--> statement-breakpoint
CREATE INDEX `ix_asset_location` ON `assets` (`location_id`);--> statement-breakpoint
CREATE INDEX `ix_loc_parent` ON `locations` (`parent_id`);--> statement-breakpoint
CREATE INDEX `ix_plan_asset` ON `maintenance_plans` (`asset_id`);--> statement-breakpoint
CREATE INDEX `ix_plan_due` ON `maintenance_plans` (`active`,`next_due_date`);--> statement-breakpoint
CREATE INDEX `ix_org_parent` ON `organization_units` (`parent_id`);--> statement-breakpoint
CREATE INDEX `ix_wo_asset` ON `work_orders` (`asset_id`,`performed_on`);--> statement-breakpoint
CREATE INDEX `ix_wo_status_due` ON `work_orders` (`status`,`due_date`);--> statement-breakpoint
CREATE INDEX `ix_wo_completed` ON `work_orders` (`completed_at`);