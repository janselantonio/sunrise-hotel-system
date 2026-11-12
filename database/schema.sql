-- Sunrise Hotel Management System
-- MySQL 8 relational database schema (InnoDB, utf8mb4)
--
-- The app creates these tables automatically on first start through src/db.js.
-- This file is the submission copy of the schema and can also be imported
-- into phpMyAdmin, HeidiSQL or the MySQL command line:
--
--   mysql -u root < database/schema.sql
--
-- Default connection: 127.0.0.1:3306, user root, empty password, database sunrise_hotel.
-- Change the credentials with MYSQL_HOST, MYSQL_PORT, MYSQL_USER, MYSQL_PASSWORD
-- and MYSQL_DATABASE environment variables.

CREATE DATABASE IF NOT EXISTS sunrise_hotel
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE sunrise_hotel;

CREATE TABLE IF NOT EXISTS users (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(40) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(120) NOT NULL,
  role VARCHAR(20) NOT NULL,
  phone VARCHAR(40) NOT NULL DEFAULT '',
  active TINYINT NOT NULL DEFAULT 1,
  created_at VARCHAR(30) NOT NULL,
  CONSTRAINT chk_users_role CHECK (role IN ('admin','receptionist','manager','housekeeping'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS rooms (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  number VARCHAR(12) NOT NULL UNIQUE,
  type VARCHAR(60) NOT NULL,
  floor INT NOT NULL,
  rate DOUBLE NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'available',
  notes VARCHAR(500) NOT NULL DEFAULT '',
  updated_at VARCHAR(30) NOT NULL,
  CONSTRAINT chk_rooms_status CHECK (status IN ('available','occupied','cleaning','maintenance'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS guests (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  full_name VARCHAR(120) NOT NULL,
  phone VARCHAR(40) NOT NULL DEFAULT '',
  email VARCHAR(120) NOT NULL DEFAULT '',
  address VARCHAR(240) NOT NULL DEFAULT '',
  id_type VARCHAR(60) NOT NULL DEFAULT '',
  id_number VARCHAR(60) NOT NULL DEFAULT '',
  notes VARCHAR(500) NOT NULL DEFAULT '',
  created_at VARCHAR(30) NOT NULL,
  KEY idx_guests_name (full_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS reservations (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  guest_id INT NOT NULL,
  room_id INT NOT NULL,
  nightly_rate DOUBLE NOT NULL,
  check_in_date CHAR(10) NOT NULL,
  check_out_date CHAR(10) NOT NULL,
  adults INT NOT NULL DEFAULT 1,
  children INT NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'reserved',
  source VARCHAR(20) NOT NULL DEFAULT 'front_desk',
  approval_status VARCHAR(20) NOT NULL DEFAULT 'confirmed',
  notes VARCHAR(500) NOT NULL DEFAULT '',
  created_by INT NULL,
  created_at VARCHAR(30) NOT NULL,
  checked_in_at VARCHAR(30) NULL,
  checked_out_at VARCHAR(30) NULL,
  KEY idx_reservations_room_dates (room_id, check_in_date, check_out_date),
  KEY idx_reservations_status (status),
  KEY idx_reservations_approval (approval_status),
  CONSTRAINT fk_reservations_guest FOREIGN KEY (guest_id) REFERENCES guests(id),
  CONSTRAINT fk_reservations_room FOREIGN KEY (room_id) REFERENCES rooms(id),
  CONSTRAINT fk_reservations_user FOREIGN KEY (created_by) REFERENCES users(id),
  CONSTRAINT chk_reservations_status CHECK (status IN ('reserved','checked_in','checked_out','cancelled')),
  CONSTRAINT chk_reservations_source CHECK (source IN ('front_desk','website','phone','walk_in')),
  CONSTRAINT chk_reservations_approval CHECK (approval_status IN ('pending','confirmed','declined'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS invoices (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  number VARCHAR(30) NOT NULL UNIQUE,
  reservation_id INT NULL UNIQUE,
  guest_id INT NOT NULL,
  room_id INT NOT NULL,
  room_type VARCHAR(60) NOT NULL,
  issued_at VARCHAR(30) NOT NULL,
  check_in_date CHAR(10) NOT NULL,
  check_out_date CHAR(10) NOT NULL,
  nights INT NOT NULL,
  nightly_rate DOUBLE NOT NULL,
  room_total DOUBLE NOT NULL DEFAULT 0,
  extras_total DOUBLE NOT NULL DEFAULT 0,
  discount DOUBLE NOT NULL DEFAULT 0,
  tax_rate DOUBLE NOT NULL DEFAULT 12,
  tax_amount DOUBLE NOT NULL DEFAULT 0,
  total DOUBLE NOT NULL DEFAULT 0,
  amount_paid DOUBLE NOT NULL DEFAULT 0,
  status VARCHAR(10) NOT NULL DEFAULT 'open',
  notes VARCHAR(500) NOT NULL DEFAULT '',
  created_by INT NULL,
  KEY idx_invoices_issued (issued_at),
  CONSTRAINT fk_invoices_reservation FOREIGN KEY (reservation_id) REFERENCES reservations(id),
  CONSTRAINT fk_invoices_guest FOREIGN KEY (guest_id) REFERENCES guests(id),
  CONSTRAINT fk_invoices_room FOREIGN KEY (room_id) REFERENCES rooms(id),
  CONSTRAINT fk_invoices_user FOREIGN KEY (created_by) REFERENCES users(id),
  CONSTRAINT chk_invoices_status CHECK (status IN ('open','paid','void'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS invoice_items (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  invoice_id INT NOT NULL,
  description VARCHAR(160) NOT NULL,
  category VARCHAR(20) NOT NULL DEFAULT 'other',
  qty DOUBLE NOT NULL DEFAULT 1,
  unit_price DOUBLE NOT NULL DEFAULT 0,
  amount DOUBLE NOT NULL DEFAULT 0,
  KEY idx_invoice_items_invoice (invoice_id),
  CONSTRAINT fk_invoice_items_invoice FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE,
  CONSTRAINT chk_invoice_items_category CHECK (category IN ('room','food','service','other'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS payments (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  invoice_id INT NOT NULL,
  amount DOUBLE NOT NULL,
  method VARCHAR(20) NOT NULL DEFAULT 'cash',
  reference VARCHAR(80) NOT NULL DEFAULT '',
  paid_at VARCHAR(30) NOT NULL,
  received_by INT NULL,
  KEY idx_payments_paid (paid_at),
  KEY idx_payments_invoice (invoice_id),
  CONSTRAINT fk_payments_invoice FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE,
  CONSTRAINT fk_payments_user FOREIGN KEY (received_by) REFERENCES users(id),
  CONSTRAINT chk_payments_method CHECK (method IN ('cash','card','gcash','bank'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS housekeeping_logs (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  room_id INT NOT NULL,
  status VARCHAR(20) NOT NULL,
  note VARCHAR(300) NOT NULL DEFAULT '',
  updated_by INT NULL,
  created_at VARCHAR(30) NOT NULL,
  KEY idx_housekeeping_room (room_id),
  CONSTRAINT fk_housekeeping_room FOREIGN KEY (room_id) REFERENCES rooms(id),
  CONSTRAINT fk_housekeeping_user FOREIGN KEY (updated_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS activity_log (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id INT NULL,
  action VARCHAR(60) NOT NULL,
  entity VARCHAR(40) NOT NULL DEFAULT '',
  details VARCHAR(500) NOT NULL DEFAULT '',
  created_at VARCHAR(30) NOT NULL,
  CONSTRAINT fk_activity_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS settings (
  `key` VARCHAR(60) NOT NULL PRIMARY KEY,
  value VARCHAR(240) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
