import {
  all,
  get,
  run,
  nowIso,
  todayStr,
  addDays,
  diffDays,
  round2,
  isDateString,
  transaction,
  DB,
} from './db.js';
import { HttpError, badRequest, notFound } from './errors.js';
import { hashPassword, publicUser } from './auth.js';

const PAYMENT_METHODS = ['cash', 'card', 'gcash', 'bank'];
const ROLES = ['admin', 'receptionist', 'manager', 'housekeeping'];

const ROOM_TYPE_INFO = {
  'Standard Room': {
    maxGuests: 2,
    size: 24,
    tagline: 'Comfortable and bright',
    description:
      'A calm, efficient room with a queen bed, work desk and city view \u2014 ideal for solo travellers and short business stays.',
    amenities: ['Queen bed', 'Air conditioning', 'Free Wi-Fi', 'Smart TV', 'Hot shower', 'Daily housekeeping'],
    image: '/assets/room-standard.jpg',
  },
  'Deluxe Room': {
    maxGuests: 3,
    size: 32,
    tagline: 'A little more space',
    description:
      'Extra room to unwind with a seating corner, rainfall shower and a higher floor overlooking the Makati skyline.',
    amenities: ['Queen bed + sofa bed', 'Air conditioning', 'Free Wi-Fi', 'Smart TV', 'Rainfall shower', 'Mini bar'],
    image: '/assets/room-deluxe.jpg',
  },
  'Family Suite': {
    maxGuests: 5,
    size: 45,
    tagline: 'Room for everyone',
    description:
      'A two-room suite with a separate living area, dining nook and space for the whole family to spread out.',
    amenities: ['King bed + two singles', 'Living area', 'Free Wi-Fi', 'Smart TV', 'Kitchenette', 'Bathtub'],
    image: '/assets/room-family.jpg',
  },
  'Executive Suite': {
    maxGuests: 4,
    size: 55,
    tagline: 'Our signature stay',
    description:
      'The top-floor suite with a private lounge, workspace, panoramic view and priority front desk service.',
    amenities: ['King bed', 'Private lounge', 'Free Wi-Fi', 'Smart TV', 'Espresso machine', 'Panoramic view'],
    image: '/assets/room-executive.jpg',
  },
};

function roomTypeInfo(type) {
  return (
    ROOM_TYPE_INFO[type] || {
      maxGuests: 2,
      size: 24,
      tagline: 'Comfortable stay',
      description: 'A comfortable room with everything you need for a restful stay.',
      amenities: ['Free Wi-Fi', 'Air conditioning', 'Daily housekeeping'],
      image: '/assets/room-standard.jpg',
    }
  );
}

/* ------------------------------------------------------------------ */
/* Settings                                                            */
/* ------------------------------------------------------------------ */

const SETTING_MAP = {
  hotelName: 'hotel_name',
  address: 'address',
  phone: 'phone',
  email: 'email',
  currency: 'currency',
  currencySymbol: 'currency_symbol',
  taxRate: 'tax_rate',
  checkInTime: 'check_in_time',
  checkOutTime: 'check_out_time',
};

export async function getSettings() {
  const rows = (await all('SELECT `key`, value FROM settings'));
  const stored = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return {
    hotelName: stored.hotel_name || 'Sunrise Hotel',
    address: stored.address || '88 Mabini Street, Makati City',
    phone: stored.phone || '+63 2 8888 1700',
    email: stored.email || 'frontdesk@sunrisehotel.ph',
    currency: stored.currency || 'PHP',
    currencySymbol: stored.currency_symbol || '\u20B1',
    taxRate: Number(stored.tax_rate ?? 12),
    checkInTime: stored.check_in_time || '14:00',
    checkOutTime: stored.check_out_time || '12:00',
  };
}

export async function saveSettings(patch, userId) {
  const values = {};
  for (const [key, column] of Object.entries(SETTING_MAP)) {
    if (patch[key] !== undefined) values[column] = String(patch[key]).trim();
  }
  if (values.tax_rate !== undefined) {
    const rate = Number(values.tax_rate);
    if (!Number.isFinite(rate) || rate < 0 || rate > 30) {
      throw badRequest('Tax rate must be between 0 and 30 percent.');
    }
    values.tax_rate = String(rate);
  }
  if (values.currency_symbol && values.currency_symbol.length > 3) {
    throw badRequest('Currency symbol must be 3 characters or fewer.');
  }
  if (values.check_in_time && !/^\d{2}:\d{2}$/.test(values.check_in_time)) {
    throw badRequest('Check-in time must look like 14:00.');
  }
  if (values.check_out_time && !/^\d{2}:\d{2}$/.test(values.check_out_time)) {
    throw badRequest('Check-out time must look like 12:00.');
  }
  if (values.hotel_name !== undefined && !values.hotel_name) {
    throw badRequest('Hotel name cannot be empty.');
  }
  for (const [key, value] of Object.entries(values)) {
    (await run(
      `INSERT INTO settings (\`key\`, value) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE value = VALUES(value)`,
      key,
      value
    ));
  }
  (await logActivity(userId, 'settings.updated', 'settings', 'Hotel settings were updated.'));
  return (await getSettings());
}

/* ------------------------------------------------------------------ */
/* Small validation helpers                                            */
/* ------------------------------------------------------------------ */

function requiredText(value, label, max = 160) {
  const text = String(value ?? '').trim();
  if (!text) throw badRequest(`${label} is required.`);
  if (text.length > max) throw badRequest(`${label} is too long.`);
  return text;
}

function optionalText(value, max = 400) {
  const text = String(value ?? '').trim();
  if (text.length > max) throw badRequest('One of the text values is too long.');
  return text;
}

/* ------------------------------------------------------------------ */
/* Activity log                                                        */
/* ------------------------------------------------------------------ */

export async function logActivity(userId, action, entity, details) {
  (await run(
    'INSERT INTO activity_log (user_id, action, entity, details, created_at) VALUES (?, ?, ?, ?, ?)',
    userId ?? null,
    action,
    entity || '',
    details || '',
    nowIso()
  ));
}

export async function listActivity(limit = 10) {
  return (await all(
    `SELECT a.*, u.full_name AS user_name, u.role AS user_role
     FROM activity_log a
     LEFT JOIN users u ON u.id = a.user_id
     ORDER BY a.id DESC
     LIMIT ?`,
    Number(limit) || 10
  )).map((row) => ({
    id: row.id,
    action: row.action,
    entity: row.entity,
    details: row.details,
    createdAt: row.created_at,
    userName: row.user_name || 'System',
    userRole: row.user_role || '',
  }));
}

/* ------------------------------------------------------------------ */
/* Rooms                                                               */
/* ------------------------------------------------------------------ */

export function mapRoom(row) {
  return {
    id: row.id,
    number: row.number,
    type: row.type,
    floor: row.floor,
    rate: row.rate,
    status: row.status,
    notes: row.notes,
    updatedAt: row.updated_at,
  };
}

export async function listRooms() {
  const today = todayStr();
  const rooms = (await all('SELECT * FROM rooms ORDER BY floor, number'));
  const active = (await all(
    `SELECT r.*, g.full_name AS guest_name
     FROM reservations r JOIN guests g ON g.id = r.guest_id
     WHERE r.status = 'checked_in'`
  ));
  const arrivals = (await all(
    `SELECT r.*, g.full_name AS guest_name
     FROM reservations r JOIN guests g ON g.id = r.guest_id
     WHERE r.status = 'reserved' AND r.approval_status = 'confirmed' AND r.check_in_date = ?
     ORDER BY r.check_in_date, r.id`,
    today
  ));
  const upcoming = (await all(
    `SELECT r.*, g.full_name AS guest_name
     FROM reservations r JOIN guests g ON g.id = r.guest_id
     WHERE r.status = 'reserved' AND r.approval_status = 'confirmed' AND r.check_in_date > ?
     ORDER BY r.check_in_date, r.id`,
    today
  ));
  const stamps = new Map(
    (await all('SELECT room_id, MAX(created_at) AS last FROM housekeeping_logs GROUP BY room_id')).map((r) => [
      r.room_id,
      r.last,
    ])
  );

  return rooms.map((room) => {
    const current = active.find((r) => r.room_id === room.id) || null;
    const arriving = arrivals.find((r) => r.room_id === room.id) || null;
    const next = upcoming.find((r) => r.room_id === room.id) || null;
    let displayStatus = room.status;
    if (room.status === 'available' && arriving) displayStatus = 'reserved';
    return {
      ...mapRoom(room),
      displayStatus,
      lastCleanedAt: stamps.get(room.id) || null,
      currentGuest: current
        ? {
            reservationId: current.id,
            guestName: current.guest_name,
            checkOutDate: current.check_out_date,
          }
        : null,
      arrivingGuest: arriving
        ? {
            reservationId: arriving.id,
            guestName: arriving.guest_name,
            checkInDate: arriving.check_in_date,
            checkOutDate: arriving.check_out_date,
          }
        : null,
      nextArrival: next ? { date: next.check_in_date, guestName: next.guest_name } : null,
    };
  });
}

export async function getRoom(id) {
  const row = (await get('SELECT * FROM rooms WHERE id = ?', id));
  if (!row) throw notFound('Room not found.');
  return row;
}

