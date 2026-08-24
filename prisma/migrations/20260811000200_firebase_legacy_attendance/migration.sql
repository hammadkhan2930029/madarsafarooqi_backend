ALTER TABLE `teacher_attendance`
  MODIFY `branch_id` BIGINT UNSIGNED NULL,
  MODIFY `class_id` BIGINT UNSIGNED NULL,
  ADD COLUMN `legacy_firebase_id` VARCHAR(150) NULL,
  ADD UNIQUE INDEX `teacher_attendance_legacy_firebase_id_key` (`legacy_firebase_id`);
