import { all, get, run, nowIso, todayStr, addDays, diffDays, round2 } from './db.js';
import { hashPassword } from './auth.js';
import { recalcInvoice } from './services.js';

const today = todayStr();

function minutesAgo(minutes) {
  return nowIso(new Date(Date.now() - minutes * 60000));
}

function daysAgoAt(days, hour = 11, minute = 15) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(hour, minute, 0, 0);
  return nowIso(date);
}

function stamp(spec) {
  if (!spec) return null;
  if (spec.minutes != null) return minutesAgo(spec.minutes);
  return daysAgoAt(spec.days, spec.hour ?? 11, spec.minute ?? 15);
}

export async function seedIfEmpty() {
  const existing = await get('SELECT COUNT(*) AS count FROM users');
  if (existing.count > 0) return false;

  await seedSettings();
  const users = await seedUsers();
  await seedRooms();
  const guests = await seedGuests();
  await seedOperations({ users, guests });
  return true;
}

async function seedSettings() {
  const settings = {
    hotel_name: 'Sunrise Hotel',
    address: '88 Santiago Boulevard, General Santos City, South Cotabato',
    phone: '+63 83 552 1700',
    email: 'frontdesk@sunrisehotel.ph',
    currency: 'PHP',
    currency_symbol: '\u20B1',
    tax_rate: '12',
    check_in_time: '14:00',
    check_out_time: '12:00',
  };
  for (const [key, value] of Object.entries(settings)) {
    await run('INSERT INTO settings (`key`, value) VALUES (?, ?)', key, value);
  }
}

async function seedUsers() {
  const staff = [
    ['admin', 'Jansel Antonio', 'admin', 'admin123', '0917 800 1100'],
    ['manager', 'Elena Reyes', 'manager', 'manager123', '0917 800 1200'],
    ['reception', 'Ana Cruz', 'receptionist', 'reception123', '0917 800 1300'],
    ['housekeeping', 'Lorna Diaz', 'housekeeping', 'housekeeping123', '0917 800 1400'],
    ['joey.lim', 'Joey Lim', 'receptionist', 'staff123', '0917 800 1301'],
    ['kim.tan', 'Kim Tan', 'receptionist', 'staff123', '0917 800 1302'],
    ['paolo.garcia', 'Paolo Garcia', 'receptionist', 'staff123', '0917 800 1303'],
    ['grace.uy', 'Grace Uy', 'housekeeping', 'staff123', '0917 800 1401'],
    ['mila.reyes', 'Mila Reyes', 'housekeeping', 'staff123', '0917 800 1402'],
    ['nora.bautista', 'Nora Bautista', 'housekeeping', 'staff123', '0917 800 1403'],
    ['tess.ramos', 'Tess Ramos', 'housekeeping', 'staff123', '0917 800 1404'],
    ['joy.cruz', 'Joy Cruz', 'housekeeping', 'staff123', '0917 800 1405'],
    ['rina.lopez', 'Rina Lopez', 'housekeeping', 'staff123', '0917 800 1406'],
    ['beth.ong', 'Beth Ong', 'housekeeping', 'staff123', '0917 800 1407'],
    ['carla.diaz', 'Carla Diaz', 'housekeeping', 'staff123', '0917 800 1408'],
  ];
  const map = new Map();
  let index = 0;
  for (const [username, fullName, role, password, phone] of staff) {
    const result = await run(
      `INSERT INTO users (username, password_hash, full_name, role, phone, active, created_at)
       VALUES (?, ?, ?, ?, ?, 1, ?)`,
      username,
      hashPassword(password),
      fullName,
      role,
      phone,
      daysAgoAt(-180 + index, 9, 0)
    );
    map.set(username, Number(result.lastInsertRowid));
    index += 1;
  }
  return map;
}