export async function roomDetail(id) {
  const room = (await getRoom(id));
  const today = todayStr();
  const current = (await get(
    `SELECT id FROM reservations WHERE room_id = ? AND status = 'checked_in' ORDER BY id LIMIT 1`,
    id
  ));
  const upcomingIds = (await all(
    `SELECT id FROM reservations WHERE room_id = ? AND status = 'reserved' AND check_in_date >= ?
     ORDER BY check_in_date, id LIMIT 8`,
    id,
    today
  ));
  const stays = (await all(
    `SELECT id FROM reservations WHERE room_id = ? AND status = 'checked_out'
     ORDER BY check_out_date DESC, id DESC LIMIT 5`,
    id
  ));
  const logs = (await all(
    `SELECT h.*, u.full_name AS updated_by_name
     FROM housekeeping_logs h LEFT JOIN users u ON u.id = h.updated_by
     WHERE h.room_id = ? ORDER BY h.created_at DESC, h.id DESC LIMIT 8`,
    id
  )).map((log) => ({
    id: log.id,
    status: log.status,
    note: log.note,
    updatedByName: log.updated_by_name || 'System',
    createdAt: log.created_at,
  }));

  const upcoming = [];
  for (const row of upcomingIds) {
    upcoming.push(await reservationById(row.id));
  }
  const recentStays = [];
  for (const row of stays) {
    recentStays.push(await reservationById(row.id));
  }

  return {
    room: mapRoom(room),
    current: current ? await reservationById(current.id) : null,
    upcoming,
    recentStays,
    logs,
  };
}

export async function roomIsFree(roomId, checkInDate, checkOutDate, excludeReservationId = null) {
  const room = (await get('SELECT * FROM rooms WHERE id = ?', roomId));
  if (!room || room.status === 'maintenance') return false;
  if (room.status === 'occupied' && checkInDate <= todayStr()) return false;
  let sql = `SELECT id FROM reservations
    WHERE room_id = ? AND status IN ('reserved', 'checked_in') AND approval_status = 'confirmed'
      AND check_in_date < ? AND check_out_date > ?`;
  const params = [roomId, checkOutDate, checkInDate];
  if (excludeReservationId) {
    sql += ' AND id <> ?';
    params.push(excludeReservationId);
  }
  return !(await get(sql + ' LIMIT 1', ...params));
}

export async function availableRooms(checkInDate, checkOutDate, excludeReservationId = null) {
  if (!isDateString(checkInDate) || !isDateString(checkOutDate)) {
    throw badRequest('Choose valid check-in and check-out dates.');
  }
  if (diffDays(checkInDate, checkOutDate) < 1) {
    throw badRequest('Check-out must be after check-in.');
  }
  const rooms = await all('SELECT * FROM rooms ORDER BY floor, number');
  const free = [];
  for (const room of rooms) {
    if (await roomIsFree(room.id, checkInDate, checkOutDate, excludeReservationId)) {
      free.push(mapRoom(room));
    }
  }
  return free;
}

export async function setRoomStatus(userId, roomId, status, note = '') {
  if (!['available', 'cleaning', 'maintenance'].includes(status)) {
    throw badRequest('That room status cannot be set manually.');
  }
  const room = (await getRoom(roomId));
  const active = (await get(
    `SELECT id FROM reservations WHERE room_id = ? AND status = 'checked_in' LIMIT 1`,
    roomId
  ));
  if (active) {
    throw badRequest('Check the current guest out before changing this room\u2019s status.');
  }
  if (room.status === status) {
    return mapRoom(room);
  }
  const now = nowIso();
  (await run('UPDATE rooms SET status = ?, updated_at = ? WHERE id = ?', status, now, roomId));
  (await run(
    'INSERT INTO housekeeping_logs (room_id, status, note, updated_by, created_at) VALUES (?, ?, ?, ?, ?)',
    roomId,
    status,
    optionalText(note, 300),
    userId,
    now
  ));
  const label = {
    available: 'marked ready',
    cleaning: 'flagged for cleaning',
    maintenance: 'marked out of service',
  }[status];
  (await logActivity(userId, 'room.status', 'room', `Room ${room.number} was ${label}.`));
  return mapRoom((await get('SELECT * FROM rooms WHERE id = ?', roomId)));
}

export async function createRoom(userId, data) {
  const number = requiredText(data.number, 'Room number', 12);
  const type = requiredText(data.type, 'Room type', 60);
  const floor = Number(data.floor);
  const rate = Number(data.rate);
  if (!Number.isInteger(floor) || floor < 0) throw badRequest('Floor must be a whole number.');
  if (!Number.isFinite(rate) || rate <= 0) throw badRequest('Nightly rate must be greater than zero.');
  if ((await get('SELECT id FROM rooms WHERE number = ?', number))) {
    throw badRequest(`Room ${number} already exists.`);
  }
  const result = (await run(
    'INSERT INTO rooms (number, type, floor, rate, status, notes, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    number,
    type,
    floor,
    rate,
    'available',
    optionalText(data.notes),
    nowIso()
  ));
  const id = Number(result.lastInsertRowid);
  (await logActivity(userId, 'room.created', 'room', `Room ${number} (${type}) was added.`));
  return (await listRooms()).find((room) => room.id === id);
}

export async function updateRoom(userId, roomId, data) {
  const room = (await getRoom(roomId));
  const number = data.number !== undefined ? requiredText(data.number, 'Room number', 12) : room.number;
  const type = data.type !== undefined ? requiredText(data.type, 'Room type', 60) : room.type;
  const floor = data.floor !== undefined ? Number(data.floor) : room.floor;
  const rate = data.rate !== undefined ? Number(data.rate) : room.rate;
  if (!Number.isInteger(floor) || floor < 0) throw badRequest('Floor must be a whole number.');
  if (!Number.isFinite(rate) || rate <= 0) throw badRequest('Nightly rate must be greater than zero.');
  const duplicate = (await get('SELECT id FROM rooms WHERE number = ? AND id <> ?', number, roomId));
  if (duplicate) throw badRequest(`Room ${number} already exists.`);
  const notes = data.notes !== undefined ? optionalText(data.notes) : room.notes;
  (await run(
    'UPDATE rooms SET number = ?, type = ?, floor = ?, rate = ?, notes = ?, updated_at = ? WHERE id = ?',
    number,
    type,
    floor,
    rate,
    notes,
    nowIso(),
    roomId
  ));
  (await logActivity(userId, 'room.updated', 'room', `Room ${number} details were updated.`));
  return (await listRooms()).find((r) => r.id === roomId);
}

/* ------------------------------------------------------------------ */
/* Guests                                                              */
/* ------------------------------------------------------------------ */

export function mapGuest(row) {
  return {
    id: row.id,
    fullName: row.full_name,
    phone: row.phone,
    email: row.email,
    address: row.address,
    idType: row.id_type,
    idNumber: row.id_number,
    notes: row.notes,
    createdAt: row.created_at,
    stays: row.stays ?? 0,
    activeStays: row.active_stays ?? 0,
    lastStay: row.last_stay ?? null,
  };
}

export async function listGuests({ q } = {}) {
  let where = '';
  const params = [];
  if (q) {
    where = 'WHERE g.full_name LIKE ? OR g.phone LIKE ? OR g.email LIKE ?';
    const like = `%${q}%`;
    params.push(like, like, like);
  }
  return (await all(
    `SELECT g.*,
       COUNT(r.id) AS stays,
       SUM(CASE WHEN r.status IN ('reserved','checked_in') THEN 1 ELSE 0 END) AS active_stays,
       MAX(CASE WHEN r.status = 'checked_out' THEN r.check_out_date END) AS last_stay
     FROM guests g
     LEFT JOIN reservations r ON r.guest_id = g.id
     ${where}
     GROUP BY g.id
     ORDER BY g.full_name`,
    ...params
  )).map(mapGuest);
}

export async function guestDetail(id) {
  const row = (await get('SELECT * FROM guests WHERE id = ?', id));
  if (!row) throw notFound('Guest not found.');
  const stays = (await all(
    `${RESERVATION_SELECT} WHERE r.guest_id = ? ORDER BY r.check_in_date DESC, r.id DESC`,
    id
  )).map(mapReservation);
  const invoices = (await all(
    `${INVOICE_SELECT} WHERE i.guest_id = ? ORDER BY i.issued_at DESC, i.id DESC`,
    id
  )).map(mapInvoice);
  return {
    guest: mapGuest(row),
    reservations: stays,
    invoices,
  };
}

