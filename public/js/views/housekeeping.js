import { api } from '../api.js';
import { can } from '../store.js';
import { icon } from '../icons.js';
import {
  esc,
  num,
  initials,
  relativeTime,
  emptyState,
  viewSkeleton,
  statusPill,
  roomStatusMeta,
  withBusy,
  toast,
} from '../utils.js';
import { openRoomDetail } from '../flows.js';

export const meta = {
  title: 'Housekeeping',
  sub: 'Keep every room clean, ready and accounted for.',
  roles: ['admin', 'receptionist', 'manager', 'housekeeping'],
};

function canUpdate() {
  return can('housekeeping', 'receptionist', 'admin');
}

function roomCard(room, tone, action) {
  const meta = roomStatusMeta(tone);
  return `<article class="hk-card" data-room="${room.id}" tabindex="0" role="button">
    <div class="hk-card-top">
      <span class="room-badge big">${esc(room.number)}</span>
      ${statusPill(meta)}
    </div>
    <div class="hk-card-meta">
      <span>${esc(room.type)}</span>
      <span>Floor ${esc(String(room.floor))}</span>
    </div>
    ${room.lastNote ? `<p class="hk-note">${esc(room.lastNote)}</p>` : '<p class="hk-note muted">No housekeeping note.</p>'}
    <div class="hk-card-foot">
      <span class="muted small">${room.lastUpdate ? `Updated ${esc(relativeTime(room.lastUpdate))}` : 'Awaiting update'}</span>
      ${action || ''}
    </div>
  </article>`;
}

