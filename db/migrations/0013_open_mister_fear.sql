CREATE TABLE `audit_log` (
	`id` int AUTO_INCREMENT NOT NULL,
	`at` timestamp NOT NULL DEFAULT (now()),
	`user_id` int,
	`username` varchar(191) NOT NULL,
	`entity` varchar(24) NOT NULL,
	`entity_id` int,
	`asset_id` int,
	`action` varchar(16) NOT NULL,
	`summary` varchar(255) NOT NULL,
	`detail` text,
	CONSTRAINT `audit_log_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `ix_audit_asset` ON `audit_log` (`asset_id`,`id`);--> statement-breakpoint
CREATE INDEX `ix_audit_entity` ON `audit_log` (`entity`,`id`);