async function seedRooms() {
  const configuration = [
    { prefix: '1', floor: 1, count: 8, type: 'Standard Room', rate: 1800 },
    { prefix: '2', floor: 2, count: 8, type: 'Deluxe Room', rate: 2600 },
    { prefix: '3', floor: 3, count: 4, type: 'Family Suite', rate: 3800 },
  ];
  const rooms = [];
  for (const block of configuration) {
    for (let i = 1; i <= block.count; i += 1) {
      const number = `${block.prefix}${String(i).padStart(2, '0')}`;
      rooms.push({ number, type: block.type, floor: block.floor, rate: block.rate });
    }
  }
  for (let i = 5; i <= 8; i += 1) {
    rooms.push({ number: `3${String(i).padStart(2, '0')}`, type: 'Executive Suite', floor: 3, rate: 5200 });
  }
  const map = new Map();
  for (const room of rooms) {
    const result = await run(
      `INSERT INTO rooms (number, type, floor, rate, status, notes, updated_at)
       VALUES (?, ?, ?, ?, 'available', '', ?)`,
      room.number,
      room.type,
      room.floor,
      room.rate,
      daysAgoAt(-60, 9, 0)
    );
    map.set(room.number, Number(result.lastInsertRowid));
  }
  return map;
}

async function seedGuests() {
  const guests = [
    ['Miguel Santos', '+63 917 234 5678', 'miguel.santos@example.com', '12 Santiago Boulevard, General Santos City', 'Passport', 'P8842190A'],
    ['Sofia Reyes', '+63 918 345 6789', 'sofia.reyes@example.com', '45 Bonifacio High Street, Taguig', 'Driver\u2019s License', 'N02-18-004512'],
    ['Daniel Tan', '+63 919 456 7890', 'daniel.tan@example.com', '8 Scout Borromeo, Quezon City', 'Passport', 'P7731042B'],
    ['Isabelle Cruz', '+63 920 567 8901', 'isabelle.cruz@example.com', '22 Ortigas Center, Pasig', 'National ID', '1234-5678-9012'],
    ['Rafael Mendoza', '+63 921 678 9012', 'rafael.mendoza@example.com', '77 Shaw Boulevard, Mandaluyong', 'Driver\u2019s License', 'N01-17-009821'],
    ['Camille Lim', '+63 922 789 0123', 'camille.lim@example.com', '3 Roxas Boulevard, Manila', 'Passport', 'P6653321C'],
    ['Gabriel Garcia', '+63 923 890 1234', 'gabriel.garcia@example.com', '18 McKinley Hill, Taguig', 'National ID', '2345-6789-0123'],
    ['Bianca Ramos', '+63 924 901 2345', 'bianca.ramos@example.com', '52 Sucat Road, Para\u00F1aque', 'Passport', 'P5518834D'],
    ['Marco Villanueva', '+63 925 012 3456', 'marco.villanueva@example.com', '14 Escario Street, Cebu City', 'Driver\u2019s License', 'N03-19-771200'],
    ['Andrea Flores', '+63 926 123 4567', 'andrea.flores@example.com', '9 Quimpo Boulevard, Davao City', 'National ID', '3456-7890-1234'],
    ['Nathan Bautista', '+63 927 234 5678', 'nathan.bautista@example.com', '31 Nuvali Boulevard, Laguna', 'Passport', 'P4427116E'],
    ['Chloe Navarro', '+63 928 345 6789', 'chloe.navarro@example.com', '6 Aguinaldo Highway, Cavite', 'Driver\u2019s License', 'N04-20-118934'],
  ];
  const ids = [];
  let index = 0;
  for (const guest of guests) {
    const result = await run(
      `INSERT INTO guests (full_name, phone, email, address, id_type, id_number, notes, created_at)
       VALUES (?, ?, ?, ?, ?, ?, '', ?)`,
      ...guest,
      daysAgoAt(-120 + index * 4, 10, 30)
    );
    ids.push(Number(result.lastInsertRowid));
    index += 1;
  }
  return ids;
}

