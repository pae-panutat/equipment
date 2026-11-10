DROP INDEX `ix_plan_asset` ON `maintenance_plans`;--> statement-breakpoint
DROP INDEX `ix_wo_asset` ON `work_orders`;--> statement-breakpoint
DROP INDEX `ix_wo_status_due` ON `work_orders`;--> statement-breakpoint
DROP INDEX `ix_wo_completed` ON `work_orders`;--> statement-breakpoint
CREATE INDEX `ix_asset_status` ON `assets` (`status`);--> statement-breakpoint
CREATE INDEX `ix_asset_name` ON `assets` (`name`);--> statement-breakpoint
CREATE INDEX `ix_plan_asset_due` ON `maintenance_plans` (`asset_id`,`active`,`next_due_date`);--> statement-breakpoint
CREATE INDEX `ix_wo_asset_status` ON `work_orders` (`asset_id`,`status`,`performed_on`);--> statement-breakpoint
CREATE INDEX `ix_wo_status_performed` ON `work_orders` (`status`,`performed_on`);