export async function createGuest(data) {
  const fullName = requiredText(data.fullName, 'Guest name', 120);
  const phone = requiredText(data.phone, 'Phone number', 40);
  const now = nowIso();
  const result = (await run(
    `INSERT INTO guests (full_name, phone, email, address, id_type, id_number, notes, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    fullName,
    phone,
    optionalText(data.email, 120),
    optionalText(data.address, 240),
    optionalText(data.idType, 60),
    optionalText(data.idNumber, 60),
    optionalText(data.notes, 400),
    now
  ));
  return (await get('SELECT * FROM guests WHERE id = ?', Number(result.lastInsertRowid)));
}

export async function updateGuest(userId, id, data) {
  const guest = (await get('SELECT * FROM guests WHERE id = ?', id));
  if (!guest) throw notFound('Guest not found.');
  const fullName = data.fullName !== undefined ? requiredText(data.fullName, 'Guest name', 120) : guest.full_name;
  const phone = data.phone !== undefined ? requiredText(data.phone, 'Phone number', 40) : guest.phone;
  (await run(
    `UPDATE guests SET full_name = ?, phone = ?, email = ?, address = ?, id_type = ?, id_number = ?, notes = ?
     WHERE id = ?`,
    fullName,
    phone,
    data.email !== undefined ? optionalText(data.email, 120) : guest.email,
    data.address !== undefined ? optionalText(data.address, 240) : guest.address,
    data.idType !== undefined ? optionalText(data.idType, 60) : guest.id_type,
    data.idNumber !== undefined ? optionalText(data.idNumber, 60) : guest.id_number,
    data.notes !== undefined ? optionalText(data.notes, 400) : guest.notes,
    id
  ));
  (await logActivity(userId, 'guest.updated', 'guest', `${fullName}\u2019s profile was updated.`));
  return mapGuest((await get('SELECT * FROM guests WHERE id = ?', id)));
}

/* ------------------------------------------------------------------ */
/* Reservations                                                        */
/* ------------------------------------------------------------------ */

const RESERVATION_SELECT = `
  SELECT r.*,
    g.full_name AS guest_name, g.phone AS guest_phone, g.email AS guest_email,
    rm.number AS room_number, rm.type AS room_type, rm.floor AS floor,
    i.id AS invoice_id, (i.total - i.amount_paid) AS invoice_balance
  FROM reservations r
  JOIN guests g ON g.id = r.guest_id
  JOIN rooms rm ON rm.id = r.room_id
  LEFT JOIN invoices i ON i.reservation_id = r.id AND i.status <> 'void'
`;

export function mapReservation(row) {
  if (!row) return null;
  const nights = Math.max(1, diffDays(row.check_in_date, row.check_out_date));
  return {
    id: row.id,
    code: `RSV-${String(row.id).padStart(4, '0')}`,
    guestId: row.guest_id,
    guestName: row.guest_name,
    guestPhone: row.guest_phone,
    guestEmail: row.guest_email,
    roomId: row.room_id,
    roomNumber: row.room_number,
    roomType: row.room_type,
    floor: row.floor,
    nightlyRate: row.nightly_rate,
    checkInDate: row.check_in_date,
    checkOutDate: row.check_out_date,
    nights,
    adults: row.adults,
    children: row.children,
    status: row.status,
    source: row.source || 'front_desk',
    approvalStatus: row.approval_status || 'confirmed',
    notes: row.notes,
    createdAt: row.created_at,
    checkedInAt: row.checked_in_at,
    checkedOutAt: row.checked_out_at,
    invoiceId: row.invoice_id ?? null,
    balance: row.invoice_balance != null ? round2(row.invoice_balance) : null,
  };
}

export async function listReservations({ status, approval, from, to, q, limit = 200, order = 'desc' } = {}) {
  let sql = `${RESERVATION_SELECT} WHERE 1 = 1`;
  const params = [];
  if (status) {
    const statuses = String(status)
      .split(',')
      .map((s) => s.trim())
      .filter((s) => ['reserved', 'checked_in', 'checked_out', 'cancelled'].includes(s));
    if (statuses.length) {
      sql += ` AND r.status IN (${statuses.map(() => '?').join(', ')})`;
      params.push(...statuses);
    }
  }
  if (approval) {
    const approvals = String(approval)
      .split(',')
      .map((s) => s.trim())
      .filter((s) => ['pending', 'confirmed', 'declined'].includes(s));
    if (approvals.length) {
      sql += ` AND r.approval_status IN (${approvals.map(() => '?').join(', ')})`;
      params.push(...approvals);
    }
  }
  if (from) {
    sql += ' AND r.check_in_date >= ?';
    params.push(from);
  }
  if (to) {
    sql += ' AND r.check_in_date <= ?';
    params.push(to);
  }
  if (q) {
    sql += ' AND (g.full_name LIKE ? OR rm.number LIKE ? OR CAST(r.id AS CHAR) LIKE ?)';
    const like = `%${q}%`;
    params.push(like, like, like);
  }
  sql += ` ORDER BY r.check_in_date ${order === 'asc' ? 'ASC' : 'DESC'}, r.id DESC LIMIT ?`;
  params.push(Number(limit) || 200);
  return (await all(sql, ...params)).map(mapReservation);
}

export async function reservationById(id) {
  const row = (await get(`${RESERVATION_SELECT} WHERE r.id = ?`, id));
  if (!row) throw notFound('Reservation not found.');
  return mapReservation(row);
}

export async function createReservation(userId, data) {
  const checkInDate = data.checkInDate;
  const checkOutDate = data.checkOutDate;
  if (!isDateString(checkInDate) || !isDateString(checkOutDate)) {
    throw badRequest('Choose valid check-in and check-out dates.');
  }
  if (diffDays(checkInDate, checkOutDate) < 1) {
    throw badRequest('Check-out must be after check-in.');
  }
  if (checkInDate < todayStr()) {
    throw badRequest('Check-in date cannot be in the past.');
  }
  const adults = Math.max(1, Number(data.adults) || 1);
  const children = Math.max(0, Number(data.children) || 0);

  let guestId = Number(data.guestId) || null;
  if (!guestId) {
    if (!data.guest || !String(data.guest.fullName || '').trim()) {
      throw badRequest('Select an existing guest or enter the guest details.');
    }
    guestId = Number((await createGuest(data.guest)).id);
  } else if (!(await get('SELECT id FROM guests WHERE id = ?', guestId))) {
    throw badRequest('The selected guest could not be found.');
  }

  const roomId = Number(data.roomId);
  if (!roomId) throw badRequest('Select an available room.');
  const room = (await get('SELECT * FROM rooms WHERE id = ?', roomId));
  if (!room) throw badRequest('The selected room could not be found.');
  if (room.status === 'maintenance') throw badRequest(`Room ${room.number} is out of service.`);
  if (!(await roomIsFree(roomId, checkInDate, checkOutDate))) {
    throw new HttpError(409, `Room ${room.number} is already booked for those dates.`);
  }

  const result = (await run(
    `INSERT INTO reservations
      (guest_id, room_id, nightly_rate, check_in_date, check_out_date, adults, children,
       status, source, approval_status, notes, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'reserved', 'front_desk', 'confirmed', ?, ?, ?)`,
    guestId,
    roomId,
    room.rate,
    checkInDate,
    checkOutDate,
    adults,
    children,
    optionalText(data.notes),
    userId,
    nowIso()
  ));
  const id = Number(result.lastInsertRowid);
  (await logActivity(
    userId,
    'reservation.created',
    'reservation',
    `Room ${room.number} booked for ${checkInDate} to ${checkOutDate}.`
  ));
  return (await reservationById(id));
}

export async function createWebsiteBooking(data) {
  const checkInDate = data.checkInDate;
  const checkOutDate = data.checkOutDate;
  if (!isDateString(checkInDate) || !isDateString(checkOutDate)) {
    throw badRequest('Choose valid check-in and check-out dates.');
  }
  if (diffDays(checkInDate, checkOutDate) < 1) {
    throw badRequest('Check-out must be after check-in.');
  }
  if (checkInDate < todayStr()) {
    throw badRequest('Check-in date cannot be in the past.');
  }
  if (diffDays(checkInDate, checkOutDate) > 30) {
    throw badRequest('Online requests are limited to stays of 30 nights or fewer.');
  }

  const roomId = Number(data.roomId);
  if (!roomId) throw badRequest('Choose a room for your stay.');
  const room = (await get('SELECT * FROM rooms WHERE id = ?', roomId));
  if (!room) throw badRequest('The selected room could not be found.');
  if (room.status === 'maintenance') throw badRequest(`Room ${room.number} is currently out of service.`);

  const info = roomTypeInfo(room.type);
  const adults = Math.max(1, Math.min(8, Number(data.adults) || 1));
  const children = Math.max(0, Math.min(6, Number(data.children) || 0));
  if (adults + children > info.maxGuests) {
    throw badRequest(`${room.type} sleeps up to ${info.maxGuests} guests. Choose a larger room for your group.`);
  }

  const fullName = requiredText(data.fullName, 'Full name', 120);
  const phone = requiredText(data.phone, 'Mobile number', 40);
  const email = optionalText(data.email, 120);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw badRequest('Enter a valid email address.');
  }
  const notes = optionalText(data.notes, 400);

  let guest = (await get(
    `SELECT * FROM guests
     WHERE phone = ? OR (email <> '' AND lower(email) = lower(?))
     ORDER BY id LIMIT 1`,
    phone,
    email
  ));
  if (!guest) {
    guest = (await createGuest({
      fullName,
      phone,
      email,
      notes: 'Created from an online booking request.',
    }));
  }

  const nights = diffDays(checkInDate, checkOutDate);
  const requestNote = `Online request.${notes ? ` ${notes}` : ''}`;
  const result = (await run(
    `INSERT INTO reservations
      (guest_id, room_id, nightly_rate, check_in_date, check_out_date, adults, children,
       status, source, approval_status, notes, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'reserved', 'website', 'pending', ?, NULL, ?)`,
    guest.id,
    roomId,
    room.rate,
    checkInDate,
    checkOutDate,
    adults,
    children,
    requestNote,
    nowIso()
  ));
  const id = Number(result.lastInsertRowid);
  (await logActivity(
    null,
    'reservation.requested',
    'reservation',
    `Website booking request from ${fullName} for room ${room.number}, ${checkInDate} to ${checkOutDate}.`
  ));

  return {
    reservation: (await reservationById(id)),
    reference: `RSV-${String(id).padStart(4, '0')}`,
    guestName: fullName,
    roomNumber: room.number,
    roomType: room.type,
    checkInDate,
    checkOutDate,
    nights,
    nightlyRate: room.rate,
    estimatedTotal: round2(nights * room.rate),
    status: 'pending',
  };
}

export async function approveReservation(userId, id) {
  const row = (await get('SELECT * FROM reservations WHERE id = ?', id));
  if (!row) throw notFound('Reservation not found.');
  if (row.approval_status !== 'pending') {
    throw badRequest('This booking request has already been reviewed.');
  }
  if (row.status !== 'reserved') {
    throw badRequest('Only upcoming booking requests can be approved.');
  }
  const room = (await get('SELECT number FROM rooms WHERE id = ?', row.room_id));
  if (!(await roomIsFree(row.room_id, row.check_in_date, row.check_out_date, id))) {
    throw new HttpError(
      409,
      `Room ${room.number} is no longer available for those dates. Decline this request instead.`
    );
  }
  (await run(`UPDATE reservations SET approval_status = 'confirmed' WHERE id = ?`, id));
  (await logActivity(
    userId,
    'reservation.approved',
    'reservation',
    `Online booking RSV-${String(id).padStart(4, '0')} for room ${room.number} was approved.`
  ));
  return (await reservationById(id));
}

export async function declineReservation(userId, id, reason = '') {
  const row = (await get('SELECT * FROM reservations WHERE id = ?', id));
  if (!row) throw notFound('Reservation not found.');
  if (row.approval_status !== 'pending') {
    throw badRequest('This booking request has already been reviewed.');
  }
  const note = optionalText(reason, 200);
  const notes = note
    ? `${row.notes ? `${row.notes} ` : ''}Declined: ${note}`
    : row.notes || 'Declined by the front desk.';
  (await run(
    `UPDATE reservations SET status = 'cancelled', approval_status = 'declined', notes = ? WHERE id = ?`,
    notes,
    id
  ));
  (await logActivity(
    userId,
    'reservation.declined',
    'reservation',
    `Online booking RSV-${String(id).padStart(4, '0')} was declined.`
  ));
  return (await reservationById(id));
}

export async function updateReservation(userId, id, data) {
  const row = (await get('SELECT * FROM reservations WHERE id = ?', id));
  if (!row) throw notFound('Reservation not found.');
  if (row.status !== 'reserved') {
    throw badRequest('Only upcoming reservations can be changed.');
  }
  const checkInDate = isDateString(data.checkInDate) ? data.checkInDate : row.check_in_date;
  const checkOutDate = isDateString(data.checkOutDate) ? data.checkOutDate : row.check_out_date;
  if (diffDays(checkInDate, checkOutDate) < 1) {
    throw badRequest('Check-out must be after check-in.');
  }
  if (checkInDate < todayStr()) {
    throw badRequest('Check-in date cannot be in the past.');
  }
  const roomId = data.roomId ? Number(data.roomId) : row.room_id;
  const room = (await get('SELECT * FROM rooms WHERE id = ?', roomId));
  if (!room) throw badRequest('The selected room could not be found.');
  if (!(await roomIsFree(roomId, checkInDate, checkOutDate, id))) {
    throw new HttpError(409, `Room ${room.number} is already booked for those dates.`);
  }
  const rate = roomId !== row.room_id ? room.rate : row.nightly_rate;
  (await run(
    `UPDATE reservations
     SET room_id = ?, nightly_rate = ?, check_in_date = ?, check_out_date = ?,
         adults = ?, children = ?, notes = ?
     WHERE id = ?`,
    roomId,
    rate,
    checkInDate,
    checkOutDate,
    Math.max(1, Number(data.adults ?? row.adults) || 1),
    Math.max(0, Number(data.children ?? row.children) || 0),
    data.notes !== undefined ? optionalText(data.notes) : row.notes,
    id
  ));
  (await logActivity(userId, 'reservation.updated', 'reservation', `Reservation RSV-${String(id).padStart(4, '0')} was updated.`));
  return (await reservationById(id));
}

export async function cancelReservation(userId, id, reason = '') {
  const row = (await get('SELECT * FROM reservations WHERE id = ?', id));
  if (!row) throw notFound('Reservation not found.');
  if (row.status !== 'reserved') {
    throw badRequest('Only upcoming reservations can be cancelled.');
  }
  const approval = row.approval_status === 'pending' ? 'declined' : row.approval_status;
  (await run(
    `UPDATE reservations SET status = 'cancelled', approval_status = ?, notes = ? WHERE id = ?`,
    approval,
    optionalText(reason) || row.notes,
    id
  ));
  (await logActivity(userId, 'reservation.cancelled', 'reservation', `Reservation RSV-${String(id).padStart(4, '0')} was cancelled.`));
  return (await reservationById(id));
}

export async function checkInReservation(userId, id) {
  const row = (await get(
    `SELECT r.*, g.full_name AS guest_name, rm.number AS room_number, rm.status AS room_status
     FROM reservations r
     JOIN guests g ON g.id = r.guest_id
     JOIN rooms rm ON rm.id = r.room_id
     WHERE r.id = ?`,
    id
  ));
  if (!row) throw notFound('Reservation not found.');
  if (row.approval_status === 'pending') {
    throw badRequest('Approve this online booking request before checking the guest in.');
  }
  if (row.status !== 'reserved') throw badRequest('This reservation is not waiting for check-in.');
  if (row.check_in_date > todayStr()) {
    throw badRequest(`This arrival is scheduled for ${row.check_in_date}.`);
  }
  if (row.room_status === 'occupied') {
    throw badRequest(`Room ${row.room_number} is currently occupied.`);
  }
  if (row.room_status === 'cleaning') {
    throw badRequest(`Room ${row.room_number} is still marked for cleaning. Ask housekeeping to mark it ready first.`);
  }
  if (row.room_status === 'maintenance') {
    throw badRequest(`Room ${row.room_number} is out of service.`);
  }
  if (!(await roomIsFree(row.room_id, row.check_in_date, row.check_out_date, id))) {
    throw new HttpError(409, `Room ${row.room_number} is already booked for those dates.`);
  }
  const now = nowIso();
  (await transaction(async () => {
    (await run(`UPDATE reservations SET status = 'checked_in', checked_in_at = ? WHERE id = ?`, now, id));
    (await run(`UPDATE rooms SET status = 'occupied', updated_at = ? WHERE id = ?`, now, row.room_id));
    (await logActivity(userId, 'guest.checked_in', 'reservation', `${row.guest_name} checked in to room ${row.room_number}.`));
  }));
  return (await reservationById(id));
}

export async function checkOutReservation(userId, id, payload = {}) {
  const row = (await get(
    `SELECT r.*, g.full_name AS guest_name, rm.number AS room_number, rm.type AS room_type
     FROM reservations r
     JOIN guests g ON g.id = r.guest_id
     JOIN rooms rm ON rm.id = r.room_id
     WHERE r.id = ?`,
    id
  ));
  if (!row) throw notFound('Reservation not found.');
  if (row.status !== 'checked_in') throw badRequest('Only in-house guests can be checked out.');
  if ((await get('SELECT id FROM invoices WHERE reservation_id = ?', id))) {
    throw badRequest('An invoice already exists for this stay.');
  }

  const nights = Math.max(1, diffDays(row.check_in_date, row.check_out_date));
  const roomTotal = round2(nights * row.nightly_rate);
  const settings = (await getSettings());

  const cleanExtras = [];
  let extrasSubtotal = 0;
  for (const extra of Array.isArray(payload.extras) ? payload.extras : []) {
    const description = String(extra?.description ?? '').trim();
    if (!description) continue;
    const qty = Number(extra.qty) || 1;
    const unitPrice = Number(extra.unitPrice);
    if (qty <= 0) throw badRequest('Extra charge quantities must be greater than zero.');
    if (!Number.isFinite(unitPrice) || unitPrice < 0) throw badRequest('Extra charges need a valid price.');
    const category = ['food', 'service', 'other'].includes(extra.category) ? extra.category : 'other';
    const amount = round2(qty * unitPrice);
    cleanExtras.push({ description, category, qty, unitPrice: round2(unitPrice), amount });
    extrasSubtotal = round2(extrasSubtotal + amount);
  }

  const discount = Math.max(0, round2(Number(payload.discount) || 0));
  const subtotal = round2(roomTotal + extrasSubtotal);
  if (discount > subtotal) throw badRequest('Discount cannot be more than the bill subtotal.');
  const taxable = round2(subtotal - discount);
  const tax = round2((taxable * settings.taxRate) / 100);
  const total = round2(taxable + tax);

  const cleanPayments = [];
  let paymentTotal = 0;
  for (const payment of Array.isArray(payload.payments) ? payload.payments : []) {
    const amount = round2(Number(payment?.amount) || 0);
    if (amount <= 0) continue;
    const method = PAYMENT_METHODS.includes(payment.method) ? payment.method : 'cash';
    cleanPayments.push({ amount, method, reference: optionalText(payment.reference, 80) });
    paymentTotal = round2(paymentTotal + amount);
  }
  if (paymentTotal > total + 0.005) {
    throw badRequest('The payment is greater than the invoice total.');
  }

  const now = nowIso();
  let invoiceId;
  (await transaction(async () => {
    const number = (await nextInvoiceNumber());
    const result = (await run(
      `INSERT INTO invoices
        (number, reservation_id, guest_id, room_id, room_type, issued_at, check_in_date, check_out_date,
         nights, nightly_rate, room_total, extras_total, discount, tax_rate, tax_amount, total,
         amount_paid, status, notes, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, 0, 0, 0, 'open', ?, ?)`,
      number,
      id,
      row.guest_id,
      row.room_id,
      row.room_type,
      now,
      row.check_in_date,
      row.check_out_date,
      nights,
      row.nightly_rate,
      discount,
      settings.taxRate,
      optionalText(payload.notes),
      userId
    ));
    invoiceId = Number(result.lastInsertRowid);

    (await run(
      `INSERT INTO invoice_items (invoice_id, description, category, qty, unit_price, amount)
       VALUES (?, ?, 'room', ?, ?, ?)`,
      invoiceId,
      `Room ${row.room_number} \u00B7 ${row.room_type} \u00B7 ${nights} night${nights === 1 ? '' : 's'}`,
      nights,
      row.nightly_rate,
      roomTotal
    ));
    for (const extra of cleanExtras) {
      (await run(
        `INSERT INTO invoice_items (invoice_id, description, category, qty, unit_price, amount)
         VALUES (?, ?, ?, ?, ?, ?)`,
        invoiceId,
        extra.description,
        extra.category,
        extra.qty,
        extra.unitPrice,
        extra.amount
      ));
    }
    (await recalcInvoice(invoiceId));

    for (const payment of cleanPayments) {
      (await run(
        `INSERT INTO payments (invoice_id, amount, method, reference, paid_at, received_by)
         VALUES (?, ?, ?, ?, ?, ?)`,
        invoiceId,
        payment.amount,
        payment.method,
        payment.reference,
        now,
        userId
      ));
    }
    (await recalcInvoice(invoiceId));

    (await run(`UPDATE reservations SET status = 'checked_out', checked_out_at = ? WHERE id = ?`, now, id));
    (await run(`UPDATE rooms SET status = 'cleaning', notes = ?, updated_at = ? WHERE id = ?`, `Checked out ${todayStr()}`, now, row.room_id));
    (await run(
      `INSERT INTO housekeeping_logs (room_id, status, note, updated_by, created_at) VALUES (?, 'cleaning', ?, ?, ?)`,
      row.room_id,
      'Guest checked out. Room needs cleaning.',
      userId,
      now
    ));
    (await logActivity(
      userId,
      'guest.checked_out',
      'invoice',
      `${row.guest_name} checked out of room ${row.room_number}. Invoice ${number} issued.`
    ));
  }));

  return (await invoiceDetail(invoiceId));
}

/* ------------------------------------------------------------------ */
/* Invoices & payments                                                 */
/* ------------------------------------------------------------------ */

const INVOICE_SELECT = `
  SELECT i.*,
    g.full_name AS guest_name, g.phone AS guest_phone, g.email AS guest_email,
    rm.number AS room_number
  FROM invoices i
  JOIN guests g ON g.id = i.guest_id
  JOIN rooms rm ON rm.id = i.room_id
`;

export function mapInvoice(row) {
  return {
    id: row.id,
    number: row.number,
    reservationId: row.reservation_id,
    guestId: row.guest_id,
    guestName: row.guest_name,
    guestPhone: row.guest_phone,
    guestEmail: row.guest_email,
    roomId: row.room_id,
    roomNumber: row.room_number,
    roomType: row.room_type,
    issuedAt: row.issued_at,
    checkInDate: row.check_in_date,
    checkOutDate: row.check_out_date,
    nights: row.nights,
    nightlyRate: row.nightly_rate,
    roomTotal: row.room_total,
    extrasTotal: row.extras_total,
    discount: row.discount,
    taxRate: row.tax_rate,
    taxAmount: row.tax_amount,
    total: row.total,
    amountPaid: row.amount_paid,
    balance: round2(Math.max(0, row.total - row.amount_paid)),
    status: row.status,
    notes: row.notes,
  };
}

export async function listInvoices({ status, from, to, q, limit = 200 } = {}) {
  let sql = `${INVOICE_SELECT} WHERE 1 = 1`;
  const params = [];
  if (status) {
    sql += ' AND i.status = ?';
    params.push(status);
  }
  if (from) {
    sql += ' AND substr(i.issued_at, 1, 10) >= ?';
    params.push(from);
  }
  if (to) {
    sql += ' AND substr(i.issued_at, 1, 10) <= ?';
    params.push(to);
  }
  if (q) {
    sql += ' AND (g.full_name LIKE ? OR rm.number LIKE ? OR i.number LIKE ?)';
    const like = `%${q}%`;
    params.push(like, like, like);
  }
  sql += ' ORDER BY i.issued_at DESC, i.id DESC LIMIT ?';
  params.push(Number(limit) || 200);
  return (await all(sql, ...params)).map(mapInvoice);
}

export async function invoiceDetail(id) {
  const row = (await get(`${INVOICE_SELECT} WHERE i.id = ?`, id));
  if (!row) throw notFound('Invoice not found.');
  const items = (await all('SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY id', id)).map((item) => ({
    id: item.id,
    description: item.description,
    category: item.category,
    qty: item.qty,
    unitPrice: item.unit_price,
    amount: item.amount,
  }));
  const payments = (await all(
    `SELECT p.*, u.full_name AS received_by_name
     FROM payments p LEFT JOIN users u ON u.id = p.received_by
     WHERE p.invoice_id = ? ORDER BY p.paid_at, p.id`,
    id
  )).map((payment) => ({
    id: payment.id,
    amount: payment.amount,
    method: payment.method,
    reference: payment.reference,
    paidAt: payment.paid_at,
    receivedByName: payment.received_by_name || 'System',
  }));
  return {
    invoice: mapInvoice(row),
    items,
    payments,
  };
}

async function nextInvoiceNumber() {
  const year = new Date().getFullYear();
  const row = (await get('SELECT MAX(id) AS maxId FROM invoices'));
  const next = Number(row?.maxId || 0) + 1;
  return `INV-${year}-${String(next).padStart(4, '0')}`;
}

export async function recalcInvoice(invoiceId) {
  const invoice = (await get('SELECT * FROM invoices WHERE id = ?', invoiceId));
  if (!invoice) throw notFound('Invoice not found.');
  const totals = (await get(
    `SELECT
       COALESCE(SUM(amount), 0) AS subtotal,
       COALESCE(SUM(CASE WHEN category = 'room' THEN amount ELSE 0 END), 0) AS room_total,
       COALESCE(SUM(CASE WHEN category <> 'room' THEN amount ELSE 0 END), 0) AS extras_total
     FROM invoice_items WHERE invoice_id = ?`,
    invoiceId
  ));
  const subtotal = round2(totals.subtotal);
  const discount = Math.min(round2(invoice.discount), subtotal);
  const taxable = round2(Math.max(0, subtotal - discount));
  const tax = round2((taxable * invoice.tax_rate) / 100);
  const total = round2(taxable + tax);
  const paid = round2(
    (await get('SELECT COALESCE(SUM(amount), 0) AS paid FROM payments WHERE invoice_id = ?', invoiceId)).paid
  );
  let status = invoice.status;
  if (status !== 'void') status = paid >= total - 0.005 ? 'paid' : 'open';
  (await run(
    `UPDATE invoices
     SET room_total = ?, extras_total = ?, discount = ?, tax_amount = ?, total = ?,
         amount_paid = ?, status = ?
     WHERE id = ?`,
    round2(totals.room_total),
    round2(totals.extras_total),
    discount,
    tax,
    total,
    paid,
    status,
    invoiceId
  ));
  return (await get('SELECT * FROM invoices WHERE id = ?', invoiceId));
}

export async function addInvoiceItem(invoiceId, data, userId) {
  const invoice = (await get('SELECT * FROM invoices WHERE id = ?', invoiceId));
  if (!invoice) throw notFound('Invoice not found.');
  if (invoice.status === 'void') throw badRequest('Voided invoices cannot be changed.');
  if (invoice.status === 'paid') throw badRequest('This invoice is already paid and cannot be changed.');
  const description = requiredText(data.description, 'Charge description', 120);
  const category = ['food', 'service', 'other'].includes(data.category) ? data.category : 'other';
  const qty = Number(data.qty) || 1;
  const unitPrice = Number(data.unitPrice);
  if (qty <= 0) throw badRequest('Quantity must be greater than zero.');
  if (!Number.isFinite(unitPrice) || unitPrice < 0) throw badRequest('Enter a valid unit price.');
  const amount = round2(qty * unitPrice);
  (await transaction(async () => {
    (await run(
      `INSERT INTO invoice_items (invoice_id, description, category, qty, unit_price, amount)
       VALUES (?, ?, ?, ?, ?, ?)`,
      invoiceId,
      description,
      category,
      qty,
      round2(unitPrice),
      amount
    ));
    (await recalcInvoice(invoiceId));
  }));
  (await logActivity(userId, 'invoice.item_added', 'invoice', `Charge "${description}" added to ${invoice.number}.`));
  return (await invoiceDetail(invoiceId));
}

export async function removeInvoiceItem(invoiceId, itemId, userId) {
  const invoice = (await get('SELECT * FROM invoices WHERE id = ?', invoiceId));
  if (!invoice) throw notFound('Invoice not found.');
  if (invoice.status !== 'open') throw badRequest('Only open invoices can be changed.');
  const item = (await get('SELECT * FROM invoice_items WHERE id = ? AND invoice_id = ?', itemId, invoiceId));
  if (!item) throw notFound('Charge not found.');
  if (item.category === 'room') throw badRequest('The room charge cannot be removed.');
  (await transaction(async () => {
    (await run('DELETE FROM invoice_items WHERE id = ?', itemId));
    (await recalcInvoice(invoiceId));
  }));
  (await logActivity(userId, 'invoice.item_removed', 'invoice', `Charge "${item.description}" removed from ${invoice.number}.`));
  return (await invoiceDetail(invoiceId));
}

export async function addPayment(invoiceId, data, userId) {
  const invoice = (await get('SELECT * FROM invoices WHERE id = ?', invoiceId));
  if (!invoice) throw notFound('Invoice not found.');
  if (invoice.status === 'void') throw badRequest('Voided invoices cannot accept payments.');
  const balance = round2(invoice.total - invoice.amount_paid);
  if (balance <= 0.005) throw badRequest('This invoice is already fully paid.');
  const amount = round2(Number(data.amount) || 0);
  if (amount <= 0) throw badRequest('Enter a payment amount greater than zero.');
  if (amount > balance + 0.005) throw badRequest('The payment is greater than the remaining balance.');
  const method = PAYMENT_METHODS.includes(data.method) ? data.method : 'cash';
  (await transaction(async () => {
    (await run(
      `INSERT INTO payments (invoice_id, amount, method, reference, paid_at, received_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
      invoiceId,
      amount,
      method,
      optionalText(data.reference, 80),
      nowIso(),
      userId
    ));
    (await recalcInvoice(invoiceId));
  }));
  (await logActivity(userId, 'payment.received', 'invoice', `Payment recorded on ${invoice.number}.`));
  return (await invoiceDetail(invoiceId));
}

