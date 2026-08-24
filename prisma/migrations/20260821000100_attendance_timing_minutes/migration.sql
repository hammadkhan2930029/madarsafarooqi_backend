ALTER TABLE `teacher_attendance` ADD COLUMN `late_minutes` SMALLINT UNSIGNED NOT NULL DEFAULT 0 AFTER `is_late`;
ALTER TABLE `payroll_settings` ADD COLUMN `late_grace_minutes` SMALLINT UNSIGNED NOT NULL DEFAULT 0 AFTER `late_count_rule`;
ALTER TABLE `salaries` ADD COLUMN `late_minutes` INT UNSIGNED NOT NULL DEFAULT 0 AFTER `late_days`;
