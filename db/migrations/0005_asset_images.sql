CREATE TABLE `asset_images` (
	`id` int AUTO_INCREMENT NOT NULL,
	`asset_id` int NOT NULL,
	`file_name` varchar(64) NOT NULL,
	`thumb_name` varchar(64) NOT NULL,
	`content_type` varchar(32) NOT NULL,
	`size_bytes` int NOT NULL,
	`width` int NOT NULL,
	`height` int NOT NULL,
	`created_by` int,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `asset_images_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `ix_asset_image_asset` ON `asset_images` (`asset_id`,`id`);