export async function updateInvoice(invoiceId, data, userId) {
  const invoice = (await get('SELECT * FROM invoices WHERE id = ?', invoiceId));
  if (!invoice) throw notFound('Invoice not found.');
  if (invoice.status !== 'open') throw badRequest('Only open invoices can be edited.');
  if (data.discount !== undefined) {
    const discount = round2(Number(data.discount) || 0);
    if (discount < 0) throw badRequest('Discount cannot be negative.');
    if (discount > round2(invoice.room_total + invoice.extras_total)) {
      throw badRequest('Discount cannot be more than the bill subtotal.');
    }
    (await run('UPDATE invoices SET discount = ? WHERE id = ?', discount, invoiceId));
  }
  if (data.notes !== undefined) {
    (await run('UPDATE invoices SET notes = ? WHERE id = ?', optionalText(data.notes), invoiceId));
  }
  (await recalcInvoice(invoiceId));
  (await logActivity(userId, 'invoice.updated', 'invoice', `${invoice.number} was updated.`));
  return (await invoiceDetail(invoiceId));
}

export async function voidInvoice(invoiceId, userId) {
  const invoice = (await get('SELECT * FROM invoices WHERE id = ?', invoiceId));
  if (!invoice) throw notFound('Invoice not found.');
  if (invoice.status === 'void') throw badRequest('This invoice is already void.');
  if (invoice.amount_paid > 0.005) throw badRequest('Invoices with recorded payments cannot be voided.');
  (await run(`UPDATE invoices SET status = 'void' WHERE id = ?`, invoiceId));
  (await logActivity(userId, 'invoice.voided', 'invoice', `${invoice.number} was voided.`));
  return (await invoiceDetail(invoiceId));
}

