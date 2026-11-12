import mysql from 'mysql2/promise';
import fs from 'node:fs';
import { AsyncLocalStorage } from 'node:async_hooks';

const major = Number(process.versions.node.split('.')[0]);
if (major < 20) {
  console.error(`\n[Sunrise HMS] Node.js 20 or newer is required. You are running ${process.version}.`);
  console.error('Install the current LTS from https://nodejs.org and run "npm start" again.\n');
  process.exit(1);
}

function resolveConnection() {
  const url = process.env.MYSQL_URL || process.env.DATABASE_URL;
  const config = {
    host: process.env.MYSQL_HOST || '127.0.0.1',
    port: Number(process.env.MYSQL_PORT) || 3306,
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD ?? '',
    database: process.env.MYSQL_DATABASE || 'sunrise_hotel',
    ssl: undefined,
  };
  if (!url) {
    return { ...config, ssl: resolveSsl(false) };
  }
  const parsed = new URL(url);
  if (!['mysql:', 'mysql2:'].includes(parsed.protocol)) {
    throw new Error('MYSQL_URL must start with mysql://');
  }
  config.host = parsed.hostname;
  config.port = Number(parsed.port) || 3306;
  config.user = decodeURIComponent(parsed.username) || config.user;
  config.password = decodeURIComponent(parsed.password ?? '');
  config.database = decodeURIComponent(parsed.pathname.replace(/^\//, '')) || config.database;
  const sslMode = String(parsed.searchParams.get('ssl-mode') || '').toUpperCase();
  return { ...config, ssl: resolveSsl(sslMode === 'REQUIRED' || sslMode === 'VERIFY_IDENTITY') };
}

function resolveSsl(required) {
  if (!required && process.env.MYSQL_SSL !== 'true') return undefined;
  const caPath = process.env.MYSQL_SSL_CA;
  const caPem = process.env.MYSQL_SSL_CA_PEM;
  const ca = caPath ? fs.readFileSync(caPath, 'utf8') : caPem || undefined;
  return ca ? { ca, rejectUnauthorized: true } : { rejectUnauthorized: false };
}

export const DB = resolveConnection();

const TABLE_OPTIONS = 'ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci';

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(40) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(120) NOT NULL,
    role VARCHAR(20) NOT NULL,
    phone VARCHAR(40) NOT NULL DEFAULT '',
    active TINYINT NOT NULL DEFAULT 1,
    created_at VARCHAR(30) NOT NULL,
    CONSTRAINT chk_users_role CHECK (role IN ('admin','receptionist','manager','housekeeping'))
  ) ${TABLE_OPTIONS}`,

  `CREATE TABLE IF NOT EXISTS rooms (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    number VARCHAR(12) NOT NULL UNIQUE,
    type VARCHAR(60) NOT NULL,
    floor INT NOT NULL,
    rate DOUBLE NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'available',
    notes VARCHAR(500) NOT NULL DEFAULT '',
    updated_at VARCHAR(30) NOT NULL,
    CONSTRAINT chk_rooms_status CHECK (status IN ('available','occupied','cleaning','maintenance'))
  ) ${TABLE_OPTIONS}`,

  `CREATE TABLE IF NOT EXISTS guests (
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
  ) ${TABLE_OPTIONS}`,

  `CREATE TABLE IF NOT EXISTS reservations (
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
  ) ${TABLE_OPTIONS}`,

  `CREATE TABLE IF NOT EXISTS invoices (
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
  ) ${TABLE_OPTIONS}`,

  `CREATE TABLE IF NOT EXISTS invoice_items (
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
  ) ${TABLE_OPTIONS}`,

  `CREATE TABLE IF NOT EXISTS payments (
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
  ) ${TABLE_OPTIONS}`,

  `CREATE TABLE IF NOT EXISTS housekeeping_logs (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    room_id INT NOT NULL,
    status VARCHAR(20) NOT NULL,
    note VARCHAR(300) NOT NULL DEFAULT '',
    updated_by INT NULL,
    created_at VARCHAR(30) NOT NULL,
    KEY idx_housekeeping_room (room_id),
    CONSTRAINT fk_housekeeping_room FOREIGN KEY (room_id) REFERENCES rooms(id),
    CONSTRAINT fk_housekeeping_user FOREIGN KEY (updated_by) REFERENCES users(id)
  ) ${TABLE_OPTIONS}`,

  `CREATE TABLE IF NOT EXISTS activity_log (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    user_id INT NULL,
    action VARCHAR(60) NOT NULL,
    entity VARCHAR(40) NOT NULL DEFAULT '',
    details VARCHAR(500) NOT NULL DEFAULT '',
    created_at VARCHAR(30) NOT NULL,
    CONSTRAINT fk_activity_user FOREIGN KEY (user_id) REFERENCES users(id)
  ) ${TABLE_OPTIONS}`,

  `CREATE TABLE IF NOT EXISTS settings (
    \`key\` VARCHAR(60) NOT NULL PRIMARY KEY,
    value VARCHAR(240) NOT NULL
  ) ${TABLE_OPTIONS}`,
];

let pool = null;
const transactionScope = new AsyncLocalStorage();

function getPool() {
  if (!pool) {
    pool = mysql.createPool({
      ...DB,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      dateStrings: true,
      decimalNumbers: true,
      charset: 'utf8mb4_unicode_ci',
    });
  }
  return pool;
}

function connection() {
  return transactionScope.getStore() || getPool();
}

export async function initDatabase() {
  const db = getPool();
  try {
    await db.query('SELECT 1');
  } catch (error) {
    if (error.code !== 'ER_BAD_DB_ERROR') throw error;
    const { database, ...adminConfig } = DB;
    const admin = await mysql.createConnection(adminConfig);
    try {
      await admin.query(
        `CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
      );
    } finally {
      await admin.end();
    }
    await db.query('SELECT 1');
  }
  for (const statement of SCHEMA) {
    await db.query(statement);
  }

  const [columns] = await db.query(
    `SELECT COLUMN_NAME AS name FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'reservations'`,
    [DB.database]
  );
  const names = new Set(columns.map((column) => column.name));
  if (!names.has('source')) {
    await db.query(
      `ALTER TABLE reservations ADD COLUMN source VARCHAR(20) NOT NULL DEFAULT 'front_desk'`
    );
  }
  if (!names.has('approval_status')) {
    await db.query(
      `ALTER TABLE reservations ADD COLUMN approval_status VARCHAR(20) NOT NULL DEFAULT 'confirmed'`
    );
  }
  if (!names.has('source') || !names.has('approval_status')) {
    await db.query(
      `ALTER TABLE reservations
       ADD CONSTRAINT chk_reservations_source CHECK (source IN ('front_desk','website','phone','walk_in')),
       ADD CONSTRAINT chk_reservations_approval CHECK (approval_status IN ('pending','confirmed','declined'))`
    );
  }
  return db;
}

export async function closeDatabase() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

export async function all(sql, ...params) {
  const [rows] = await connection().query(sql, params);
  return rows;
}

export async function get(sql, ...params) {
  const rows = await all(sql, ...params);
  return rows[0];
}

export async function run(sql, ...params) {
  const [result] = await connection().query(sql, params);
  return { changes: result.affectedRows ?? 0, lastInsertRowid: result.insertId ?? 0 };
}

export async function transaction(fn) {
  if (transactionScope.getStore()) return fn();
  const conn = await getPool().getConnection();
  try {
    await conn.beginTransaction();
    const result = await transactionScope.run(conn, fn);
    await conn.commit();
    return result;
  } catch (error) {
    try {
      await conn.rollback();
    } catch {
      /* ignore rollback failures */
    }
    throw error;
  } finally {
    conn.release();
  }
}

const pad = (n) => String(n).padStart(2, '0');

export function nowIso(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export function todayStr() {
  return nowIso().slice(0, 10);
}

export function addDays(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

export function diffDays(fromDate, toDate) {
  const [y1, m1, d1] = fromDate.split('-').map(Number);
  const [y2, m2, d2] = toDate.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
}

export function round2(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

export function isDateString(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}
