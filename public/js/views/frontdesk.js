import { api } from '../api.js';
import { can } from '../store.js';
import { icon } from '../icons.js';
import {
  esc,
  initials,
  fmtDate,
  fmtDateShort,
  nightsLabel,
  rangeLabel,
  relativeTime,
  emptyState,
  viewSkeleton,
  statusPill,
  reservationStatusMeta,
  bookingSourcePill,
  money,
} from '../utils.js';
import {
  openNewReservation,
  openCheckIn,
  openCheckout,
  openReservationDetail,
  approveBookingRequest,
  openDeclineRequest,
} from '../flows.js';

export const meta = {
  title: 'Front desk',
  sub: 'Arrivals, departures and the guests staying with us right now.',
  roles: ['admin', 'receptionist', 'manager'],
};

function stat(tone, iconName, label, value, metaText) {
  return `<article class="stat tone-${tone}">
    <span class="stat-icon">${icon(iconName, 18)}</span>
    <div class="stat-body">
      <span class="stat-label">${esc(label)}</span>
      <strong class="stat-value">${value}</strong>
      <span class="stat-meta">${esc(metaText)}</span>
    </div>
  </article>`;
}

function arrivalRow(reservation) {
  return `<div class="list-row" data-res="${reservation.id}" tabindex="0" role="button">
    <span class="avatar sm">${esc(initials(reservation.guestName))}</span>
    <div class="list-main">
      <strong>${esc(reservation.guestName)}</strong>
      <span>Room ${esc(reservation.roomNumber)} &middot; ${esc(nightsLabel(reservation.nights))} &middot; ${esc(
    reservation.roomType
  )}</span>
    </div>
    <div class="list-actions">
      ${statusPill(reservationStatusMeta(reservation.status))}
      ${
        can('receptionist', 'admin')
          ? `<button class="btn btn-sm btn-primary" type="button" data-checkin="${reservation.id}">Check in</button>`
          : ''
      }
    </div>
  </div>`;
}

function departureRow(reservation) {
  return `<div class="list-row" data-res="${reservation.id}" tabindex="0" role="button">
    <span class="avatar sm">${esc(initials(reservation.guestName))}</span>
    <div class="list-main">
      <strong>${esc(reservation.guestName)}</strong>
      <span>Room ${esc(reservation.roomNumber)} &middot; checked in ${esc(fmtDateShort(reservation.checkInDate))}</span>
    </div>
    <div class="list-actions">
      ${reservation.overdue ? '<span class="pill red">Overdue</span>' : '<span class="pill amber">Due today</span>'}
      ${
        can('receptionist', 'admin')
          ? `<button class="btn btn-sm btn-primary" type="button" data-checkout="${reservation.id}">Check out</button>`
          : ''
      }
    </div>
  </div>`;
}

function requestRow(reservation) {
  return `<div class="list-row request-row" data-res="${reservation.id}" tabindex="0" role="button">
    <span class="avatar sm">${esc(initials(reservation.guestName))}</span>
    <div class="list-main">
      <strong>${esc(reservation.guestName)} ${bookingSourcePill(reservation.source)}</strong>
      <span>Room ${esc(reservation.roomNumber)} &middot; ${esc(reservation.roomType)} &middot; ${esc(
    rangeLabel(reservation.checkInDate, reservation.checkOutDate)
  )} &middot; ${esc(nightsLabel(reservation.nights))}</span>
      <span class="request-note">Requested ${esc(relativeTime(reservation.createdAt))} &middot; ${esc(
    reservation.guestPhone || reservation.guestEmail || ''
  )}</span>
    </div>
    <div class="list-actions">
      ${
        can('receptionist', 'admin')
          ? `<button class="btn btn-sm btn-ghost" type="button" data-decline="${reservation.id}">Decline</button>
             <button class="btn btn-sm btn-primary" type="button" data-approve="${reservation.id}">Approve</button>`
          : '<span class="pill amber">Pending approval</span>'
      }
    </div>
  </div>`;
}

