import { api } from '../api.js';
import { state, can } from '../store.js';
import { icon } from '../icons.js';
import { donutChart, areaChart } from '../charts.js';
import {
  moneyCompact,
  num,
  esc,
  initials,
  greeting,
  fmtDate,
  fmtWeekday,
  fmtTime,
  relativeTime,
  nightsLabel,
  rangeLabel,
  roomTile,
  activityFeed,
  emptyState,
  viewSkeleton,
  roomStatusMeta,
  ROOM_STATUS,
  statusPill,
  reservationStatusMeta,
  bookingSourcePill,
} from '../utils.js';
import {
  openNewReservation,
  openCheckIn,
  openCheckout,
  openReservationDetail,
  openRoomDetail,
  approveBookingRequest,
  openDeclineRequest,
} from '../flows.js';

export const meta = {
  title: 'Dashboard',
  sub: 'Today at a glance — rooms, arrivals, departures and revenue.',
  roles: ['admin', 'receptionist', 'manager', 'housekeeping'],
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
      <span>Room ${esc(reservation.roomNumber)} &middot; due ${esc(fmtDate(reservation.checkOutDate))}</span>
    </div>
    <div class="list-actions">
      ${
        reservation.checkOutDate < new Date().toISOString().slice(0, 10)
          ? '<span class="pill red">Overdue</span>'
          : '<span class="pill amber">Due today</span>'
      }
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
      <span class="request-note">Requested ${esc(relativeTime(reservation.createdAt))}</span>
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
  const data = await api.get('/api/dashboard');
  const reload = () => render(el);
  const stats = data.stats;
  const firstName = (state.user.fullName || '').split(' ')[0];

  const statusItems = ['available', 'occupied', 'reserved', 'cleaning', 'maintenance'].map((key) => ({
    key,
    label: ROOM_STATUS[key].label,
    color: ROOM_STATUS[key].color,
    value: data.statusCounts[key] || 0,
  }));

  const chartPoints = data.series.map((point) => ({
    label: fmtWeekday(point.date),
    pct: point.pct,
  }));
  const maxPoint = data.series.reduce((best, point) => (point.pct > best.pct ? point : best), data.series[0] || { pct: 0 });
  const roomPreview = data.rooms.slice(0, 10);

  el.innerHTML = `
    <div class="view-head">
      <div class="view-head-text">
        <span class="eyebrow">${esc(fmtDate(data.today))}</span>
        <h2>${esc(greeting())}, ${esc(firstName)}.</h2>
        <p>Here is what is happening across the hotel today.</p>
      </div>
      <div class="page-actions">
        <a class="btn btn-ghost" href="#/frontdesk">${icon('bell', 15)} Front desk</a>
        ${
          can('receptionist', 'admin')
            ? `<button class="btn btn-primary" type="button" id="new-reservation">${icon('plus', 15)} New reservation</button>`
            : ''
        }
        <button class="icon-btn" type="button" data-refresh title="Refresh">${icon('refresh', 17)}</button>
      </div>
    </div>

    <div class="stats-grid">
      ${stat('amber', 'trendUp', 'Occupancy', `${stats.occupancyPct}%`, `${stats.occupied ?? data.statusCounts.occupied} of ${data.totalRooms} rooms occupied`)}
      ${stat('green', 'doorOpen', 'Available rooms', num(stats.available), 'Ready to sell tonight')}
      ${stat('blue', 'users', 'In-house guests', num(stats.inHouse), 'Currently checked in')}
      ${stat('violet', 'logIn', 'Arrivals today', num(stats.arrivals), 'Expected at the front desk')}
      ${stat('coral', 'key', 'Departures', num(stats.departures), 'Due to check out')}
      ${stat('teal', 'wallet', 'Revenue today', moneyCompact(stats.revenueToday), 'Payments collected')}
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

    <div class="dash-grid">
      <section class="card span-2">
        <div class="card-head">
          <div>
            <h3>Occupancy trend</h3>
            <p>Room occupancy over the last 7 days</p>
          </div>
          <span class="card-chip">${esc(maxPoint ? `${maxPoint.pct}% peak` : 'No data')}</span>
        </div>
        <div class="card-body chart-pad">
          ${areaChart(chartPoints, { gradientId: 'dashFill' })}
          <div class="chart-foot">
            <span><i class="dot amber"></i> Occupancy</span>
            <span>Today &middot; ${esc(num(data.statusCounts.occupied))} occupied rooms</span>
          </div>
        </div>
      </section>

      <section class="card">
        <div class="card-head">
          <div>
            <h3>Room status</h3>
            <p>Live housekeeping picture</p>
          </div>
        </div>
        <div class="card-body donut-wrap">
          ${donutChart(statusItems, { centerValue: data.totalRooms, centerLabel: 'rooms' })}
          <div class="legend">
            ${statusItems
              .map(
                (item) => `<div class="legend-row">
                  <i class="dot" style="background:${item.color}"></i>
                  <span>${esc(item.label)}</span>
                  <strong>${esc(num(item.value))}</strong>
                </div>`
              )
              .join('')}
          </div>
        </div>
      </section>
    </div>

    <div class="dash-grid three">
      <section class="card">
        <div class="card-head">
          <div>
            <h3>Arriving today</h3>
            <p>${esc(num(data.arrivals.length))} reservation${data.arrivals.length === 1 ? '' : 's'} expected</p>
          </div>
          <a class="link-btn" href="#/frontdesk">View all</a>
        </div>
        <div class="card-body list">
          ${
            data.arrivals.length
              ? data.arrivals.slice(0, 5).map(arrivalRow).join('')
              : emptyState('calendarCheck', 'No arrivals today', 'New bookings will show up here on their check-in date.')
          }
        </div>
      </section>

      <section class="card">
        <div class="card-head">
          <div>
            <h3>Departing today</h3>
            <p>${esc(num(data.departures.length))} folio${data.departures.length === 1 ? '' : 's'} to close</p>
          </div>
          <a class="link-btn" href="#/frontdesk">View all</a>
        </div>
        <div class="card-body list">
          ${
            data.departures.length
              ? data.departures.slice(0, 5).map(departureRow).join('')
              : emptyState('checkCircle', 'No departures today', 'Guests due to leave will appear here.')
          }
        </div>
      </section>

      <section class="card">
        <div class="card-head">
          <div>
            <h3>Recent activity</h3>
            <p>Latest front desk actions</p>
          </div>
        </div>
        <div class="card-body">
          ${activityFeed(data.activity)}
        </div>
      </section>
    </div>

    <section class="card">
      <div class="card-head">
        <div>
          <h3>Rooms at a glance</h3>
          <p>Click a room to open its details and status actions</p>
        </div>
        <a class="link-btn" href="#/rooms">All ${esc(num(data.totalRooms))} rooms</a>
      </div>
      <div class="card-body">
        <div class="room-grid compact">
          ${roomPreview.map(roomTile).join('')}
        </div>
      </div>
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
    const room = event.target.closest('[data-room]');
    if (room) {
      openRoomDetail(Number(room.dataset.room), { onDone: reload });
      return;
    }
    const row = event.target.closest('[data-res]');
    if (row) openReservationDetail(Number(row.dataset.res), { onDone: reload });
  };

  el.onkeydown = (event) => {
    if ((event.key === 'Enter' || event.key === ' ') && event.target.matches('[data-res]')) {
      event.preventDefault();
      openReservationDetail(Number(event.target.dataset.res), { onDone: reload });
    }
  };
}
