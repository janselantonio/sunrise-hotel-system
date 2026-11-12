import { api } from '../api.js';
import { can } from '../store.js';
import { icon } from '../icons.js';
import {
  esc,
  initials,
  fmtDate,
  money,
  reservationStatusPill,
  bookingSourcePill,
  needsApproval,
  emptyState,
  viewSkeleton,
  downloadCSV,
} from '../utils.js';
import { openNewReservation, openReservationDetail, approveBookingRequest, openDeclineRequest } from '../flows.js';

export const meta = {
  title: 'Reservations',
  sub: 'Every booking, from first request to completed stay.',
  roles: ['admin', 'receptionist', 'manager'],
};

const STATUS_TABS = [
  { value: '', label: 'All' },
  { value: 'reserved', label: 'Reserved' },
  { value: 'pending', label: 'Requests' },
  { value: 'checked_in', label: 'In-house' },
  { value: 'checked_out', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
];

let filters = null;
let filtersHash = '';

function loadFilters() {
  const hash = location.hash;
  const params = new URLSearchParams(hash.split('?')[1] || '');
  if (!filters || hash !== filtersHash) {
    filters = { status: params.get('status') || '', q: '', from: '', to: '' };
    filtersHash = hash;
  }
  return filters;
}

export async function render(el) {
  const current = loadFilters();
  el.innerHTML = viewSkeleton();
  const pendingTab = current.status === 'pending';
  const params = new URLSearchParams();
  if (pendingTab) {
    params.set('status', 'reserved');
    params.set('approval', 'pending');
  } else if (current.status) {
    params.set('status', current.status);
  }
  if (current.q) params.set('q', current.q);
  if (current.from) params.set('from', current.from);
  if (current.to) params.set('to', current.to);
  const query = params.toString();
  const data = await api.get(`/api/reservations${query ? `?${query}` : ''}`);
  const reload = () => render(el);
  const rows = data.reservations;

  el.innerHTML = `
    <div class="view-head">
      <div class="view-head-text">
        <span class="eyebrow">Reservation book</span>
        <h2>Reservations</h2>
        <p>Search the book, check availability and manage every stay.</p>
      </div>
      <div class="page-actions">
        <button class="btn btn-ghost" type="button" id="export-reservations">${icon('download', 15)} Export CSV</button>
        ${
          can('receptionist', 'admin')
            ? `<button class="btn btn-primary" type="button" id="new-reservation">${icon('plus', 15)} New reservation</button>`
            : ''
        }
      </div>
    </div>

    <section class="card">
      <div class="card-head wrap">
        <div class="segmented" role="tablist" aria-label="Filter by status">
          ${STATUS_TABS.map(
            (tab) => `<button class="seg-btn ${current.status === tab.value ? 'active' : ''}" type="button"
              data-status="${tab.value}" role="tab" aria-selected="${current.status === tab.value}">${tab.label}</button>`
          ).join('')}
        </div>
        <form class="filter-bar" id="filters-form" autocomplete="off">
          <div class="search">
            ${icon('search', 16)}
            <input name="q" type="search" placeholder="Guest, room or RSV number" value="${esc(current.q)}" />
          </div>
          <label class="date-field"><span>From</span><input type="date" name="from" value="${esc(current.from)}" /></label>
          <label class="date-field"><span>To</span><input type="date" name="to" value="${esc(current.to)}" /></label>
          <button class="btn btn-ghost btn-sm" type="submit">${icon('filter', 14)} Apply</button>
          ${
            current.q || current.from || current.to
              ? '<button class="link-btn" type="button" id="clear-filters">Clear</button>'
              : ''
          }
        </form>
      </div>

      <div class="table-meta">
        <span>${esc(String(rows.length))} ${pendingTab ? `booking request${rows.length === 1 ? '' : 's'}` : `reservation${rows.length === 1 ? '' : 's'}`} found</span>
        <span class="muted">${pendingTab ? 'Waiting for front desk approval' : 'Newest check-in dates first'}</span>
      </div>

      ${
        rows.length
          ? `<div class="table-wrap">
              <table class="table">
                <thead>
                  <tr>
                    <th>Reservation</th>
                    <th>Guest</th>
                    <th>Room</th>
                    <th>Stay dates</th>
                    <th>Nights</th>
                    <th>Status</th>
                    <th class="right">Balance</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  ${rows
                    .map(
                      (reservation) => `<tr data-res="${reservation.id}">
                        <td><span class="cell-title mono">${esc(reservation.code)}</span>
                          <span class="cell-sub">Booked ${esc(fmtDate(reservation.createdAt))}</span>
                          ${reservation.source !== 'front_desk' ? `<span class="cell-sub">${bookingSourcePill(reservation.source)}</span>` : ''}</td>
                        <td>
                          <div class="cell-main"><span class="avatar sm">${esc(initials(reservation.guestName))}</span>
                            <div><span class="cell-title">${esc(reservation.guestName)}</span>
                            <span class="cell-sub">${esc(reservation.guestPhone || reservation.guestEmail || '')}</span></div>
                          </div>
                        </td>
                        <td><span class="room-badge">${esc(reservation.roomNumber)}</span>
                          <span class="cell-sub">${esc(reservation.roomType)}</span></td>
                        <td>${esc(fmtDate(reservation.checkInDate))} &rarr; ${esc(fmtDate(reservation.checkOutDate))}</td>
                        <td>${esc(String(reservation.nights))}</td>
                        <td>${reservationStatusPill(reservation)}</td>
                        <td class="right">${
                          reservation.balance != null ? money(reservation.balance) : '<span class="muted">—</span>'
                        }</td>
                        <td class="right">${
                          needsApproval(reservation) && can('receptionist', 'admin')
                            ? `<div class="row-actions">
                                <button class="btn btn-sm btn-primary" type="button" data-approve="${reservation.id}">Approve</button>
                                <button class="btn btn-sm btn-ghost" type="button" data-decline="${reservation.id}">Decline</button>
                              </div>`
                            : `<span class="cell-link">Open ${icon('chevronRight', 13)}</span>`
                        }</td>
                      </tr>`
                    )
                    .join('')}
                </tbody>
              </table>
            </div>`
          : `<div class="card-body">${emptyState(
              'calendar',
              'No reservations match',
              'Try a different status, clear the dates, or create a new reservation.'
            )}</div>`
      }
    </section>
  `;

  el.querySelector('#new-reservation')?.addEventListener('click', () => openNewReservation({ onDone: reload }));

  el.querySelector('#export-reservations')?.addEventListener('click', () => {
    downloadCSV(
      `sunrise-reservations-${new Date().toISOString().slice(0, 10)}.csv`,
      [
        ['Reservation', 'Guest', 'Phone', 'Room', 'Room type', 'Check-in', 'Check-out', 'Nights', 'Status', 'Channel', 'Approval', 'Balance'],
        ...rows.map((reservation) => [
          reservation.code,
          reservation.guestName,
          reservation.guestPhone,
          reservation.roomNumber,
          reservation.roomType,
          reservation.checkInDate,
          reservation.checkOutDate,
          reservation.nights,
          reservation.status,
          reservation.source,
          reservation.approvalStatus,
          reservation.balance ?? '',
        ]),
      ]
    );
  });

  el.querySelector('#clear-filters')?.addEventListener('click', () => {
    filters = { status: current.status, q: '', from: '', to: '' };
    reload();
  });

  el.querySelectorAll('[data-status]').forEach((button) => {
    button.addEventListener('click', () => {
      current.status = button.dataset.status;
      history.replaceState(null, '', `#/reservations${current.status ? `?status=${current.status}` : ''}`);
      filtersHash = location.hash;
      reload();
    });
  });

  el.querySelector('#filters-form')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget).entries());
    current.q = String(values.q || '').trim();
    current.from = values.from || '';
    current.to = values.to || '';
    reload();
  });

  el.onclick = (event) => {
    const approve = event.target.closest('[data-approve]');
    if (approve) {
      const reservation = rows.find((item) => item.id === Number(approve.dataset.approve));
      if (reservation) approveBookingRequest(reservation, { onDone: reload });
      return;
    }
    const decline = event.target.closest('[data-decline]');
    if (decline) {
      const reservation = rows.find((item) => item.id === Number(decline.dataset.decline));
      if (reservation) openDeclineRequest(reservation, { onDone: reload });
      return;
    }
    if (event.target.closest('button, a, form, input, label')) return;
    const row = event.target.closest('[data-res]');
    if (row) openReservationDetail(Number(row.dataset.res), { onDone: reload });
  };
}