export async function billingSummary() {
  const open = (await get(
    `SELECT COUNT(*) AS count, COALESCE(SUM(total - amount_paid), 0) AS balance
     FROM invoices WHERE status = 'open'`
  ));
  const today = todayStr();
  const month = today.slice(0, 7);
  const collectedToday = (await get(
    'SELECT COALESCE(SUM(amount), 0) AS total FROM payments WHERE substr(paid_at, 1, 10) = ?',
    today
  )).total;
  const collectedMonth = (await get(
    'SELECT COALESCE(SUM(amount), 0) AS total FROM payments WHERE substr(paid_at, 1, 7) = ?',
    month
  )).total;
  const paidCount = (await get(`SELECT COUNT(*) AS count FROM invoices WHERE status = 'paid'`)).count;
  return {
    openCount: open.count,
    openBalance: round2(open.balance),
    collectedToday: round2(collectedToday),
    collectedMonth: round2(collectedMonth),
    paidCount,
  };
}

/* ------------------------------------------------------------------ */
/* Operational views                                                   */
/* ------------------------------------------------------------------ */

async function reservationCounts() {
  const counts = { reserved: 0, checked_in: 0, checked_out: 0, cancelled: 0, pending: 0 };
  for (const row of (await all(
    'SELECT status, approval_status, COUNT(*) AS count FROM reservations GROUP BY status, approval_status'
  ))) {
    counts[row.status] += row.count;
    if (row.status === 'reserved' && row.approval_status === 'pending') counts.pending += row.count;
  }
  counts.reserved -= counts.pending;
  return counts;
}

