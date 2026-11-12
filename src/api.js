import { HttpError, badRequest, forbidden, notFound } from './errors.js';
import { get, todayStr, addDays } from './db.js';
import {
  createSession,
  destroySession,
  publicUser,
  verifyPassword,
} from './auth.js';
import {
  getSettings,
  saveSettings,
  listRooms,
  getRoom,
  roomDetail,
  availableRooms,
  setRoomStatus,
  createRoom,
  updateRoom,
  listGuests,
  guestDetail,
  createGuest,
  updateGuest,
  mapGuest,
  listReservations,
  reservationById,
  createReservation,
  createWebsiteBooking,
  approveReservation,
  declineReservation,
  updateReservation,
  cancelReservation,
  checkInReservation,
  checkOutReservation,
  listInvoices,
  invoiceDetail,
  addInvoiceItem,
  removeInvoiceItem,
  addPayment,
  updateInvoice,
  voidInvoice,
  billingSummary,
  dashboardData,
  frontDeskData,
  housekeepingData,
  reportsData,
  listActivity,
  listUsers,
  createUser,
  updateUser,
  staffSummary,
  publicHotelInfo,
  publicAvailability,
  databaseOverview,
  databaseTable,
} from './services.js';

const ALL_ROLES = ['admin', 'receptionist', 'manager', 'housekeeping'];
const FRONT_DESK = ['receptionist', 'admin'];
const MANAGERS = ['manager', 'admin'];
const OPERATIONS = ['receptionist', 'manager', 'admin'];

function requireRole(ctx, roles) {
  if (!roles.includes(ctx.user.role)) throw forbidden();
}

function idParam(ctx) {
  const id = Number(ctx.params.id);
  if (!Number.isInteger(id) || id <= 0) throw badRequest('Invalid record identifier.');
  return id;
}

/* ------------------------------------------------------------------ */
/* Public guest site                                                   */
/* ------------------------------------------------------------------ */

const bookingAttempts = new Map();
const BOOKING_WINDOW_MS = 10 * 60 * 1000;
const BOOKING_LIMIT = 15;

function limitBookingRequests(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  const key = forwarded || req.socket?.remoteAddress || 'unknown';
  const now = Date.now();
  const recent = (bookingAttempts.get(key) || []).filter((stamp) => now - stamp < BOOKING_WINDOW_MS);
  if (recent.length >= BOOKING_LIMIT) {
    throw new HttpError(429, 'Too many booking requests. Please wait a few minutes and try again.');
  }
  recent.push(now);
  bookingAttempts.set(key, recent);
  if (bookingAttempts.size > 300) {
    for (const [address, stamps] of bookingAttempts) {
      if (!stamps.some((stamp) => now - stamp < BOOKING_WINDOW_MS)) bookingAttempts.delete(address);
    }
  }
}

async function publicHotel(ctx) {
  return (await publicHotelInfo());
}

async function publicAvailabilityHandler(ctx) {
  return (await publicAvailability({
    checkInDate: ctx.url.searchParams.get('check_in') || '',
    checkOutDate: ctx.url.searchParams.get('check_out') || '',
    adults: ctx.url.searchParams.get('adults') || 1,
    children: ctx.url.searchParams.get('children') || 0,
  }));
}

async function publicBookingCreate(ctx) {
  limitBookingRequests(ctx.req);
  return (await createWebsiteBooking(ctx.body || {}));
}

/* ------------------------------------------------------------------ */
/* Auth                                                                */
/* ------------------------------------------------------------------ */

async function login(ctx) {
  const username = String(ctx.body?.username || '').trim().toLowerCase();
  const password = String(ctx.body?.password || '');
  if (!username || !password) throw new HttpError(400, 'Enter your username and password.');
  const user = (await get('SELECT * FROM users WHERE username = ?', username));
  if (!user || !user.active || !verifyPassword(password, user.password_hash)) {
    throw new HttpError(401, 'Invalid username or password.');
  }
  const token = createSession(user.id);
  ctx.setCookie(`sunrise_session=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=28800`);
  return { user: publicUser(user), settings: (await getSettings()) };
}

async function logout(ctx) {
  destroySession(ctx.token);
  ctx.setCookie('sunrise_session=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0');
  return { ok: true };
}

async function me(ctx) {
  return {
    user: publicUser(ctx.user),
    settings: (await getSettings()),
    staff: ctx.user.role === 'admin' ? (await staffSummary()) : null,
  };
}

/* ------------------------------------------------------------------ */
/* Rooms                                                               */
/* ------------------------------------------------------------------ */

