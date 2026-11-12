import { icon } from './icons.js';

let config = {
  currencySymbol: '\u20B1',
  currency: 'PHP',
  hotelName: 'Sunrise Hotel',
  taxRate: 12,
  checkInTime: '14:00',
  checkOutTime: '12:00',
  address: '',
  phone: '',
  email: '',
};

export function setConfig(settings) {
  config = { ...config, ...(settings || {}) };
}

export function getConfig() {
  return config;
}

/* ---------------- Formatting ---------------- */

export function money(value) {
  const number = Number(value) || 0;
  const formatted = number.toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${config.currencySymbol || '\u20B1'}${formatted}`;
}

export function num(value, digits = 0) {
  return (Number(value) || 0).toLocaleString('en-PH', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function compact(value) {
  const number = Number(value) || 0;
  if (Math.abs(number) >= 1000000) return `${(number / 1000000).toFixed(1)}M`;
  if (Math.abs(number) >= 10000) return `${(number / 1000).toFixed(1)}k`;
  return num(number);
}

export function moneyCompact(value) {
  return `${config.currencySymbol || '\u20B1'}${compact(value)}`;
}

export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => {
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    return map[character];
  });
}

export function initials(name) {
  return String(name || '?')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
}

export function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

/* ---------------- Dates ---------------- */

function localIso(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export function todayISO() {
  return localIso(new Date()).slice(0, 10);
}

export function addDaysISO(dateString, days) {
  const [y, m, d] = dateString.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export function diffNights(fromDate, toDate) {
  const [y1, m1, d1] = fromDate.split('-').map(Number);
  const [y2, m2, d2] = toDate.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
}

function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  const text = String(value);
  const date = text.length === 10 ? new Date(`${text}T00:00:00`) : new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function fmtDate(value) {
  const date = toDate(value);
  if (!date) return '\u2014';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function fmtDateShort(value) {
  const date = toDate(value);
  if (!date) return '\u2014';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function fmtDateLong(value) {
  const date = toDate(value);
  if (!date) return '\u2014';
  return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

export function fmtWeekday(value) {
  const date = toDate(value);
  if (!date) return '';
  return date.toLocaleDateString('en-US', { weekday: 'short' });
}

export function fmtTime(value) {
  const date = toDate(value);
  if (!date) return '\u2014';
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

export function fmtDateTime(value) {
  const date = toDate(value);
  if (!date) return '\u2014';
  return `${fmtDate(value)} \u00B7 ${fmtTime(value)}`;
}

export function relativeTime(value) {
  const date = toDate(value);
  if (!date) return '';
  const diff = Date.now() - date.getTime();
  if (diff < 45 * 1000) return 'just now';
  if (diff < 3600 * 1000) return `${Math.max(1, Math.round(diff / 60000))} min ago`;
  if (diff < 86400 * 1000) return `${Math.round(diff / 3600000)} hr ago`;
  if (diff < 172800 * 1000) return 'yesterday';
  if (diff < 7 * 86400000) return `${Math.round(diff / 86400000)} days ago`;
  return fmtDateShort(value);
}

export function nightsLabel(nights) {
  const value = Number(nights) || 0;
  return `${value} night${value === 1 ? '' : 's'}`;
}

export function rangeLabel(checkIn, checkOut) {
  return `${fmtDateShort(checkIn)} \u2192 ${fmtDateShort(checkOut)}`;
}

/* ---------------- Status vocabulary ---------------- */

export const ROOM_STATUS = {
  available: { label: 'Available', tone: 'green', color: '#2e8b63' },
  occupied: { label: 'Occupied', tone: 'red', color: '#c4554d' },
  reserved: { label: 'Reserved', tone: 'violet', color: '#7b6cd9' },
  cleaning: { label: 'Needs cleaning', tone: 'amber', color: '#d08a23' },
  maintenance: { label: 'Out of service', tone: 'gray', color: '#7d828d' },
};

export const RESERVATION_STATUS = {
  reserved: { label: 'Reserved', tone: 'violet' },
  checked_in: { label: 'In-house', tone: 'green' },
  checked_out: { label: 'Completed', tone: 'gray' },
  cancelled: { label: 'Cancelled', tone: 'red' },
};

export const APPROVAL_STATUS = {
  pending: { label: 'Pending approval', tone: 'amber' },
  confirmed: { label: 'Confirmed', tone: 'green' },
  declined: { label: 'Declined', tone: 'red' },
};

export const BOOKING_SOURCE = {
  website: { label: 'Website', tone: 'blue' },
  front_desk: { label: 'Front desk', tone: 'gray' },
  phone: { label: 'Phone', tone: 'gray' },
  walk_in: { label: 'Walk-in', tone: 'gray' },
};

export const INVOICE_STATUS = {
  open: { label: 'Open', tone: 'amber' },
  paid: { label: 'Paid', tone: 'green' },
  void: { label: 'Void', tone: 'gray' },
};

export const PAYMENT_METHODS = {
  cash: 'Cash',
  card: 'Card',
  gcash: 'GCash',
  bank: 'Bank transfer',
};

export const CATEGORY_LABELS = {
  room: 'Room',
  food: 'Food & beverage',
  service: 'Service',
  other: 'Other',
};

export const ROLE_LABELS = {
  admin: 'Administrator',
  receptionist: 'Receptionist',
  manager: 'Manager',
  housekeeping: 'Housekeeping',
};

export function roomStatusMeta(status) {
  return ROOM_STATUS[status] || ROOM_STATUS.available;
}

export function reservationStatusMeta(status) {
  return RESERVATION_STATUS[status] || { label: status, tone: 'gray' };
}

export function approvalStatusMeta(status) {
  return APPROVAL_STATUS[status] || { label: status, tone: 'gray' };
}

export function bookingSourceMeta(source) {
  return BOOKING_SOURCE[source] || BOOKING_SOURCE.front_desk;
}

export function needsApproval(reservation) {
  return reservation?.status === 'reserved' && reservation?.approvalStatus === 'pending';
}

export function reservationStatusPill(reservation) {
  if (needsApproval(reservation)) return statusPill(approvalStatusMeta('pending'));
  return statusPill(reservationStatusMeta(reservation.status));
}

export function bookingSourcePill(source) {
  const meta = bookingSourceMeta(source);
  const iconMark = source === 'website' ? icon('globe', 11) : '';
  return `<span class="pill ${meta.tone} source-pill">${iconMark}${esc(meta.label)}</span>`;
}

export function invoiceStatusMeta(status) {
  return INVOICE_STATUS[status] || { label: status, tone: 'gray' };
}

export function pill(label, tone = 'gray', extraClass = '') {
  return `<span class="pill ${tone} ${extraClass}">${esc(label)}</span>`;
}

export function statusPill(meta, extraClass = '') {
  return pill(meta.label, meta.tone, extraClass);
}

/* ---------------- Reusable fragments ---------------- */

export function roomTile(room) {
  const meta = roomStatusMeta(room.displayStatus || room.status);
  const guest = room.currentGuest?.guestName || room.arrivingGuest?.guestName || '';
  return `<button type="button" class="room" style="--room-tone:${meta.color}" data-room="${room.id}" aria-label="Room ${esc(
    room.number
  )}, ${meta.label}">
    <div class="room-top">
      <span class="room-num">${esc(room.number)}</span>
      <span class="room-status">${meta.label}</span>
    </div>
    <div class="room-type">${esc(room.type)}</div>
    <div class="room-guest ${guest ? '' : 'muted'}">${guest ? esc(guest) : `Floor ${room.floor}`}</div>
  </button>`;
}

export function activityFeed(items, emptyText = 'Actions will appear here as staff use the system.') {
  if (!items || items.length === 0) {
    return emptyState('clock', 'No activity yet', emptyText);
  }
  return `<div class="activity">${items
    .map(
      (item) => `<div class="activity-item">
        <span class="activity-dot"></span>
        <div class="activity-body">
          <p>${esc(item.details)}</p>
          <span>${esc(item.userName)} \u00B7 ${esc(relativeTime(item.createdAt))}</span>
        </div>
      </div>`
    )
    .join('')}</div>`;
}

export function emptyState(iconName, title, text) {
  return `<div class="empty">
    <div class="empty-icon">${icon(iconName, 20)}</div>
    <h4>${esc(title)}</h4>
    <p>${esc(text)}</p>
  </div>`;
}

export function viewSkeleton() {
  return `<div class="loading-panel" aria-label="Loading">
    <div class="loading-grid">
      <div class="skeleton" style="height:92px"></div>
      <div class="skeleton" style="height:92px"></div>
      <div class="skeleton" style="height:92px"></div>
      <div class="skeleton" style="height:92px"></div>
    </div>
    <div class="skeleton loading-block"></div>
    <div class="skeleton loading-block" style="height:220px"></div>
  </div>`;
}

/* ---------------- Modals ---------------- */

let activeModal = null;
let lastFocus = null;

export function openModal({ title = '', subtitle = '', body = '', footer = '', size = 'md', onClose, className = '' } = {}) {
  closeAllModals();
  lastFocus = document.activeElement;

  const root = document.getElementById('modal-root');
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `<div class="modal modal-${size} ${className}" role="dialog" aria-modal="true" aria-label="${esc(
    title
  )}">
    <header class="modal-head">
      <div class="modal-head-text"><h2>${title}</h2>${subtitle ? `<p>${subtitle}</p>` : ''}</div>
      <button class="icon-btn modal-close" type="button" data-modal-close aria-label="Close">${icon('x', 18)}</button>
    </header>
    <div class="modal-body">${body}</div>
    ${footer ? `<footer class="modal-foot">${footer}</footer>` : ''}
  </div>`;
  root.appendChild(overlay);

  const instance = {
    overlay,
    modal: overlay.querySelector('.modal'),
    body: overlay.querySelector('.modal-body'),
    footer: overlay.querySelector('.modal-foot'),
    close,
  };

  function close() {
    if (!overlay.isConnected) return;
    overlay.classList.add('closing');
    const cleanup = () => {
      overlay.remove();
      document.removeEventListener('keydown', onKey);
      if (!document.querySelector('.modal-overlay')) document.body.classList.remove('modal-open');
      if (activeModal === instance) activeModal = null;
      if (lastFocus && document.contains(lastFocus)) lastFocus.focus({ preventScroll: true });
      if (typeof onClose === 'function') onClose();
    };
    setTimeout(cleanup, 120);
  }

  function onKey(event) {
    if (event.key === 'Escape') close();
  }

  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) close();
  });
  overlay.querySelector('[data-modal-close]').addEventListener('click', close);
  document.addEventListener('keydown', onKey);
  document.body.classList.add('modal-open');
  activeModal = instance;

  setTimeout(() => {
    const focusTarget = overlay.querySelector('input:not([type="hidden"]), select, textarea');
    if (focusTarget && window.innerWidth > 780) focusTarget.focus({ preventScroll: true });
  }, 80);

  return instance;
}

export function closeAllModals() {
  const overlays = document.querySelectorAll('.modal-overlay');
  overlays.forEach((overlay) => overlay.remove());
  document.body.classList.remove('modal-open');
  activeModal = null;
}

export function confirmDialog({
  title = 'Are you sure?',
  message = '',
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'danger',
  details = '',
}) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const modal = openModal({
      title: esc(title),
      size: 'sm',
      onClose: () => finish(false),
      body: `<p class="confirm-text">${esc(message)}</p>${details ? `<div class="confirm-details">${details}</div>` : ''}`,
      footer: `<button class="btn btn-ghost" type="button" data-cancel>${esc(cancelLabel)}</button>
        <button class="btn ${tone === 'danger' ? 'btn-danger' : 'btn-primary'}" type="button" data-confirm>${esc(
        confirmLabel
      )}</button>`,
    });
    modal.footer.querySelector('[data-cancel]').addEventListener('click', () => {
      finish(false);
      modal.close();
    });
    modal.footer.querySelector('[data-confirm]').addEventListener('click', () => {
      finish(true);
      modal.close();
    });
  });
}

/* ---------------- Toast ---------------- */

export function toast(message, type = 'success') {
  const root = document.getElementById('toast-root');
  const element = document.createElement('div');
  element.className = `toast ${type}`;
  element.innerHTML = `${icon(type === 'error' ? 'alert' : 'checkCircle', 17)}<span>${esc(message)}</span>`;
  root.appendChild(element);
  while (root.children.length > 4) root.firstElementChild.remove();
  setTimeout(() => {
    element.classList.add('leaving');
    setTimeout(() => element.remove(), 220);
  }, 3600);
}

export async function withBusy(button, action, busyLabel = 'Working\u2026') {
  if (!button) return action();
  const original = button.innerHTML;
  const wasDisabled = button.disabled;
  button.disabled = true;
  button.classList.add('is-busy');
  button.innerHTML = `<span class="spinner"></span>${busyLabel}`;
  try {
    return await action();
  } finally {
    button.disabled = wasDisabled;
    button.classList.remove('is-busy');
    button.innerHTML = original;
  }
}

/* ---------------- Misc ---------------- */

export function debounce(fn, wait = 250) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

export function formValues(form) {
  const values = {};
  for (const [key, value] of new FormData(form).entries()) {
    values[key] = typeof value === 'string' ? value.trim() : value;
  }
  return values;
}

export function downloadCSV(filename, rows) {
  const content = rows
    .map((row) =>
      row
        .map((cell) => {
          const text = String(cell ?? '');
          return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
        })
        .join(',')
    )
    .join('\r\n');
  const blob = new Blob([`\uFEFF${content}`], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

export function printDocument() {
  window.print();
}

export function chevron() {
  return icon('chevronRight', 14);
}
