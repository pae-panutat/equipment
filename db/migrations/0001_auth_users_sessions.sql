CREATE TABLE `sessions` (
	`id` varchar(64) NOT NULL,
	`user_id` int NOT NULL,
	`expires_at` datetime NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `sessions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` int AUTO_INCREMENT NOT NULL,
	`username` varchar(64),
	`password_hash` varchar(255),
	`cmu_email` varchar(191),
	`display_name` varchar(191) NOT NULL,
	`role` enum('super_admin','unit_admin','technician','viewer') NOT NULL DEFAULT 'viewer',
	`unit_id` int,
	`active` int NOT NULL DEFAULT 1,
	`last_login_at` datetime,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_user_username` UNIQUE(`username`),
	CONSTRAINT `uq_user_cmu_email` UNIQUE(`cmu_email`)
);
--> statement-breakpoint
CREATE INDEX `ix_session_user` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE INDEX `ix_session_expires` ON `sessions` (`expires_at`);--> statement-breakpoint
CREATE INDEX `ix_user_unit` ON `users` (`unit_id`);