export async function dashboardData() {
  const today = todayStr();
  const rooms = (await listRooms());
  const totalRooms = rooms.length;
  const statusCounts = { available: 0, occupied: 0, reserved: 0, cleaning: 0, maintenance: 0 };
  for (const room of rooms) {
    const key = room.displayStatus;
    statusCounts[key] = (statusCounts[key] || 0) + 1;
  }
  const inHouse = (await listReservations({ status: 'checked_in' }));
  const reserved = (await listReservations({ status: 'reserved', approval: 'confirmed', order: 'asc' }));
  const pendingRequests = (await listReservations({ status: 'reserved', approval: 'pending', order: 'asc' }));
  const arrivals = reserved.filter((reservation) => reservation.checkInDate <= today);
  const departures = inHouse.filter((reservation) => reservation.checkOutDate <= today);
  const revenueToday = round2(
    (await get('SELECT COALESCE(SUM(amount), 0) AS total FROM payments WHERE substr(paid_at, 1, 10) = ?', today)).total
  );
  const upcoming = (await get(
    `SELECT COUNT(*) AS count FROM reservations
     WHERE status = 'reserved' AND approval_status = 'confirmed'
       AND check_in_date > ? AND check_in_date <= ?`,
    today,
    addDays(today, 7)
  )).count;
  const occupancyPct = totalRooms ? Math.round((statusCounts.occupied / totalRooms) * 100) : 0;

  return {
    today,
    settings: (await getSettings()),
    rooms,
    statusCounts,
    totalRooms,
    occupancyPct,
    stats: {
      occupancyPct,
      available: statusCounts.available,
      inHouse: inHouse.length,
      arrivals: arrivals.length,
      departures: departures.length,
      revenueToday,
      upcoming,
      pending: pendingRequests.length,
    },
    arrivals,
    departures,
    inHouse,
    pendingRequests,
    series: (await occupancySeries(addDays(today, -6), today)),
    activity: (await listActivity(8)),
    reservationCounts: (await reservationCounts()),
  };
}

export async function frontDeskData() {
  const today = todayStr();
  const inHouse = (await listReservations({ status: 'checked_in', order: 'asc' }));
  const reserved = (await listReservations({ status: 'reserved', approval: 'confirmed', order: 'asc' }));
  const pendingRequests = (await listReservations({ status: 'reserved', approval: 'pending', order: 'asc' }));
  const arrivals = reserved.filter((reservation) => reservation.checkInDate <= today);
  const departures = inHouse
    .filter((reservation) => reservation.checkOutDate <= today)
    .map((reservation) => ({ ...reservation, overdue: reservation.checkOutDate < today }));
  const staying = inHouse.filter((reservation) => reservation.checkOutDate > today);
  return {
    today,
    settings: (await getSettings()),
    arrivals,
    departures,
    inHouse: staying,
    overdue: departures.filter((reservation) => reservation.overdue),
    pendingRequests,
    nextArrivals: reserved.filter((reservation) => reservation.checkInDate > today).slice(0, 5),
  };
}

