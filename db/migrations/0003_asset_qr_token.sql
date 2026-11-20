ALTER TABLE `assets` ADD `qr_token` varchar(32);--> statement-breakpoint
ALTER TABLE `assets` ADD CONSTRAINT `uq_asset_qr_token` UNIQUE(`qr_token`);