export async function render(el) {
  el.innerHTML = viewSkeleton();
  const data = await api.get('/api/housekeeping');
  const reload = () => render(el);
  const update = async (button, roomId, status, message) => {
    await withBusy(
      button,
      async () => {
        try {
          await api.patch(`/api/rooms/${roomId}`, { status });
          toast(message);
          reload();
        } catch (error) {
          toast(error.message, 'error');
        }
      },
      'Saving…'
    );
  };

  el.innerHTML = `
    <div class="view-head">
      <div class="view-head-text">
        <span class="eyebrow">Room readiness</span>
        <h2>Housekeeping</h2>
        <p>Move rooms through cleaning, readiness and out-of-service status.</p>
      </div>
      <div class="page-actions">
        <button class="icon-btn" type="button" data-refresh title="Refresh">${icon('refresh', 17)}</button>
      </div>
    </div>

    <div class="stats-grid">
      <article class="stat tone-amber">
        <span class="stat-icon">${icon('broom', 18)}</span>
        <div class="stat-body"><span class="stat-label">Needs cleaning</span>
        <strong class="stat-value">${esc(num(data.counts.needsCleaning))}</strong>
        <span class="stat-meta">Rooms waiting for housekeeping</span></div>
      </article>
      <article class="stat tone-green">
        <span class="stat-icon">${icon('sparkles', 18)}</span>
        <div class="stat-body"><span class="stat-label">Ready</span>
        <strong class="stat-value">${esc(num(data.counts.ready))}</strong>
        <span class="stat-meta">Available to sell tonight</span></div>
      </article>
      <article class="stat tone-red">
        <span class="stat-icon">${icon('users', 18)}</span>
        <div class="stat-body"><span class="stat-label">Occupied</span>
        <strong class="stat-value">${esc(num(data.counts.occupied))}</strong>
        <span class="stat-meta">Guests currently in the room</span></div>
      </article>
      <article class="stat tone-gray">
        <span class="stat-icon">${icon('alertTriangle', 18)}</span>
        <div class="stat-body"><span class="stat-label">Out of service</span>
        <strong class="stat-value">${esc(num(data.counts.outOfService))}</strong>
        <span class="stat-meta">Under repair or blocked</span></div>
      </article>
      <article class="stat tone-violet">
        <span class="stat-icon">${icon('calendarCheck', 18)}</span>
        <div class="stat-body"><span class="stat-label">Reserved today</span>
        <strong class="stat-value">${esc(num(data.counts.reserved))}</strong>
        <span class="stat-meta">Held for arriving guests</span></div>
      </article>
    </div>

    <div class="hk-board">
      <section class="hk-column">
        <header class="hk-head">
          <h3>Needs cleaning</h3>
          <span class="count">${esc(String(data.needsCleaning.length))}</span>
        </header>
        <div class="hk-body">
          ${
            data.needsCleaning.length
              ? data.needsCleaning
                  .map((room) =>
                    roomCard(
                      room,
                      'cleaning',
                      canUpdate()
                        ? `<button class="btn btn-sm btn-primary" type="button" data-clean="${room.id}">${icon(
                            'check',
                            13
                          )} Mark clean</button>`
                        : ''
                    )
                  )
                  .join('')
              : emptyState('sparkles', 'All clean', 'No rooms are waiting for housekeeping.')
          }
        </div>
      </section>

      <section class="hk-column">
        <header class="hk-head">
          <h3>Ready</h3>
          <span class="count">${esc(String(data.ready.length))}</span>
        </header>
        <div class="hk-body">
          ${
            data.ready.length
              ? data.ready
                  .map((room) =>
                    roomCard(
                      room,
                      'available',
                      canUpdate()
                        ? `<button class="btn btn-sm btn-ghost" type="button" data-clean="${room.id}">${icon(
                            'broom',
                            13
                          )} Flag cleaning</button>`
                        : ''
                    )
                  )
                  .join('')
              : emptyState('door', 'No rooms ready', 'Mark a room clean to release it for sale.')
          }
        </div>
      </section>

      <section class="hk-column">
        <header class="hk-head">
          <h3>Out of service</h3>
          <span class="count">${esc(String(data.outOfService.length))}</span>
        </header>
        <div class="hk-body">
          ${
            data.outOfService.length
              ? data.outOfService
                  .map((room) =>
                    roomCard(
                      room,
                      'maintenance',
                      canUpdate()
                        ? `<button class="btn btn-sm btn-primary" type="button" data-clean="${room.id}">Return to service</button>`
                        : ''
                    )
                  )
                  .join('')
              : emptyState('checkCircle', 'Nothing blocked', 'No rooms are currently out of service.')
          }
        </div>
      </section>
    </div>

    <div class="dash-grid">
      <section class="card">
        <div class="card-head">
          <div>
            <h3>Occupied rooms</h3>
            <p>These rooms open for cleaning after check-out</p>
          </div>
          <span class="card-chip">${esc(String(data.occupied.length))}</span>
        </div>
        <div class="card-body">
          ${
            data.occupied.length
              ? `<div class="occupied-chips">${data.occupied
                  .map(
                    (room) => `<button class="occupied-chip" type="button" data-room="${room.id}">
                      <span class="room-badge">${esc(room.number)}</span>
                      <span>${esc(room.currentGuest?.guestName || room.type)}</span>
                      ${room.currentGuest ? `<em>out ${esc(room.currentGuest.checkOutDate.slice(5))}</em>` : ''}
                    </button>`
                  )
                  .join('')}</div>`
              : emptyState('bed', 'No occupied rooms', 'The hotel is currently quiet.')
          }
        </div>
      </section>

      <section class="card">
        <div class="card-head">
          <div>
            <h3>Recent updates</h3>
            <p>Latest housekeeping log entries</p>
          </div>
        </div>
        <div class="card-body">
          ${
            data.logs.length
              ? `<div class="activity">${data.logs
                  .map(
                    (log) => `<div class="activity-item">
                      <span class="activity-dot"></span>
                      <div class="activity-body">
                        <p><strong>Room ${esc(log.roomNumber)}</strong> ${esc(
                      roomStatusMeta(log.status).label.toLowerCase()
                    )}${log.note ? ` &mdash; ${esc(log.note)}` : ''}</p>
                        <span>${esc(log.updatedByName)} &middot; ${esc(relativeTime(log.createdAt))}</span>
                      </div>
                    </div>`
                  )
                  .join('')}</div>`
              : emptyState('clock', 'No updates yet', 'Housekeeping actions will be logged here.')
          }
        </div>
      </section>
    </div>
  `;

  el.querySelector('[data-refresh]')?.addEventListener('click', reload);

  el.onclick = (event) => {
    const action = event.target.closest('[data-clean]');
    if (action) {
      event.stopPropagation();
      const roomId = Number(action.dataset.clean);
      const room =
        data.needsCleaning.find((item) => item.id === roomId) ||
        data.ready.find((item) => item.id === roomId) ||
        data.outOfService.find((item) => item.id === roomId);
      if (!room) return;
      if (room.status === 'cleaning') update(action, roomId, 'available', `Room ${room.number} is ready.`);
      else if (room.status === 'maintenance') update(action, roomId, 'available', `Room ${room.number} is back in service.`);
      else update(action, roomId, 'cleaning', `Room ${room.number} flagged for cleaning.`);
      return;
    }
    const card = event.target.closest('[data-room]');
    if (card) openRoomDetail(Number(card.dataset.room), { onDone: reload });
  };

  el.onkeydown = (event) => {
    if ((event.key === 'Enter' || event.key === ' ') && event.target.matches('.hk-card')) {
      event.preventDefault();
      openRoomDetail(Number(event.target.dataset.room), { onDone: reload });
    }
  };
}
