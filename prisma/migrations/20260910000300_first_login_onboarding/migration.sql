ALTER TABLE `users`
  ADD COLUMN `ijara_conditions` JSON NULL,
  ADD COLUMN `onboarding_required` BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN `onboarding_completed_at` DATETIME(3) NULL;

CREATE TABLE `ijara_acceptances` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `terms_version` VARCHAR(50) NOT NULL,
  `answers` JSON NOT NULL,
  `accepted` BOOLEAN NOT NULL,
  `accepted_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `request_metadata` JSON NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `ijara_acceptances_user_id_terms_version_key` (`user_id`, `terms_version`),
  INDEX `ijara_acceptances_user_id_idx` (`user_id`),
  CONSTRAINT `ijara_acceptances_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Existing users intentionally remain exempt. New staff are marked required by the API.
