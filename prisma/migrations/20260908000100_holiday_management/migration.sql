CREATE TABLE `holidays` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `title` VARCHAR(200) NOT NULL,
  `description` TEXT NULL,
  `start_date` DATE NOT NULL,
  `end_date` DATE NOT NULL,
  `affects_attendance` BOOLEAN NOT NULL DEFAULT true,
  `status` ENUM('ACTIVE', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE',
  `created_by_id` BIGINT UNSIGNED NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  INDEX `holidays_start_date_idx`(`start_date`),
  INDEX `holidays_end_date_idx`(`end_date`),
  INDEX `holidays_status_idx`(`status`),
  INDEX `holidays_affects_attendance_idx`(`affects_attendance`),
  INDEX `holidays_created_by_id_idx`(`created_by_id`),
  PRIMARY KEY (`id`),
  CONSTRAINT `holidays_created_by_id_fkey` FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
