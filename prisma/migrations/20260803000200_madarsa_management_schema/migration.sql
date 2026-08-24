CREATE TABLE `branches` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, `name` VARCHAR(150) NOT NULL, `code` VARCHAR(50) NOT NULL,
  `address` VARCHAR(500) NULL, `contact` VARCHAR(30) NULL, `status` ENUM('ACTIVE', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE',
  `created_by_id` BIGINT UNSIGNED NOT NULL, `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `updated_at` DATETIME(3) NOT NULL,
  UNIQUE INDEX `branches_code_key` (`code`), INDEX `branches_status_idx` (`status`), INDEX `branches_created_by_id_idx` (`created_by_id`), PRIMARY KEY (`id`),
  CONSTRAINT `branches_created_by_id_fkey` FOREIGN KEY (`created_by_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `classes` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, `name` VARCHAR(150) NOT NULL, `normalized_name` VARCHAR(150) NOT NULL,
  `branch_id` BIGINT UNSIGNED NOT NULL, `status` ENUM('ACTIVE', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE', `created_by_id` BIGINT UNSIGNED NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `updated_at` DATETIME(3) NOT NULL,
  UNIQUE INDEX `classes_branch_id_normalized_name_key` (`branch_id`, `normalized_name`), INDEX `classes_branch_id_idx` (`branch_id`),
  INDEX `classes_status_idx` (`status`), INDEX `classes_created_by_id_idx` (`created_by_id`), PRIMARY KEY (`id`),
  CONSTRAINT `classes_branch_id_fkey` FOREIGN KEY (`branch_id`) REFERENCES `branches` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `classes_created_by_id_fkey` FOREIGN KEY (`created_by_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `users`
  ADD COLUMN `email` VARCHAR(191) NULL, ADD COLUMN `contact` VARCHAR(30) NULL, ADD COLUMN `branch_id` BIGINT UNSIGNED NULL,
  ADD COLUMN `class_id` BIGINT UNSIGNED NULL, ADD COLUMN `timing` VARCHAR(50) NULL, ADD COLUMN `base_salary` DECIMAL(12, 2) NULL,
  ADD COLUMN `legacy_firebase_uid` VARCHAR(128) NULL, ADD UNIQUE INDEX `users_email_key` (`email`),
  ADD UNIQUE INDEX `users_legacy_firebase_uid_key` (`legacy_firebase_uid`), ADD INDEX `users_role_idx` (`role`),
  ADD INDEX `users_status_idx` (`status`), ADD INDEX `users_branch_id_idx` (`branch_id`), ADD INDEX `users_class_id_idx` (`class_id`),
  ADD CONSTRAINT `users_branch_id_fkey` FOREIGN KEY (`branch_id`) REFERENCES `branches` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `users_class_id_fkey` FOREIGN KEY (`class_id`) REFERENCES `classes` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE `students` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, `admission_no` VARCHAR(60) NOT NULL, `name` VARCHAR(150) NOT NULL,
  `father_name` VARCHAR(150) NOT NULL, `contact` VARCHAR(30) NULL, `branch_id` BIGINT UNSIGNED NOT NULL, `class_id` BIGINT UNSIGNED NOT NULL,
  `status` ENUM('ACTIVE', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE', `created_by_id` BIGINT UNSIGNED NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `updated_at` DATETIME(3) NOT NULL,
  UNIQUE INDEX `students_admission_no_key` (`admission_no`), INDEX `students_status_idx` (`status`), INDEX `students_branch_id_idx` (`branch_id`),
  INDEX `students_class_id_idx` (`class_id`), INDEX `students_created_by_id_idx` (`created_by_id`), PRIMARY KEY (`id`),
  CONSTRAINT `students_branch_id_fkey` FOREIGN KEY (`branch_id`) REFERENCES `branches` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `students_class_id_fkey` FOREIGN KEY (`class_id`) REFERENCES `classes` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `students_created_by_id_fkey` FOREIGN KEY (`created_by_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `teacher_reports` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, `teacher_id` BIGINT UNSIGNED NOT NULL, `branch_id` BIGINT UNSIGNED NOT NULL,
  `class_id` BIGINT UNSIGNED NOT NULL, `report_type` ENUM('DAILY', 'WEEKLY', 'MONTHLY') NOT NULL, `report_period` VARCHAR(20) NOT NULL,
  `content` JSON NOT NULL, `submitted_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `editable_until` DATETIME(3) NOT NULL, `updated_at` DATETIME(3) NOT NULL,
  UNIQUE INDEX `teacher_reports_teacher_id_report_type_report_period_key` (`teacher_id`, `report_type`, `report_period`),
  INDEX `teacher_reports_teacher_id_idx` (`teacher_id`), INDEX `teacher_reports_branch_id_idx` (`branch_id`),
  INDEX `teacher_reports_class_id_idx` (`class_id`), INDEX `teacher_reports_report_type_idx` (`report_type`),
  INDEX `teacher_reports_submitted_at_idx` (`submitted_at`), PRIMARY KEY (`id`),
  CONSTRAINT `teacher_reports_teacher_id_fkey` FOREIGN KEY (`teacher_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `teacher_reports_branch_id_fkey` FOREIGN KEY (`branch_id`) REFERENCES `branches` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `teacher_reports_class_id_fkey` FOREIGN KEY (`class_id`) REFERENCES `classes` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `leave_requests` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, `teacher_id` BIGINT UNSIGNED NOT NULL, `branch_id` BIGINT UNSIGNED NOT NULL,
  `class_id` BIGINT UNSIGNED NOT NULL, `start_date` DATE NOT NULL, `end_date` DATE NOT NULL, `reason` TEXT NOT NULL,
  `status` ENUM('PENDING', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'PENDING', `reviewed_by_id` BIGINT UNSIGNED NULL,
  `reviewed_at` DATETIME(3) NULL, `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `updated_at` DATETIME(3) NOT NULL,
  INDEX `leave_requests_teacher_id_idx` (`teacher_id`), INDEX `leave_requests_branch_id_idx` (`branch_id`),
  INDEX `leave_requests_class_id_idx` (`class_id`), INDEX `leave_requests_status_idx` (`status`),
  INDEX `leave_requests_start_date_idx` (`start_date`), INDEX `leave_requests_end_date_idx` (`end_date`),
  INDEX `leave_requests_reviewed_by_id_idx` (`reviewed_by_id`), PRIMARY KEY (`id`),
  CONSTRAINT `leave_requests_teacher_id_fkey` FOREIGN KEY (`teacher_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `leave_requests_branch_id_fkey` FOREIGN KEY (`branch_id`) REFERENCES `branches` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `leave_requests_class_id_fkey` FOREIGN KEY (`class_id`) REFERENCES `classes` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `leave_requests_reviewed_by_id_fkey` FOREIGN KEY (`reviewed_by_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `teacher_attendance` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, `teacher_id` BIGINT UNSIGNED NOT NULL, `branch_id` BIGINT UNSIGNED NOT NULL,
  `class_id` BIGINT UNSIGNED NOT NULL, `attendance_date` DATE NOT NULL, `timing` VARCHAR(50) NULL,
  `check_in_at` DATETIME(3) NULL, `check_out_at` DATETIME(3) NULL, `is_late` BOOLEAN NULL,
  `status` ENUM('PRESENT', 'INCOMPLETE', 'ABSENT', 'ON_LEAVE') NOT NULL, `leave_request_id` BIGINT UNSIGNED NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `updated_at` DATETIME(3) NOT NULL,
  UNIQUE INDEX `teacher_attendance_teacher_id_attendance_date_key` (`teacher_id`, `attendance_date`),
  INDEX `teacher_attendance_teacher_id_idx` (`teacher_id`), INDEX `teacher_attendance_branch_id_idx` (`branch_id`),
  INDEX `teacher_attendance_class_id_idx` (`class_id`), INDEX `teacher_attendance_attendance_date_idx` (`attendance_date`),
  INDEX `teacher_attendance_status_idx` (`status`), INDEX `teacher_attendance_leave_request_id_idx` (`leave_request_id`), PRIMARY KEY (`id`),
  CONSTRAINT `teacher_attendance_teacher_id_fkey` FOREIGN KEY (`teacher_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `teacher_attendance_branch_id_fkey` FOREIGN KEY (`branch_id`) REFERENCES `branches` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `teacher_attendance_class_id_fkey` FOREIGN KEY (`class_id`) REFERENCES `classes` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `teacher_attendance_leave_request_id_fkey` FOREIGN KEY (`leave_request_id`) REFERENCES `leave_requests` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `payroll_settings` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, `absent_deduction_type` VARCHAR(30) NOT NULL,
  `absent_deduction_value` DECIMAL(12, 2) NOT NULL, `late_deduction_type` VARCHAR(30) NOT NULL,
  `late_deduction_value` DECIMAL(12, 2) NOT NULL, `working_days_mode` VARCHAR(30) NOT NULL,
  `allow_negative_salary` BOOLEAN NOT NULL DEFAULT false, `calculation_version` INTEGER NOT NULL DEFAULT 1,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `updated_at` DATETIME(3) NOT NULL, PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `salaries` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, `teacher_id` BIGINT UNSIGNED NOT NULL, `branch_id` BIGINT UNSIGNED NOT NULL,
  `class_id` BIGINT UNSIGNED NOT NULL, `month` TINYINT UNSIGNED NOT NULL, `year` SMALLINT UNSIGNED NOT NULL,
  `base_salary` DECIMAL(12, 2) NOT NULL, `absent_days` SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  `late_days` SMALLINT UNSIGNED NOT NULL DEFAULT 0, `absent_deduction` DECIMAL(12, 2) NOT NULL DEFAULT 0,
  `late_deduction` DECIMAL(12, 2) NOT NULL DEFAULT 0, `other_adjustment` DECIMAL(12, 2) NOT NULL DEFAULT 0,
  `final_salary` DECIMAL(12, 2) NOT NULL, `calculation_version` INTEGER NOT NULL, `calculation_breakdown` JSON NOT NULL,
  `calculated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `updated_at` DATETIME(3) NOT NULL,
  UNIQUE INDEX `salaries_teacher_id_month_year_key` (`teacher_id`, `month`, `year`), INDEX `salaries_teacher_id_idx` (`teacher_id`),
  INDEX `salaries_branch_id_idx` (`branch_id`), INDEX `salaries_class_id_idx` (`class_id`), INDEX `salaries_month_idx` (`month`),
  INDEX `salaries_year_idx` (`year`), INDEX `salaries_month_year_idx` (`month`, `year`), PRIMARY KEY (`id`),
  CONSTRAINT `salaries_teacher_id_fkey` FOREIGN KEY (`teacher_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `salaries_branch_id_fkey` FOREIGN KEY (`branch_id`) REFERENCES `branches` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `salaries_class_id_fkey` FOREIGN KEY (`class_id`) REFERENCES `classes` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `attendance_corrections` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, `attendance_id` BIGINT UNSIGNED NOT NULL, `teacher_id` BIGINT UNSIGNED NOT NULL,
  `before` JSON NOT NULL, `after` JSON NOT NULL, `reason` VARCHAR(500) NOT NULL, `corrected_by_id` BIGINT UNSIGNED NOT NULL,
  `corrected_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), INDEX `attendance_corrections_attendance_id_idx` (`attendance_id`),
  INDEX `attendance_corrections_teacher_id_idx` (`teacher_id`), INDEX `attendance_corrections_corrected_by_id_idx` (`corrected_by_id`),
  INDEX `attendance_corrections_corrected_at_idx` (`corrected_at`), PRIMARY KEY (`id`),
  CONSTRAINT `attendance_corrections_attendance_id_fkey` FOREIGN KEY (`attendance_id`) REFERENCES `teacher_attendance` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `attendance_corrections_teacher_id_fkey` FOREIGN KEY (`teacher_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `attendance_corrections_corrected_by_id_fkey` FOREIGN KEY (`corrected_by_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `audit_logs` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, `action` VARCHAR(100) NOT NULL, `target_user_id` BIGINT UNSIGNED NULL,
  `performed_by_id` BIGINT UNSIGNED NOT NULL, `metadata` JSON NULL, `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `audit_logs_action_idx` (`action`), INDEX `audit_logs_target_user_id_idx` (`target_user_id`),
  INDEX `audit_logs_performed_by_id_idx` (`performed_by_id`), INDEX `audit_logs_created_at_idx` (`created_at`), PRIMARY KEY (`id`),
  CONSTRAINT `audit_logs_target_user_id_fkey` FOREIGN KEY (`target_user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `audit_logs_performed_by_id_fkey` FOREIGN KEY (`performed_by_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