async function roomsIndex(ctx) {
  const rooms = (await listRooms());
  return { rooms, counts: countByStatus(rooms) };
}

function countByStatus(rooms) {
  const counts = { available: 0, occupied: 0, reserved: 0, cleaning: 0, maintenance: 0 };
  for (const room of rooms) {
    counts[room.displayStatus] = (counts[room.displayStatus] || 0) + 1;
  }
  return counts;
}

async function roomsAvailability(ctx) {
  const checkIn = ctx.url.searchParams.get('check_in');
  const checkOut = ctx.url.searchParams.get('check_out');
  const exclude = Number(ctx.url.searchParams.get('exclude')) || null;
  const rooms = (await availableRooms(checkIn, checkOut, exclude));
  return { rooms, checkIn, checkOut };
}

async function roomShow(ctx) {
  return (await roomDetail(idParam(ctx)));
}

async function roomsCreate(ctx) {
  requireRole(ctx, ['admin']);
  return { room: (await createRoom(ctx.user.id, ctx.body || {})) };
}

async function roomsUpdate(ctx) {
  const id = idParam(ctx);
  const body = ctx.body || {};
  const fieldKeys = Object.keys(body).filter((key) => key !== 'status' && key !== 'note');
  if (fieldKeys.length > 0) {
    requireRole(ctx, ['admin']);
    return { room: (await updateRoom(ctx.user.id, id, body)) };
  }
  if (body.status !== undefined) {
    requireRole(ctx, ['admin', 'receptionist', 'housekeeping']);
    return { room: (await setRoomStatus(ctx.user.id, id, body.status, body.note || '')) };
  }
  throw badRequest('Nothing to update.');
}

/* ------------------------------------------------------------------ */
/* Guests                                                              */
/* ------------------------------------------------------------------ */

async function guestsIndex(ctx) {
  requireRole(ctx, OPERATIONS);
  return { guests: (await listGuests({ q: ctx.url.searchParams.get('q') || '' })) };
}

async function guestShow(ctx) {
  requireRole(ctx, OPERATIONS);
  return (await guestDetail(idParam(ctx)));
}

async function guestsCreate(ctx) {
  requireRole(ctx, FRONT_DESK);
  return { guest: mapGuest((await createGuest(ctx.body || {}))) };
}

async function guestsUpdate(ctx) {
  requireRole(ctx, FRONT_DESK);
  return { guest: (await updateGuest(ctx.user.id, idParam(ctx), ctx.body || {})) };
}

/* ------------------------------------------------------------------ */
/* Reservations                                                        */
/* ------------------------------------------------------------------ */

async function reservationsIndex(ctx) {
  requireRole(ctx, OPERATIONS);
  const reservations = (await listReservations({
    status: ctx.url.searchParams.get('status') || '',
    approval: ctx.url.searchParams.get('approval') || '',
    from: ctx.url.searchParams.get('from') || '',
    to: ctx.url.searchParams.get('to') || '',
    q: ctx.url.searchParams.get('q') || '',
    order: ctx.url.searchParams.get('order') === 'asc' ? 'asc' : 'desc',
    limit: Number(ctx.url.searchParams.get('limit')) || 200,
  }));
  return { reservations };
}

async function reservationShow(ctx) {
  requireRole(ctx, OPERATIONS);
  return { reservation: (await reservationById(idParam(ctx))) };
}

async function reservationsCreate(ctx) {
  requireRole(ctx, FRONT_DESK);
  return { reservation: (await createReservation(ctx.user.id, ctx.body || {})) };
}

async function reservationsUpdate(ctx) {
  requireRole(ctx, FRONT_DESK);
  return { reservation: updateReservation(ctx.user.id, idParam(ctx), ctx.body || {}) };
}

async function reservationsCancel(ctx) {
  requireRole(ctx, FRONT_DESK);
  return { reservation: (await cancelReservation(ctx.user.id, idParam(ctx), ctx.body?.reason || '')) };
}

async function reservationCheckIn(ctx) {
  requireRole(ctx, FRONT_DESK);
  return { reservation: (await checkInReservation(ctx.user.id, idParam(ctx))) };
}

async function reservationCheckOut(ctx) {
  requireRole(ctx, FRONT_DESK);
  return (await checkOutReservation(ctx.user.id, idParam(ctx), ctx.body || {}));
}

async function reservationApprove(ctx) {
  requireRole(ctx, FRONT_DESK);
  return { reservation: (await approveReservation(ctx.user.id, idParam(ctx))) };
}

async function reservationDecline(ctx) {
  requireRole(ctx, FRONT_DESK);
  return { reservation: (await declineReservation(ctx.user.id, idParam(ctx), ctx.body?.reason || '')) };
}