export async function housekeepingData() {
  const rooms = (await listRooms());
  const lastLogs = (await all(
    `SELECT h.* FROM housekeeping_logs h
     WHERE h.id IN (SELECT MAX(id) FROM housekeeping_logs GROUP BY room_id)`
  ));
  const lastByRoom = new Map(lastLogs.map((log) => [log.room_id, log]));
  const decorate = (room) => {
    const log = lastByRoom.get(room.id);
    return {
      ...room,
      lastNote: log?.note || '',
      lastUpdate: log?.created_at || room.updatedAt,
    };
  };
  const logs = (await all(
    `SELECT h.*, rm.number AS room_number, u.full_name AS updated_by_name
     FROM housekeeping_logs h
     JOIN rooms rm ON rm.id = h.room_id
     LEFT JOIN users u ON u.id = h.updated_by
     ORDER BY h.id DESC LIMIT 12`
  )).map((log) => ({
    id: log.id,
    roomNumber: log.room_number,
    status: log.status,
    note: log.note,
    updatedByName: log.updated_by_name || 'System',
    createdAt: log.created_at,
  }));
  return {
    needsCleaning: rooms.filter((room) => room.status === 'cleaning').map(decorate),
    ready: rooms.filter((room) => room.status === 'available'),
    outOfService: rooms.filter((room) => room.status === 'maintenance').map(decorate),
    occupied: rooms.filter((room) => room.status === 'occupied'),
    logs,
    counts: {
      needsCleaning: rooms.filter((room) => room.status === 'cleaning').length,
      ready: rooms.filter((room) => room.status === 'available').length,
      outOfService: rooms.filter((room) => room.status === 'maintenance').length,
      occupied: rooms.filter((room) => room.status === 'occupied').length,
      reserved: rooms.filter((room) => room.displayStatus === 'reserved').length,
    },
  };
}

export async function occupancySeries(from, to) {
  const today = todayStr();
  const totalRooms = Math.max(1, (await get('SELECT COUNT(*) AS count FROM rooms')).count);
  const occupiedNow = (await get(`SELECT COUNT(*) AS count FROM rooms WHERE status = 'occupied'`)).count;
  const stays = (await all(
    `SELECT check_in_date, check_out_date FROM reservations WHERE status IN ('checked_in', 'checked_out')`
  ));
  const series = [];
  let cursor = from;
  let guard = 0;
  while (cursor <= to && guard < 400) {
    const occupied =
      cursor === today
        ? occupiedNow
        : stays.filter((stay) => stay.check_in_date <= cursor && stay.check_out_date > cursor).length;
    series.push({
      date: cursor,
      occupied,
      total: totalRooms,
      pct: Math.round((occupied / totalRooms) * 100),
    });
    cursor = addDays(cursor, 1);
    guard += 1;
  }
  return series;
}

export async function reportsData(from, to) {
  if (!isDateString(from) || !isDateString(to)) throw badRequest('Choose a valid date range.');
  if (to < from) throw badRequest('The end date must be after the start date.');
  if (diffDays(from, to) > 366) throw badRequest('Choose a range of one year or less.');

  const invoices = (await all(
    `SELECT * FROM invoices WHERE status <> 'void' AND substr(issued_at, 1, 10) BETWEEN ? AND ?`,
    from,
    to
  ));
  const collectedRows = (await all(
    `SELECT substr(paid_at, 1, 10) AS day, SUM(amount) AS amount
     FROM payments WHERE substr(paid_at, 1, 10) BETWEEN ? AND ? GROUP BY day`,
    from,
    to
  ));
  const collectedByDay = new Map(collectedRows.map((row) => [row.day, row.amount]));

  const roomRevenue = round2(invoices.reduce((sum, invoice) => sum + invoice.room_total, 0));
  const extrasRevenue = round2(invoices.reduce((sum, invoice) => sum + invoice.extras_total, 0));
  const taxAmount = round2(invoices.reduce((sum, invoice) => sum + invoice.tax_amount, 0));
  const invoiced = round2(invoices.reduce((sum, invoice) => sum + invoice.total, 0));
  const nightsSold = invoices.reduce((sum, invoice) => sum + invoice.nights, 0);
  const collected = round2([...collectedByDay.values()].reduce((sum, value) => sum + value, 0));
  const outstanding = round2(
    (await get(`SELECT COALESCE(SUM(total - amount_paid), 0) AS balance FROM invoices WHERE status = 'open'`)).balance
  );
  const series = (await occupancySeries(from, to)).map((point) => ({
    ...point,
    collected: round2(collectedByDay.get(point.date) || 0),
  }));
  const occupancyAvg = series.length
    ? Math.round(series.reduce((sum, point) => sum + point.pct, 0) / series.length)
    : 0;

  const categories = (await all(
    `SELECT it.category AS category, SUM(it.amount) AS amount
     FROM invoice_items it
     JOIN invoices i ON i.id = it.invoice_id
     WHERE i.status <> 'void' AND substr(i.issued_at, 1, 10) BETWEEN ? AND ?
     GROUP BY it.category ORDER BY amount DESC`,
    from,
    to
  ));
  const methods = (await all(
    `SELECT method, COUNT(*) AS count, SUM(amount) AS amount
     FROM payments WHERE substr(paid_at, 1, 10) BETWEEN ? AND ?
     GROUP BY method ORDER BY amount DESC`,
    from,
    to
  ));
  const statuses = (await all(
    `SELECT status, COUNT(*) AS count FROM reservations
     WHERE check_in_date BETWEEN ? AND ? GROUP BY status`,
    from,
    to
  ));
  const roomTypes = (await all(
    `SELECT room_type AS type, SUM(nights) AS nights, SUM(room_total) AS revenue
     FROM invoices
     WHERE status <> 'void' AND substr(issued_at, 1, 10) BETWEEN ? AND ?
     GROUP BY room_type ORDER BY revenue DESC`,
    from,
    to
  ));
  const bookings = (await get(
    `SELECT COUNT(*) AS count FROM reservations WHERE check_in_date BETWEEN ? AND ?`,
    from,
    to
  )).count;

  return {
    from,
    to,
    settings: (await getSettings()),
    summary: {
      invoiced,
      roomRevenue,
      extrasRevenue,
      taxAmount,
      collected,
      outstanding,
      nightsSold,
      adr: nightsSold ? round2(roomRevenue / nightsSold) : 0,
      occupancyAvg,
      bookings,
      invoices: invoices.length,
    },
    series,
    categories,
    methods: methods.map((row) => ({ ...row, amount: round2(row.amount) })),
    statuses,
    roomTypes: roomTypes.map((row) => ({ ...row, revenue: round2(row.revenue) })),
  };
}

/* ------------------------------------------------------------------ */
/* Staff accounts                                                      */
/* ------------------------------------------------------------------ */

export async function listUsers() {
  return (await all('SELECT * FROM users ORDER BY active DESC, full_name')).map(publicUser);
}

export async function createUser(data) {
  const username = requiredText(data.username, 'Username', 40).toLowerCase();
  if (!/^[a-z0-9._-]{3,40}$/.test(username)) {
    throw badRequest('Username must be 3-40 characters using letters, numbers, dots, dashes or underscores.');
  }
  const fullName = requiredText(data.fullName, 'Full name', 120);
  const role = ROLES.includes(data.role) ? data.role : null;
  if (!role) throw badRequest('Choose a valid role.');
  const password = String(data.password ?? '');
  if (password.length < 6) throw badRequest('Password must be at least 6 characters.');
  if ((await get('SELECT id FROM users WHERE username = ?', username))) {
    throw badRequest('That username is already taken.');
  }
  const result = (await run(
    `INSERT INTO users (username, password_hash, full_name, role, phone, active, created_at)
     VALUES (?, ?, ?, ?, ?, 1, ?)`,
    username,
    hashPassword(password),
    fullName,
    role,
    optionalText(data.phone, 40),
    nowIso()
  ));
  (await logActivity(null, 'user.created', 'user', `Account ${username} (${role}) was created.`));
  return publicUser((await get('SELECT * FROM users WHERE id = ?', Number(result.lastInsertRowid))));
}

export async function updateUser(actor, id, data) {
  const user = (await get('SELECT * FROM users WHERE id = ?', id));
  if (!user) throw notFound('Staff account not found.');
  const isSelf = actor.id === id;

  if (data.active !== undefined) {
    const active = data.active ? 1 : 0;
    if (isSelf && !active) throw badRequest('You cannot deactivate your own account.');
    (await run('UPDATE users SET active = ? WHERE id = ?', active, id));
  }
  if (data.role !== undefined && data.role !== user.role) {
    if (!ROLES.includes(data.role)) throw badRequest('Choose a valid role.');
    if (isSelf) throw badRequest('You cannot change your own role.');
    (await run('UPDATE users SET role = ? WHERE id = ?', data.role, id));
  }
  if (data.fullName !== undefined) {
    (await run('UPDATE users SET full_name = ? WHERE id = ?', requiredText(data.fullName, 'Full name', 120), id));
  }
  if (data.phone !== undefined) {
    (await run('UPDATE users SET phone = ? WHERE id = ?', optionalText(data.phone, 40), id));
  }
  if (data.password !== undefined) {
    const password = String(data.password);
    if (password.length < 6) throw badRequest('Password must be at least 6 characters.');
    (await run('UPDATE users SET password_hash = ? WHERE id = ?', hashPassword(password), id));
  }
  (await logActivity(actor.id, 'user.updated', 'user', `Account ${user.username} was updated.`));
  return publicUser((await get('SELECT * FROM users WHERE id = ?', id)));
}

