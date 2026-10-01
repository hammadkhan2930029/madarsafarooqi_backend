ALTER TABLE `teacher_reports`
  ADD COLUMN `status` ENUM('SUBMITTED') NOT NULL DEFAULT 'SUBMITTED',
  ADD COLUMN `last_edited_by_id` BIGINT UNSIGNED NULL,
  ADD COLUMN `last_edited_at` DATETIME(3) NULL,
  ADD INDEX `teacher_reports_status_idx`(`status`),
  ADD INDEX `teacher_reports_last_edited_by_id_idx`(`last_edited_by_id`),
  ADD CONSTRAINT `teacher_reports_last_edited_by_id_fkey` FOREIGN KEY (`last_edited_by_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE `report_edit_history` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `report_id` BIGINT UNSIGNED NOT NULL,
  `original_content_json` JSON NOT NULL,
  `updated_content_json` JSON NOT NULL,
  `edited_by_id` BIGINT UNSIGNED NOT NULL,
  `edited_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `report_edit_history_report_id_idx`(`report_id`),
  INDEX `report_edit_history_edited_by_id_idx`(`edited_by_id`),
  INDEX `report_edit_history_edited_at_idx`(`edited_at`),
  PRIMARY KEY (`id`),
  CONSTRAINT `report_edit_history_report_id_fkey` FOREIGN KEY (`report_id`) REFERENCES `teacher_reports`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `report_edit_history_edited_by_id_fkey` FOREIGN KEY (`edited_by_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
