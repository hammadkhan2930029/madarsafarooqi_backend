ALTER TABLE `users`
  ADD COLUMN `ijara_frequency` ENUM('MONTHLY','WEEKLY') NOT NULL DEFAULT 'MONTHLY',
  ADD COLUMN `weekly_ijara_amount` DECIMAL(12,2) NULL;

ALTER TABLE `salaries`
  ADD COLUMN `ijara_frequency` ENUM('MONTHLY','WEEKLY') NOT NULL DEFAULT 'MONTHLY',
  ADD COLUMN `agreed_ijara_amount` DECIMAL(12,2) NOT NULL DEFAULT 0.00;

UPDATE `salaries`
SET `agreed_ijara_amount` = `base_salary`
WHERE `agreed_ijara_amount` = 0.00;
