-- Job status is now only "in_progress" or "done".
-- Jobs that were waiting (open / assigned) are unfinished, so they become in progress.
UPDATE `work_orders` SET `status` = 'in_progress' WHERE `status` IN ('open', 'assigned');--> statement-breakpoint
-- Cancelled jobs are kept (nothing is deleted): they become done, and the note says what they used to be.
UPDATE `work_orders` SET `status` = 'done',
  `performed_on` = COALESCE(`performed_on`, DATE(`created_at`)),
  `completed_at` = COALESCE(`completed_at`, `created_at`),
  `description` = CONCAT(COALESCE(`description`, ''), IF(COALESCE(`description`, '') = '', '', '\n'), '[สถานะเดิม: ยกเลิก]')
WHERE `status` = 'cancelled';--> statement-breakpoint
ALTER TABLE `work_orders` MODIFY COLUMN `status` enum('in_progress','done') NOT NULL DEFAULT 'in_progress';
