CREATE TABLE `supervisor_branches` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `supervisor_id` BIGINT UNSIGNED NOT NULL,
  `branch_id` BIGINT UNSIGNED NOT NULL,
  `assigned_by_id` BIGINT UNSIGNED NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `supervisor_branches_supervisor_id_branch_id_key` (`supervisor_id`, `branch_id`),
  INDEX `supervisor_branches_supervisor_id_idx` (`supervisor_id`),
  INDEX `supervisor_branches_branch_id_idx` (`branch_id`),
  INDEX `supervisor_branches_assigned_by_id_idx` (`assigned_by_id`),
  PRIMARY KEY (`id`),
  CONSTRAINT `supervisor_branches_supervisor_id_fkey` FOREIGN KEY (`supervisor_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `supervisor_branches_branch_id_fkey` FOREIGN KEY (`branch_id`) REFERENCES `branches` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `supervisor_branches_assigned_by_id_fkey` FOREIGN KEY (`assigned_by_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
