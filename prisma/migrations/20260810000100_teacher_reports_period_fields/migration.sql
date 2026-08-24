ALTER TABLE `teacher_reports`
  ADD COLUMN `report_date` DATE NULL,
  ADD COLUMN `period_start` DATE NULL,
  ADD COLUMN `period_end` DATE NULL,
  ADD COLUMN `content_json` JSON NULL;

UPDATE `teacher_reports`
SET
  `report_date` = COALESCE(DATE(`submitted_at`), UTC_DATE()),
  `period_start` = COALESCE(DATE(`submitted_at`), UTC_DATE()),
  `period_end` = COALESCE(DATE(`submitted_at`), UTC_DATE()),
  `content_json` = `content`;

ALTER TABLE `teacher_reports`
  DROP INDEX `teacher_reports_teacher_id_report_type_report_period_key`,
  MODIFY `report_date` DATE NOT NULL,
  MODIFY `period_start` DATE NOT NULL,
  MODIFY `period_end` DATE NOT NULL,
  MODIFY `content_json` JSON NOT NULL,
  CHANGE COLUMN `report_period` `legacy_report_period` VARCHAR(20) NULL,
  CHANGE COLUMN `content` `legacy_content` JSON NULL,
  ADD UNIQUE INDEX `teacher_reports_period_unique` (`teacher_id`, `report_type`, `period_start`, `period_end`),
  ADD INDEX `teacher_reports_report_date_idx` (`report_date`),
  ADD INDEX `teacher_reports_period_start_idx` (`period_start`),
  ADD INDEX `teacher_reports_period_end_idx` (`period_end`);