/* ------------------------------------------------------------------ */
/* Invoices                                                            */
/* ------------------------------------------------------------------ */

async function invoicesIndex(ctx) {
  requireRole(ctx, OPERATIONS);
  const invoices = (await listInvoices({
    status: ctx.url.searchParams.get('status') || '',
    from: ctx.url.searchParams.get('from') || '',
    to: ctx.url.searchParams.get('to') || '',
    q: ctx.url.searchParams.get('q') || '',
  }));
  return { invoices, summary: (await billingSummary()) };
}

async function invoiceShow(ctx) {
  requireRole(ctx, OPERATIONS);
  return (await invoiceDetail(idParam(ctx)));
}

async function invoiceAddItem(ctx) {
  requireRole(ctx, FRONT_DESK);
  return (await addInvoiceItem(idParam(ctx), ctx.body || {}, ctx.user.id));
}

async function invoiceRemoveItem(ctx) {
  requireRole(ctx, FRONT_DESK);
  return (await removeInvoiceItem(idParam(ctx), Number(ctx.params.itemId), ctx.user.id));
}

async function invoiceAddPayment(ctx) {
  requireRole(ctx, FRONT_DESK);
  return (await addPayment(idParam(ctx), ctx.body || {}, ctx.user.id));
}

async function invoiceUpdate(ctx) {
  requireRole(ctx, FRONT_DESK);
  return (await updateInvoice(idParam(ctx), ctx.body || {}, ctx.user.id));
}

async function invoiceVoid(ctx) {
  requireRole(ctx, ['admin']);
  return (await voidInvoice(idParam(ctx), ctx.user.id));
}

async function billing(ctx) {
  requireRole(ctx, OPERATIONS);
  return (await billingSummary());
}

/* ------------------------------------------------------------------ */
/* Operations views                                                    */
/* ------------------------------------------------------------------ */

async function dashboard(ctx) {
  return (await dashboardData());
}

async function frontDesk(ctx) {
  requireRole(ctx, OPERATIONS);
  return (await frontDeskData());
}

async function housekeeping(ctx) {
  requireRole(ctx, ['admin', 'receptionist', 'manager', 'housekeeping']);
  return (await housekeepingData());
}

async function reports(ctx) {
  requireRole(ctx, MANAGERS);
  const to = ctx.url.searchParams.get('to') || todayStr();
  const from = ctx.url.searchParams.get('from') || addDays(to, -29);
  return (await reportsData(from, to));
}

async function activity(ctx) {
  requireRole(ctx, MANAGERS);
  return { activity: (await listActivity(40)) };
}

/* ------------------------------------------------------------------ */
/* Staff & settings                                                    */
/* ------------------------------------------------------------------ */

async function usersIndex(ctx) {
  requireRole(ctx, ['admin']);
  return { users: (await listUsers()), summary: (await staffSummary()) };
}

async function usersCreate(ctx) {
  requireRole(ctx, ['admin']);
  return { user: (await createUser(ctx.body || {})) };
}

async function usersUpdate(ctx) {
  requireRole(ctx, ['admin']);
  return { user: (await updateUser(ctx.user, idParam(ctx), ctx.body || {})) };
}

async function settingsGet(ctx) {
  requireRole(ctx, ['admin']);
  return { settings: (await getSettings()), staff: (await staffSummary()) };
}

async function settingsUpdate(ctx) {
  requireRole(ctx, ['admin']);
  return { settings: (await saveSettings(ctx.body || {}, ctx.user.id)) };
}

/* ------------------------------------------------------------------ */
/* Database explorer                                                   */
/* ------------------------------------------------------------------ */

async function databaseTables(ctx) {
  requireRole(ctx, ['admin']);
  return (await databaseOverview());
}

async function databaseTableShow(ctx) {
  requireRole(ctx, ['admin']);
  return (await databaseTable(ctx.params.name, {
    limit: Number(ctx.url.searchParams.get('limit')) || 50,
    offset: Number(ctx.url.searchParams.get('offset')) || 0,
  }));
}

/* ------------------------------------------------------------------ */
/* Route table                                                         */
/* ------------------------------------------------------------------ */

