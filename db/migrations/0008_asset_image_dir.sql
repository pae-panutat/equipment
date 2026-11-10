-- Each photo row now records its own folder (assets/<unit folder>/<assetId>).
ALTER TABLE `asset_images` ADD `dir` varchar(160) DEFAULT '' NOT NULL;--> statement-breakpoint
-- Photos stored before this change live in assets/<assetId>: keep pointing at them.
UPDATE `asset_images` SET `dir` = CONCAT('assets/', `asset_id`) WHERE `dir` = '';
