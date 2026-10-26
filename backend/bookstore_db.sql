-- =============================================
-- Database: bookstore_db
-- ระบบจัดการหนังสือ (Book Management) & ระบบสมาชิก
-- =============================================

CREATE DATABASE IF NOT EXISTS `bookstore_db`
CHARACTER SET utf8mb4
COLLATE utf8mb4_unicode_ci;

USE `bookstore_db`;

-- 1. ตาราง users (สำหรับ Lab 9.2 & Lab 9.3)
CREATE TABLE IF NOT EXISTS `users` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(100) NOT NULL,
  `email` VARCHAR(255) NOT NULL UNIQUE,
  `password` VARCHAR(255) NOT NULL,
  `is_verified` TINYINT(1) DEFAULT 0,
  `verification_token` VARCHAR(255) DEFAULT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. ตาราง books (สำหรับ Lab 9.1 CRUD หนังสือ)
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

-- ข้อมูลตัวอย่างสำหรับทดสอบตาราง books
INSERT INTO `books` (`title`, `author`, `price`, `stock`, `category`) VALUES
('พื้นฐานการเขียนโปรแกรม', 'สมชาย ใจดี', 250.00, 10, 'Programming'),
('เรียนรู้ IoT ด้วย ESP32', 'วิชัย เทคโน', 320.00, 5, 'IoT'),
('Data Science เบื้องต้น', 'สมหญิง ข้อมูล', 450.00, 8, 'Data Science');