async function seedOperations({ users, guests }) {
  const guestRows = guests;
  const roomRows = await all('SELECT * FROM rooms');
  const roomByNumber = new Map(roomRows.map((room) => [room.number, room]));
  const roomById = new Map(roomRows.map((room) => [room.id, room]));
  const roomId = (number) => roomByNumber.get(number).id;

  const receptionUserId = users.get('reception');
  const housekeepingUserId = users.get('housekeeping');
  const managerUserId = users.get('manager');
  const adminUserId = users.get('admin');

  const plan = [
    // In-house guests
    { key: 'R1', guest: 0, room: '204', inDays: -1, outDays: 2, status: 'checked_in', created: { days: -6, hour: 10 }, checkedIn: { days: -1, hour: 14, minute: 20 } },
    { key: 'R2', guest: 2, room: '302', inDays: -2, outDays: 0, status: 'checked_in', created: { days: -9, hour: 15 }, checkedIn: { days: -2, hour: 15, minute: 5 } },
    { key: 'R3', guest: 5, room: '105', inDays: -1, outDays: 1, status: 'checked_in', created: { days: -3, hour: 11 }, checkedIn: { days: -1, hour: 16, minute: 40 } },
    { key: 'R4', guest: 7, room: '306', inDays: -3, outDays: -1, status: 'checked_in', created: { days: -12, hour: 9 }, checkedIn: { days: -3, hour: 13, minute: 10 } },

    // Arrivals today
    { key: 'R5', guest: 1, room: '201', inDays: 0, outDays: 2, status: 'reserved', created: { days: -2, hour: 14 } },
    { key: 'R6', guest: 3, room: '305', inDays: 0, outDays: 1, status: 'reserved', created: { days: -1, hour: 16 } },
    { key: 'R7', guest: 6, room: '103', inDays: 0, outDays: 3, status: 'reserved', created: { days: -4, hour: 10 } },

    // Upcoming reservations
    { key: 'R8', guest: 8, room: '202', inDays: 1, outDays: 4, status: 'reserved', created: { minutes: 150 } },
    { key: 'R9', guest: 9, room: '303', inDays: 2, outDays: 5, status: 'reserved', created: { days: -1, hour: 11 } },
    { key: 'R10', guest: 4, room: '106', inDays: 3, outDays: 6, status: 'reserved', created: { days: -2, hour: 12 } },
    { key: 'R11', guest: 10, room: '205', inDays: 5, outDays: 7, status: 'reserved', created: { days: -1, hour: 15 } },
    { key: 'R12', guest: 11, room: '307', inDays: 6, outDays: 9, status: 'reserved', created: { days: -3, hour: 9 } },

    // Online booking requests waiting for the front desk
    {
      key: 'R29',
      guest: 3,
      room: '108',
      inDays: 2,
      outDays: 5,
      status: 'reserved',
      source: 'website',
      approval: 'pending',
      created: { minutes: 95 },
      notes: 'Online request. Celebrating an anniversary \u2014 asked for a quiet room.',
    },
    {
      key: 'R30',
      guest: 7,
      room: '304',
      inDays: 1,
      outDays: 3,
      status: 'reserved',
      source: 'website',
      approval: 'pending',
      created: { minutes: 35 },
      notes: 'Online request. Arriving late in the evening.',
    },

    // Cancelled
    { key: 'R13', guest: 2, room: '203', inDays: 4, outDays: 6, status: 'cancelled', created: { days: -5, hour: 13 }, notes: 'Cancelled by guest via phone.' },

    // Completed stays
    { key: 'R14', guest: 0, room: '101', inDays: -9, outDays: -6, status: 'checked_out', created: { days: -20, hour: 10 }, checkedIn: { days: -9, hour: 14 }, checkedOut: { days: -6, hour: 11 } },
    { key: 'R15', guest: 4, room: '206', inDays: -8, outDays: -5, status: 'checked_out', created: { days: -18, hour: 12 }, checkedIn: { days: -8, hour: 15 }, checkedOut: { days: -5, hour: 11 } },
    { key: 'R16', guest: 8, room: '301', inDays: -7, outDays: -4, status: 'checked_out', created: { days: -17, hour: 9 }, checkedIn: { days: -7, hour: 14 }, checkedOut: { days: -4, hour: 11 } },
    { key: 'R17', guest: 10, room: '104', inDays: -6, outDays: -3, status: 'checked_out', created: { days: -15, hour: 16 }, checkedIn: { days: -6, hour: 13 }, checkedOut: { days: -3, hour: 11 } },
    { key: 'R18', guest: 11, room: '207', inDays: -5, outDays: -2, status: 'checked_out', created: { days: -14, hour: 11 }, checkedIn: { days: -5, hour: 14 }, checkedOut: { days: -2, hour: 11 } },
    { key: 'R19', guest: 5, room: '304', inDays: -4, outDays: -1, status: 'checked_out', created: { days: -13, hour: 10 }, checkedIn: { days: -4, hour: 15 }, checkedOut: { days: -1, hour: 11 }, notes: 'Corporate account. Balance billed to company.' },
    { key: 'R20', guest: 6, room: '102', inDays: -3, outDays: -1, status: 'checked_out', created: { days: -10, hour: 9 }, checkedIn: { days: -3, hour: 16 }, checkedOut: { days: -1, hour: 10 } },
    { key: 'R21', guest: 9, room: '208', inDays: -2, outDays: 0, status: 'checked_out', created: { days: -8, hour: 12 }, checkedIn: { days: -2, hour: 14 }, checkedOut: { minutes: 65 } },

    // Older stays that give the reports a full month of history
    { key: 'R22', guest: 0, room: '107', inDays: -28, outDays: -25, status: 'checked_out', created: { days: -36, hour: 10 }, checkedIn: { days: -28, hour: 14 }, checkedOut: { days: -25, hour: 11 } },
    { key: 'R23', guest: 3, room: '202', inDays: -24, outDays: -21, status: 'checked_out', created: { days: -33, hour: 12 }, checkedIn: { days: -24, hour: 15 }, checkedOut: { days: -21, hour: 11 } },
    { key: 'R24', guest: 7, room: '105', inDays: -20, outDays: -17, status: 'checked_out', created: { days: -27, hour: 9 }, checkedIn: { days: -20, hour: 14 }, checkedOut: { days: -17, hour: 11 } },
    { key: 'R25', guest: 9, room: '303', inDays: -16, outDays: -13, status: 'checked_out', created: { days: -24, hour: 16 }, checkedIn: { days: -16, hour: 14 }, checkedOut: { days: -13, hour: 11 } },
    { key: 'R26', guest: 10, room: '204', inDays: -13, outDays: -10, status: 'checked_out', created: { days: -21, hour: 11 }, checkedIn: { days: -13, hour: 15 }, checkedOut: { days: -10, hour: 11 } },
    { key: 'R27', guest: 5, room: '301', inDays: -11, outDays: -8, status: 'checked_out', created: { days: -19, hour: 10 }, checkedIn: { days: -11, hour: 14 }, checkedOut: { days: -8, hour: 11 } },
    { key: 'R28', guest: 1, room: '306', inDays: -19, outDays: -15, status: 'checked_out', created: { days: -26, hour: 13 }, checkedIn: { days: -19, hour: 14 }, checkedOut: { days: -15, hour: 11 } },
  ];

  const reservationIds = new Map();
  for (const item of plan) {
    const checkInDate = addDays(today, item.inDays);
    const checkOutDate = addDays(today, item.outDays);
    const room = roomByNumber.get(item.room);
    const result = await run(
      `INSERT INTO reservations
        (guest_id, room_id, nightly_rate, check_in_date, check_out_date, adults, children,
         status, source, approval_status, notes, created_by, created_at, checked_in_at, checked_out_at)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?)`,
      guestRows[item.guest],
      room.id,
      room.rate,
      checkInDate,
      checkOutDate,
      2,
      item.status,
      item.source || 'front_desk',
      item.approval || 'confirmed',
      item.notes || '',
      item.source === 'website' ? null : receptionUserId,
      stamp(item.created),
      stamp(item.checkedIn),
      stamp(item.checkedOut)
    );
    reservationIds.set(item.key, Number(result.lastInsertRowid));
  }

  // Invoices for completed stays (chronological so numbers read naturally)
  const invoiceNumbers = new Map();
  let sequence = 0;
  const seedInvoice = async ({ key, reservationKey, issued, extras = [], discount = 0, payments = [] }) => {
    const reservation = await get(
      `SELECT r.*, rm.type AS room_type FROM reservations r
       JOIN rooms rm ON rm.id = r.room_id WHERE r.id = ?`,
      reservationIds.get(reservationKey)
    );
    const issuedAt = stamp(issued);
    const nights = Math.max(1, diffDays(reservation.check_in_date, reservation.check_out_date));
    sequence += 1;
    const number = `INV-${issuedAt.slice(0, 4)}-${String(sequence).padStart(4, '0')}`;
    const result = await run(
      `INSERT INTO invoices
        (number, reservation_id, guest_id, room_id, room_type, issued_at, check_in_date, check_out_date,
         nights, nightly_rate, room_total, extras_total, discount, tax_rate, tax_amount, total,
         amount_paid, status, notes, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, 12, 0, 0, 0, 'open', ?, ?)`,
      number,
      reservation.id,
      reservation.guest_id,
      reservation.room_id,
      reservation.room_type,
      issuedAt,
      reservation.check_in_date,
      reservation.check_out_date,
      nights,
      reservation.nightly_rate,
      discount,
      '',
      receptionUserId
    );
    const invoiceId = Number(result.lastInsertRowid);
    invoiceNumbers.set(key, number);

    await run(
      `INSERT INTO invoice_items (invoice_id, description, category, qty, unit_price, amount)
       VALUES (?, ?, 'room', ?, ?, ?)`,
      invoiceId,
      `Room ${roomById.get(reservation.room_id)?.number || ''} \u00B7 ${reservation.room_type} \u00B7 ${nights} night${nights === 1 ? '' : 's'}`,
      nights,
      reservation.nightly_rate,
      round2(nights * reservation.nightly_rate)
    );
    for (const extra of extras) {
      await run(
        `INSERT INTO invoice_items (invoice_id, description, category, qty, unit_price, amount)
         VALUES (?, ?, ?, ?, ?, ?)`,
        invoiceId,
        extra.description,
        extra.category,
        extra.qty,
        extra.unitPrice,
        round2(extra.qty * extra.unitPrice)
      );
    }
    await recalcInvoice(invoiceId);
    const invoice = await get('SELECT * FROM invoices WHERE id = ?', invoiceId);
    for (const payment of payments) {
      const amount = payment.full ? invoice.total : round2(payment.amount);
      await run(
        `INSERT INTO payments (invoice_id, amount, method, reference, paid_at, received_by)
         VALUES (?, ?, ?, ?, ?, ?)`,
        invoiceId,
        amount,
        payment.method,
        payment.reference || '',
        stamp(payment.at),
        payment.receivedBy || receptionUserId
      );
    }
    await recalcInvoice(invoiceId);
    return invoiceId;
  };

  await seedInvoice({
    key: 'INV14',
    reservationKey: 'R14',
    issued: { days: -6, hour: 11, minute: 5 },
    extras: [
      { description: 'Breakfast buffet', category: 'food', qty: 2, unitPrice: 850 },
      { description: 'Airport transfer', category: 'service', qty: 1, unitPrice: 1500 },
    ],
    payments: [{ full: true, method: 'card', reference: 'CARD-8891', at: { days: -6, hour: 11, minute: 20 } }],
  });
  await seedInvoice({
    key: 'INV15',
    reservationKey: 'R15',
    issued: { days: -5, hour: 11, minute: 10 },
    extras: [{ description: 'Laundry service', category: 'service', qty: 1, unitPrice: 600 }],
    payments: [{ full: true, method: 'cash', at: { days: -5, hour: 11, minute: 25 } }],
  });
  await seedInvoice({
    key: 'INV16',
    reservationKey: 'R16',
    issued: { days: -4, hour: 11, minute: 0 },
    extras: [{ description: 'In-room dining', category: 'food', qty: 2, unitPrice: 1200 }],
    payments: [{ full: true, method: 'gcash', reference: 'GC-552104', at: { days: -4, hour: 11, minute: 18 } }],
  });
  await seedInvoice({
    key: 'INV17',
    reservationKey: 'R17',
    issued: { days: -3, hour: 11, minute: 10 },
    payments: [{ full: true, method: 'card', reference: 'CARD-9902', at: { days: -3, hour: 11, minute: 22 } }],
  });
  await seedInvoice({
    key: 'INV18',
    reservationKey: 'R18',
    issued: { days: -2, hour: 11, minute: 5 },
    extras: [{ description: 'Minibar', category: 'food', qty: 1, unitPrice: 950 }],
    discount: 500,
    payments: [{ full: true, method: 'cash', at: { days: -2, hour: 11, minute: 30 } }],
  });
  await seedInvoice({
    key: 'INV19',
    reservationKey: 'R19',
    issued: { days: -1, hour: 11, minute: 5 },
    extras: [{ description: 'Restaurant dinner', category: 'food', qty: 3, unitPrice: 750 }],
    payments: [
      { amount: 3000, method: 'bank', reference: 'BPI-77120', at: { days: -1, hour: 12 } },
      { amount: 2000, method: 'bank', reference: 'BPI-77121', at: { minutes: 28 } },
    ],
  });
  await seedInvoice({
    key: 'INV20',
    reservationKey: 'R20',
    issued: { days: -1, hour: 10, minute: 40 },
    payments: [{ full: true, method: 'cash', at: { days: -1, hour: 10, minute: 45 } }],
  });
  await seedInvoice({
    key: 'INV21',
    reservationKey: 'R21',
    issued: { minutes: 65 },
    extras: [{ description: 'Breakfast', category: 'food', qty: 1, unitPrice: 900 }],
    payments: [{ full: true, method: 'card', reference: 'CARD-1123', at: { minutes: 50 } }],
  });
  await seedInvoice({
    key: 'INV22',
    reservationKey: 'R22',
    issued: { days: -25, hour: 11, minute: 10 },
    extras: [{ description: 'Airport transfer', category: 'service', qty: 1, unitPrice: 1500 }],
    payments: [{ full: true, method: 'card', reference: 'CARD-4402', at: { days: -25, hour: 11, minute: 25 } }],
  });
  await seedInvoice({
    key: 'INV23',
    reservationKey: 'R23',
    issued: { days: -21, hour: 11, minute: 5 },
    payments: [{ full: true, method: 'cash', at: { days: -21, hour: 11, minute: 20 } }],
  });
  await seedInvoice({
    key: 'INV24',
    reservationKey: 'R24',
    issued: { days: -17, hour: 11, minute: 15 },
    extras: [{ description: 'In-room dining', category: 'food', qty: 1, unitPrice: 1100 }],
    payments: [{ full: true, method: 'gcash', reference: 'GC-339102', at: { days: -17, hour: 11, minute: 30 } }],
  });
  await seedInvoice({
    key: 'INV25',
    reservationKey: 'R25',
    issued: { days: -13, hour: 11, minute: 0 },
    extras: [{ description: 'Spa treatment', category: 'service', qty: 2, unitPrice: 1800 }],
    discount: 400,
    payments: [{ full: true, method: 'card', reference: 'CARD-6650', at: { days: -13, hour: 11, minute: 25 } }],
  });
  await seedInvoice({
    key: 'INV26',
    reservationKey: 'R26',
    issued: { days: -10, hour: 11, minute: 10 },
    payments: [{ full: true, method: 'cash', at: { days: -10, hour: 11, minute: 22 } }],
  });
  await seedInvoice({
    key: 'INV27',
    reservationKey: 'R27',
    issued: { days: -8, hour: 11, minute: 5 },
    extras: [{ description: 'Room service dinner', category: 'food', qty: 2, unitPrice: 1350 }],
    payments: [{ full: true, method: 'card', reference: 'CARD-7781', at: { days: -8, hour: 11, minute: 20 } }],
  });
  await seedInvoice({
    key: 'INV28',
    reservationKey: 'R28',
    issued: { days: -15, hour: 11, minute: 0 },
    payments: [{ full: true, method: 'bank', reference: 'BPI-11902', at: { days: -15, hour: 11, minute: 30 } }],
  });

  // Physical room statuses
  const now = nowIso();
  for (const item of plan) {
    if (item.status === 'checked_in') {
      await run(`UPDATE rooms SET status = 'occupied', updated_at = ? WHERE id = ?`, now, roomId(item.room));
    }
  }
  await run(
    `UPDATE rooms SET status = 'cleaning', notes = 'Checked out today. Awaiting housekeeping.', updated_at = ? WHERE id = ?`,
    now,
    roomId('208')
  );
  await run(
    `UPDATE rooms SET status = 'maintenance', notes = 'Air-conditioning unit under repair.', updated_at = ? WHERE id = ?`,
    now,
    roomId('308')
  );

  // Housekeeping history
  const cleaningLogs = [
    ['208', 'cleaning', 'Guest checked out. Room needs cleaning.', housekeepingUserId, { minutes: 60 }],
    ['308', 'maintenance', 'Air-conditioning unit under repair.', users.get('grace.uy'), { days: -2, hour: 9, minute: 20 }],
    ['102', 'available', 'Room cleaned and inspected.', housekeepingUserId, { days: -1, hour: 12, minute: 10 }],
    ['104', 'available', 'Room cleaned and inspected.', users.get('mila.reyes'), { days: -3, hour: 12, minute: 5 }],
    ['207', 'available', 'Room cleaned and inspected.', users.get('nora.bautista'), { days: -2, hour: 12, minute: 15 }],
    ['106', 'available', 'Deep cleaning completed.', users.get('tess.ramos'), { days: -4, hour: 15, minute: 0 }],
    ['305', 'available', 'Suite prepared with extra towels.', users.get('joy.cruz'), { minutes: 240 }],
  ];
  for (const [room, status, note, userId, at] of cleaningLogs) {
    await run(
      `INSERT INTO housekeeping_logs (room_id, status, note, updated_by, created_at) VALUES (?, ?, ?, ?, ?)`,
      roomId(room),
      status,
      note,
      userId,
      stamp(at)
    );
  }

  // Activity timeline (oldest first so the newest appears at the top)
  const log = async (userId, action, entity, details, at) => {
    await run(
      `INSERT INTO activity_log (user_id, action, entity, details, created_at) VALUES (?, ?, ?, ?, ?)`,
      userId,
      action,
      entity,
      details,
      stamp(at)
    );
  };

  const invoiceNumber = (key) => invoiceNumbers.get(key);

  await log(managerUserId, 'report.viewed', 'report', 'Occupancy and revenue report reviewed.', { days: -3, hour: 16, minute: 30 });
  await log(housekeepingUserId, 'room.status', 'room', 'Room 104 was marked ready.', { days: -3, hour: 12, minute: 5 });
  await log(receptionUserId, 'payment.received', 'invoice', `Payment recorded on ${invoiceNumber('INV17')}.`, { days: -3, hour: 11, minute: 22 });
  await log(housekeepingUserId, 'room.status', 'room', 'Room 207 was marked ready.', { days: -2, hour: 12, minute: 15 });
  await log(receptionUserId, 'guest.checked_in', 'reservation', 'Isabelle Cruz checked in to room 305.', { days: -1, hour: 16, minute: 40 });
  await log(receptionUserId, 'payment.received', 'invoice', `Payment recorded on ${invoiceNumber('INV20')}.`, { days: -1, hour: 10, minute: 45 });
  await log(housekeepingUserId, 'room.status', 'room', 'Room 102 was marked ready.', { days: -1, hour: 12, minute: 10 });
  await log(housekeepingUserId, 'room.status', 'room', 'Room 305 was prepared for arrival.', { minutes: 240 });
  await log(receptionUserId, 'reservation.created', 'reservation', 'Room 202 booked for Marco Villanueva, arriving tomorrow.', { minutes: 150 });
  await log(receptionUserId, 'guest.checked_out', 'invoice', `Andrea Flores checked out of room 208. Invoice ${invoiceNumber('INV21')} issued.`, { minutes: 65 });
  await log(housekeepingUserId, 'room.status', 'room', 'Room 208 was flagged for cleaning.', { minutes: 60 });
  await log(receptionUserId, 'payment.received', 'invoice', `Payment recorded on ${invoiceNumber('INV19')}.`, { minutes: 28 });
  await log(adminUserId, 'settings.updated', 'settings', 'Hotel settings and tax rate reviewed.', { days: -30, hour: 10 });
}