export async function render(el) {
  el.innerHTML = viewSkeleton();
  const data = await api.get('/api/frontdesk');
  const reload = () => render(el);

  el.innerHTML = `
    <div class="view-head">
      <div class="view-head-text">
        <span class="eyebrow">${esc(fmtDate(data.today))}</span>
        <h2>Front desk</h2>
        <p>Handle check-ins, settle departures and look after in-house guests.</p>
      </div>
      <div class="page-actions">
        ${
          can('receptionist', 'admin')
            ? `<button class="btn btn-primary" type="button" id="new-reservation">${icon('plus', 15)} New reservation</button>`
            : ''
        }
        <button class="icon-btn" type="button" data-refresh title="Refresh">${icon('refresh', 17)}</button>
      </div>
    </div>

    <div class="stats-grid">
      ${stat('violet', 'logIn', 'Arrivals today', data.arrivals.length, 'Rooms held for today')}
      ${stat('coral', 'key', 'Departures', data.departures.length, 'Folios due to close')}
      ${stat('blue', 'users', 'Staying over', data.inHouse.length, 'Guests continuing their stay')}
      ${stat('red', 'alert', 'Overdue', data.overdue.length, 'Past their check-out date')}
    </div>

    ${
      data.pendingRequests.length
        ? `<section class="card request-card">
            <div class="card-head">
              <div>
                <h3>Online booking requests</h3>
                <p>${esc(
                  `${data.pendingRequests.length} request${data.pendingRequests.length === 1 ? '' : 's'} from the guest website waiting for approval`
                )}</p>
              </div>
              <a class="link-btn" href="#/reservations?status=pending">Review all ${icon('chevronRight', 13)}</a>
            </div>
            <div class="card-body list">
              ${data.pendingRequests.slice(0, 4).map(requestRow).join('')}
            </div>
          </section>`
        : ''
    }

    ${
      data.overdue.length
        ? `<div class="notice danger">
            ${icon('alert', 16)}
            <div><strong>${esc(
              `${data.overdue.length} guest${data.overdue.length === 1 ? '' : 's'} past check-out`
            )}</strong>
            <span>${esc(
              data.overdue
                .slice(0, 3)
                .map((reservation) => `Room ${reservation.roomNumber} · ${reservation.guestName}`)
                .join('  ·  ')
            )}</span></div>
          </div>`
        : ''
    }

    <div class="dash-grid">
      <section class="card">
        <div class="card-head">
          <div>
            <h3>Arrivals today</h3>
            <p>Confirm identity and hand over the key</p>
          </div>
          <span class="card-chip">${esc(String(data.arrivals.length))}</span>
        </div>
        <div class="card-body list">
          ${
            data.arrivals.length
              ? data.arrivals.map(arrivalRow).join('')
              : emptyState('calendarCheck', 'Nothing arriving', 'No reservations are due to check in today.')
          }
        </div>
      </section>

      <section class="card">
        <div class="card-head">
          <div>
            <h3>Departures</h3>
            <p>Settle the bill and release the room to housekeeping</p>
          </div>
          <span class="card-chip">${esc(String(data.departures.length))}</span>
        </div>
        <div class="card-body list">
          ${
            data.departures.length
              ? data.departures.map(departureRow).join('')
              : emptyState('checkCircle', 'No departures', 'Guests checking out today will appear here.')
          }
        </div>
      </section>
    </div>

    <section class="card">
      <div class="card-head">
        <div>
          <h3>In-house guests</h3>
          <p>Currently registered and staying beyond today</p>
        </div>
        <a class="link-btn" href="#/reservations?status=checked_in">All reservations</a>
      </div>
      ${
        data.inHouse.length
          ? `<div class="table-wrap">
              <table class="table">
                <thead><tr><th>Guest</th><th>Room</th><th>Check-in</th><th>Check-out</th><th>Nights</th><th class="right">Balance</th><th></th></tr></thead>
                <tbody>
                  ${data.inHouse
                    .map(
                      (reservation) => `<tr data-res="${reservation.id}">
                        <td>
                          <div class="cell-main"><span class="avatar sm">${esc(initials(reservation.guestName))}</span>
                            <div><span class="cell-title">${esc(reservation.guestName)}</span>
                            <span class="cell-sub">${esc(reservation.guestPhone || '')}</span></div>
                          </div>
                        </td>
                        <td><span class="room-badge">${esc(reservation.roomNumber)}</span><span class="cell-sub">${esc(
                        reservation.roomType
                      )}</span></td>
                        <td>${esc(fmtDate(reservation.checkInDate))}</td>
                        <td>${esc(fmtDate(reservation.checkOutDate))}</td>
                        <td>${esc(String(reservation.nights))}</td>
                        <td class="right">${reservation.balance != null ? money(reservation.balance) : '—'}</td>
                        <td class="right"><span class="cell-link">View ${icon('chevronRight', 13)}</span></td>
                      </tr>`
                    )
                    .join('')}
                </tbody>
              </table>
            </div>`
          : `<div class="card-body">${emptyState('bed', 'No in-house guests', 'Guests who stay beyond today will be listed here.')}</div>`
      }
    </section>

    <section class="card">
      <div class="card-head">
        <div>
          <h3>Next arrivals</h3>
          <p>Upcoming reservations after today</p>
        </div>
      </div>
      ${
        data.nextArrivals.length
          ? `<div class="table-wrap">
              <table class="table">
                <thead><tr><th>Guest</th><th>Room</th><th>Check-in</th><th>Nights</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  ${data.nextArrivals
                    .map(
                      (reservation) => `<tr data-res="${reservation.id}">
                        <td><span class="cell-title">${esc(reservation.guestName)}</span><span class="cell-sub">${esc(
                        reservation.guestPhone || ''
                      )}</span></td>
                        <td><span class="room-badge">${esc(reservation.roomNumber)}</span><span class="cell-sub">${esc(
                        reservation.roomType
                      )}</span></td>
                        <td>${esc(fmtDate(reservation.checkInDate))}</td>
                        <td>${esc(nightsLabel(reservation.nights))}</td>
                        <td>${statusPill(reservationStatusMeta(reservation.status))}</td>
                        <td class="right"><span class="cell-link">View ${icon('chevronRight', 13)}</span></td>
                      </tr>`
                    )
                    .join('')}
                </tbody>
              </table>
            </div>`
          : `<div class="card-body">${emptyState('calendar', 'No upcoming arrivals', 'Future reservations will appear here.')}</div>`
      }
    </section>
  `;

  el.querySelector('[data-refresh]')?.addEventListener('click', reload);
  el.querySelector('#new-reservation')?.addEventListener('click', () => openNewReservation({ onDone: reload }));

  el.onclick = (event) => {
    const approve = event.target.closest('[data-approve]');
    if (approve) {
      event.stopPropagation();
      const reservation = data.pendingRequests.find((item) => item.id === Number(approve.dataset.approve));
      if (reservation) approveBookingRequest(reservation, { onDone: reload });
      return;
    }
    const decline = event.target.closest('[data-decline]');
    if (decline) {
      event.stopPropagation();
      const reservation = data.pendingRequests.find((item) => item.id === Number(decline.dataset.decline));
      if (reservation) openDeclineRequest(reservation, { onDone: reload });
      return;
    }
    const checkin = event.target.closest('[data-checkin]');
    if (checkin) {
      event.stopPropagation();
      const reservation = data.arrivals.find((item) => item.id === Number(checkin.dataset.checkin));
      if (reservation) openCheckIn(reservation, { onDone: reload });
      return;
    }
    const checkout = event.target.closest('[data-checkout]');
    if (checkout) {
      event.stopPropagation();
      const reservation = data.departures.find((item) => item.id === Number(checkout.dataset.checkout));
      if (reservation) openCheckout(reservation, { onDone: reload });
      return;
    }
    const row = event.target.closest('[data-res]');
    if (row) openReservationDetail(Number(row.dataset.res), { onDone: reload });
  };
}
