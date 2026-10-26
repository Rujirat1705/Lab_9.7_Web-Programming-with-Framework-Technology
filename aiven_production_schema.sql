-- ==========================================================
-- Lab 9.7: Aiven Cloud MySQL Schema & Seed Data
-- ==========================================================

CREATE DATABASE IF NOT EXISTS `bookstore_db` 
CHARACTER SET utf8mb4 
COLLATE utf8mb4_unicode_ci;

USE `bookstore_db`;

-- 1. Table users (รองรับ bcrypt hash, email verification และ role สำหรับ RBAC)
CREATE TABLE IF NOT EXISTS `users` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(100) NOT NULL,
  `email` VARCHAR(255) NOT NULL UNIQUE,
  `password` VARCHAR(255) NOT NULL,
  `is_verified` TINYINT(1) DEFAULT 1,
  `verification_token` VARCHAR(255) DEFAULT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `role` VARCHAR(20) DEFAULT 'viewer'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Table books
CREATE TABLE IF NOT EXISTS `books` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `title` VARCHAR(255) NOT NULL,
  `author` VARCHAR(150) NOT NULL,
  `price` DECIMAL(10,2) NOT NULL,
  `stock` INT NOT NULL DEFAULT 0,
  `category` VARCHAR(100),
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. ข้อมูลเริ่มต้นสำหรับทดสอบ RBAC (รหัสผ่านคือ 123456 เข้ารหัสด้วย bcrypt)
-- User A: viewer (GET books เท่านั้น)
-- User B: editor (GET, POST, PUT books)
-- User C: admin  (GET, POST, PUT, DELETE books)
INSERT INTO `users` (`id`, `name`, `email`, `password`, `is_verified`, `role`) VALUES
(10, 'User A (Viewer)', 'usera@test.com', '$2b$10$bU47e3Il.7.gxAjinu1uOOXQnwU9vc0XEQq3mqEF0YoQ1gQfQ12W.', 1, 'viewer'),
(11, 'User B (Editor)', 'userb@test.com', '$2b$10$L9Eb0YkFA295EiY5nVRdHOMf1uTZhTj5lEXkGH16N0750wQkUuL..', 1, 'editor'),
(12, 'User C (Admin)',  'userc@test.com', '$2b$10$q4x53TwdFyLXMai.f2FVl.hY3.7uGw29Wh4PiDVKYiV9E6fM0Xkhe', 1, 'admin')
ON DUPLICATE KEY UPDATE `email`=`email`;

-- 4. ข้อมูลหนังสือเริ่มต้น
INSERT INTO `books` (`id`, `title`, `author`, `price`, `stock`, `category`) VALUES
(1, 'พื้นฐานการเขียนโปรแกรม', 'สมชาย ใจดี', 250.00, 10, 'Programming'),
(2, 'เรียนรู้ IoT ด้วย ESP32', 'วิชัย เทคโน', 320.00, 5, 'IoT'),
(3, 'Data Science เบื้องต้น', 'สมหญิง ข้อมูล', 450.00, 8, 'Data Science')
ON DUPLICATE KEY UPDATE `title`=`title`;
