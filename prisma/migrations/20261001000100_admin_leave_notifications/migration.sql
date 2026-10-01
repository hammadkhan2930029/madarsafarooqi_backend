CREATE TABLE `admin_notifications` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `recipient_user_id` BIGINT UNSIGNED NOT NULL,
  `leave_request_id` BIGINT UNSIGNED NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `admin_notifications_recipient_user_id_leave_request_id_key` (`recipient_user_id`, `leave_request_id`),
  KEY `admin_notifications_recipient_user_id_created_at_idx` (`recipient_user_id`, `created_at`),
  KEY `admin_notifications_leave_request_id_idx` (`leave_request_id`),
  CONSTRAINT `admin_notifications_recipient_user_id_fkey` FOREIGN KEY (`recipient_user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `admin_notifications_leave_request_id_fkey` FOREIGN KEY (`leave_request_id`) REFERENCES `leave_requests` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
