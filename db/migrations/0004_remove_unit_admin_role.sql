-- The "unit_admin" role is removed. Anyone still holding it becomes a viewer (without this, the ALTER would fail on such rows).
UPDATE `users` SET `role` = 'viewer' WHERE `role` = 'unit_admin';--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `role` enum('super_admin','technician','viewer') NOT NULL DEFAULT 'viewer';
