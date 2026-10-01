ALTER TABLE `users`
  ADD COLUMN `attendance_allowance` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  ADD COLUMN `attendance_allowance_enabled` BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN `conveyance_allowance` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  ADD COLUMN `medical_allowance` DECIMAL(12,2) NOT NULL DEFAULT 0.00;

ALTER TABLE `salaries`
  ADD COLUMN `attendance_allowance` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  ADD COLUMN `conveyance_allowance` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  ADD COLUMN `medical_allowance` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  ADD COLUMN `gross_amount` DECIMAL(12,2) NOT NULL DEFAULT 0.00;

UPDATE `salaries`
SET `gross_amount` = `base_salary` + `allowance`
WHERE `gross_amount` = 0.00;
