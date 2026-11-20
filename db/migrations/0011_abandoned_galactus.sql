DELETE FROM `users` WHERE `deleted_at` IS NOT NULL;--> statement-breakpoint
ALTER TABLE `users` DROP COLUMN `deleted_at`;