export async function staffSummary() {
  const rows = (await all(`SELECT role, COUNT(*) AS count FROM users WHERE active = 1 GROUP BY role`));
  const counts = { admin: 0, receptionist: 0, manager: 0, housekeeping: 0 };
  for (const row of rows) counts[row.role] = row.count;
  return { counts, total: Object.values(counts).reduce((sum, value) => sum + value, 0) };
}

/* ------------------------------------------------------------------ */
/* Public guest site                                                   */
/* ------------------------------------------------------------------ */

function publicRoomTypes(rooms) {
  const grouped = new Map();
  for (const room of rooms) {
    const info = roomTypeInfo(room.type);
    const current = grouped.get(room.type) || {
      type: room.type,
      ...info,
      rateFrom: room.rate,
      availableCount: 0,
      rooms: [],
    };
    current.rateFrom = Math.min(current.rateFrom, room.rate);
    current.availableCount += 1;
    current.rooms.push({ id: room.id, number: room.number, rate: room.rate, floor: room.floor });
    grouped.set(room.type, current);
  }
  return [...grouped.values()].sort((a, b) => a.rateFrom - b.rateFrom);
}

export async function publicHotelInfo() {
  const settings = (await getSettings());
  const rooms = (await all('SELECT * FROM rooms ORDER BY floor, number'));
  const available = (await all(`SELECT * FROM rooms WHERE status <> 'maintenance' ORDER BY floor, number`));
  const roomTypes = publicRoomTypes(available);
  return {
    hotel: {
      name: settings.hotelName,
      address: settings.address,
      phone: settings.phone,
      email: settings.email,
      currencySymbol: settings.currencySymbol,
      checkInTime: settings.checkInTime,
      checkOutTime: settings.checkOutTime,
      taxRate: settings.taxRate,
    },
    roomTypes,
    stats: {
      rooms: rooms.length,
      roomTypes: roomTypes.length,
      guestsServed: (await get('SELECT COUNT(DISTINCT guest_id) AS count FROM reservations')).count,
    },
  };
}

export async function publicAvailability({ checkInDate, checkOutDate, adults = 1, children = 0 }) {
  if (!isDateString(checkInDate) || !isDateString(checkOutDate)) {
    throw badRequest('Choose valid check-in and check-out dates.');
  }
  if (diffDays(checkInDate, checkOutDate) < 1) {
    throw badRequest('Check-out must be after check-in.');
  }
  if (checkInDate < todayStr()) {
    throw badRequest('Check-in date cannot be in the past.');
  }
  if (diffDays(checkInDate, checkOutDate) > 30) {
    throw badRequest('Online requests are limited to stays of 30 nights or fewer.');
  }
  const guestCount = Math.max(1, Number(adults) || 1) + Math.max(0, Number(children) || 0);
  const rooms = (await availableRooms(checkInDate, checkOutDate)).filter((room) => {
    return roomTypeInfo(room.type).maxGuests >= guestCount;
  });
  return {
    checkInDate,
    checkOutDate,
    nights: diffDays(checkInDate, checkOutDate),
    adults: Math.max(1, Number(adults) || 1),
    children: Math.max(0, Number(children) || 0),
    roomTypes: publicRoomTypes(rooms),
    totalAvailable: rooms.length,
  };
}

/* ------------------------------------------------------------------ */
/* Database explorer (read-only, administrator only)                   */
/* ------------------------------------------------------------------ */

const DATABASE_TABLES = {
  users: 'Staff accounts, roles and sign-in details.',
  rooms: 'Room inventory, nightly rates and housekeeping status.',
  guests: 'Guest contact profiles used by front desk and billing.',
  reservations: 'Bookings from inquiry through check-in and check-out.',
  invoices: 'Guest folios with totals, tax and payment status.',
  invoice_items: 'Room charges and extra services on each folio.',
  payments: 'Every payment recorded against a folio.',
  housekeeping_logs: 'Room readiness updates from the housekeeping team.',
  activity_log: 'Audit trail of important actions in the system.',
  settings: 'Hotel name, contact details, tax rate and policies.',
};

const MASKED_COLUMNS = { users: ['password_hash'] };

function quoteIdentifier(name) {
  return `\`${String(name).replaceAll('`', '``')}\``;
}

export async function databaseOverview() {
  const version = await get('SELECT VERSION() AS version');
  const schemaRows = await all(
    `SELECT TABLE_NAME AS name FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_NAME`,
    DB.database
  );
  const names = schemaRows.map((row) => row.name).filter((name) => DATABASE_TABLES[name]);
  const size = await get(
    `SELECT COALESCE(SUM(DATA_LENGTH + INDEX_LENGTH), 0) AS bytes
     FROM information_schema.TABLES WHERE TABLE_SCHEMA = ?`,
    DB.database
  );
  const foreignKeys = await get(
    `SELECT COUNT(*) AS count FROM information_schema.TABLE_CONSTRAINTS
     WHERE CONSTRAINT_SCHEMA = ? AND CONSTRAINT_TYPE = 'FOREIGN KEY'`,
    DB.database
  );
  const tables = [];
  for (const name of names) {
    const count = await get(`SELECT COUNT(*) AS count FROM ${quoteIdentifier(name)}`);
    const columnCount = await get(
      `SELECT COUNT(*) AS count FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
      DB.database,
      name
    );
    tables.push({
      name,
      label: name.replaceAll('_', ' '),
      description: DATABASE_TABLES[name],
      rows: Number(count.count),
      columns: Number(columnCount.count),
    });
  }
  return {
    engine: `MySQL ${version.version}`,
    location: `${DB.database} on ${DB.host}:${DB.port}`,
    database: DB.database,
    host: `${DB.host}:${DB.port}`,
    sizeBytes: Number(size.bytes),
    storageEngine: 'InnoDB',
    foreignKeys: Number(foreignKeys.count) > 0,
    tables,
  };
}

export async function databaseTable(name, { limit = 50, offset = 0 } = {}) {
  if (!Object.hasOwn(DATABASE_TABLES, name)) throw notFound('That database table is not available.');
  const table = quoteIdentifier(name);
  const columnRows = await all(
    `SELECT COLUMN_NAME AS name, COLUMN_TYPE AS type, IS_NULLABLE AS nullable,
            COLUMN_DEFAULT AS defaultValue, COLUMN_KEY AS columnKey, EXTRA AS extra
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
     ORDER BY ORDINAL_POSITION`,
    DB.database,
    name
  );
  const columns = columnRows.map((column) => ({
    name: column.name,
    type: column.type,
    notNull: column.nullable === 'NO',
    defaultValue: column.defaultValue,
    primaryKey: column.columnKey === 'PRI',
  }));

  const fkRows = await all(
    `SELECT k.COLUMN_NAME AS columnName, k.REFERENCED_TABLE_NAME AS refTable,
            k.REFERENCED_COLUMN_NAME AS refColumn
     FROM information_schema.KEY_COLUMN_USAGE k
     WHERE k.TABLE_SCHEMA = ? AND k.TABLE_NAME = ? AND k.REFERENCED_TABLE_NAME IS NOT NULL
     ORDER BY k.CONSTRAINT_NAME, k.ORDINAL_POSITION`,
    DB.database,
    name
  );
  const foreignKeys = fkRows.map((fk) => ({
    column: fk.columnName,
    referencesTable: fk.refTable,
    referencesColumn: fk.refColumn,
  }));

  const indexRows = await all(
    `SELECT INDEX_NAME AS name, NON_UNIQUE AS nonUnique, SEQ_IN_INDEX AS position,
            COLUMN_NAME AS columnName
     FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
     ORDER BY INDEX_NAME, SEQ_IN_INDEX`,
    DB.database,
    name
  );
  const indexMap = new Map();
  for (const row of indexRows) {
    if (!indexMap.has(row.name)) {
      indexMap.set(row.name, { name: row.name, unique: Number(row.nonUnique) === 0, columns: [] });
    }
    indexMap.get(row.name).columns.push(row.columnName);
  }

  const total = await get(`SELECT COUNT(*) AS count FROM ${table}`);
  const safeLimit = Math.min(200, Math.max(1, Number(limit) || 50));
  const safeOffset = Math.max(0, Number(offset) || 0);
  const orderColumn = columns.find((column) => column.primaryKey)?.name || columns[0]?.name;
  const orderBy = orderColumn ? ` ORDER BY ${quoteIdentifier(orderColumn)} DESC` : '';
  const rawRows = await all(
    `SELECT * FROM ${table}${orderBy} LIMIT ? OFFSET ?`,
    safeLimit,
    safeOffset
  );
  const rows = rawRows.map((row) => {
    const copy = { ...row };
    for (const column of MASKED_COLUMNS[name] || []) {
      if (copy[column]) copy[column] = 'hidden (secure hash)';
    }
    return copy;
  });

  return {
    table: name,
    label: name.replaceAll('_', ' '),
    description: DATABASE_TABLES[name],
    columns,
    foreignKeys,
    indexes: [...indexMap.values()],
    total: Number(total.count),
    limit: safeLimit,
    offset: safeOffset,
    rows,
  };
}