export const routes = [
  { method: 'GET', pattern: /^\/api\/health$/, handler: async () => ({ ok: true }), public: true },
  { method: 'GET', pattern: /^\/api\/public\/hotel$/, handler: publicHotel, public: true },
  {
    method: 'GET',
    pattern: /^\/api\/public\/availability$/,
    handler: publicAvailabilityHandler,
    public: true,
  },
  { method: 'POST', pattern: /^\/api\/public\/bookings$/, handler: publicBookingCreate, public: true },
  { method: 'POST', pattern: /^\/api\/auth\/login$/, handler: login, public: true },
  { method: 'POST', pattern: /^\/api\/auth\/logout$/, handler: logout },
  { method: 'GET', pattern: /^\/api\/auth\/me$/, handler: me },

  { method: 'GET', pattern: /^\/api\/dashboard$/, handler: dashboard },

  { method: 'GET', pattern: /^\/api\/frontdesk$/, handler: frontDesk },
  { method: 'GET', pattern: /^\/api\/housekeeping$/, handler: housekeeping },

  { method: 'GET', pattern: /^\/api\/rooms$/, handler: roomsIndex },
  { method: 'GET', pattern: /^\/api\/rooms\/availability$/, handler: roomsAvailability },
  { method: 'GET', pattern: /^\/api\/rooms\/(?<id>\d+)$/, handler: roomShow },
  { method: 'POST', pattern: /^\/api\/rooms$/, handler: roomsCreate },
  { method: 'PATCH', pattern: /^\/api\/rooms\/(?<id>\d+)$/, handler: roomsUpdate },

  { method: 'GET', pattern: /^\/api\/guests$/, handler: guestsIndex },
  { method: 'GET', pattern: /^\/api\/guests\/(?<id>\d+)$/, handler: guestShow },
  { method: 'POST', pattern: /^\/api\/guests$/, handler: guestsCreate },
  { method: 'PATCH', pattern: /^\/api\/guests\/(?<id>\d+)$/, handler: guestsUpdate },

  { method: 'GET', pattern: /^\/api\/reservations$/, handler: reservationsIndex },
  { method: 'GET', pattern: /^\/api\/reservations\/(?<id>\d+)$/, handler: reservationShow },
  { method: 'POST', pattern: /^\/api\/reservations$/, handler: reservationsCreate },
  { method: 'PATCH', pattern: /^\/api\/reservations\/(?<id>\d+)$/, handler: reservationsUpdate },
  { method: 'POST', pattern: /^\/api\/reservations\/(?<id>\d+)\/cancel$/, handler: reservationsCancel },
  { method: 'POST', pattern: /^\/api\/reservations\/(?<id>\d+)\/check-in$/, handler: reservationCheckIn },
  { method: 'POST', pattern: /^\/api\/reservations\/(?<id>\d+)\/check-out$/, handler: reservationCheckOut },
  { method: 'POST', pattern: /^\/api\/reservations\/(?<id>\d+)\/approve$/, handler: reservationApprove },
  { method: 'POST', pattern: /^\/api\/reservations\/(?<id>\d+)\/decline$/, handler: reservationDecline },

  { method: 'GET', pattern: /^\/api\/invoices$/, handler: invoicesIndex },
  { method: 'GET', pattern: /^\/api\/invoices\/(?<id>\d+)$/, handler: invoiceShow },
  { method: 'POST', pattern: /^\/api\/invoices\/(?<id>\d+)\/items$/, handler: invoiceAddItem },
  {
    method: 'DELETE',
    pattern: /^\/api\/invoices\/(?<id>\d+)\/items\/(?<itemId>\d+)$/,
    handler: invoiceRemoveItem,
  },
  { method: 'POST', pattern: /^\/api\/invoices\/(?<id>\d+)\/payments$/, handler: invoiceAddPayment },
  { method: 'PATCH', pattern: /^\/api\/invoices\/(?<id>\d+)$/, handler: invoiceUpdate },
  { method: 'POST', pattern: /^\/api\/invoices\/(?<id>\d+)\/void$/, handler: invoiceVoid },
  { method: 'GET', pattern: /^\/api\/billing\/summary$/, handler: billing },

  { method: 'GET', pattern: /^\/api\/reports$/, handler: reports },
  { method: 'GET', pattern: /^\/api\/activity$/, handler: activity },

  { method: 'GET', pattern: /^\/api\/users$/, handler: usersIndex },
  { method: 'POST', pattern: /^\/api\/users$/, handler: usersCreate },
  { method: 'PATCH', pattern: /^\/api\/users\/(?<id>\d+)$/, handler: usersUpdate },

  { method: 'GET', pattern: /^\/api\/settings$/, handler: settingsGet },
  { method: 'PATCH', pattern: /^\/api\/settings$/, handler: settingsUpdate },

  { method: 'GET', pattern: /^\/api\/database\/tables$/, handler: databaseTables },
  { method: 'GET', pattern: /^\/api\/database\/tables\/(?<name>[a-z_]+)$/, handler: databaseTableShow },
];

export { notFound };
