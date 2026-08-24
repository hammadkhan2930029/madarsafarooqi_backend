-- Add a Teacher Management designation without changing authorization roles.
ALTER TABLE `users`
  ADD COLUMN `teacher_type` ENUM('TEACHER', 'SUPERVISOR') NULL;

-- Preserve all existing Teacher accounts as Teachers by default.
UPDATE `users`
SET `teacher_type` = 'TEACHER'
WHERE `role` = 'TEACHER' AND `teacher_type` IS NULL;
