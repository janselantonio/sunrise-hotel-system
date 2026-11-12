import { api } from '../api.js';
import { can } from '../store.js';
import { icon } from '../icons.js';
import {
  esc,
  num,
  roomTile,
  emptyState,
  viewSkeleton,
  ROOM_STATUS,
} from '../utils.js';
import { openRoomDetail, openRoomForm } from '../flows.js';

export const meta = {
  title: 'Rooms',
  sub: 'The room board — availability, occupancy and housekeeping status.',
  roles: ['admin', 'receptionist', 'manager', 'housekeeping'],
};

const FLOORS = [
  { value: '', label: 'All floors' },
  { value: '1', label: '1st floor' },
  { value: '2', label: '2nd floor' },
  { value: '3', label: '3rd floor' },
];

const STATUS_FILTERS = [
  { value: '', label: 'All statuses' },
  { value: 'available', label: 'Available' },
  { value: 'occupied', label: 'Occupied' },
  { value: 'reserved', label: 'Reserved' },
  { value: 'cleaning', label: 'Needs cleaning' },
  { value: 'maintenance', label: 'Out of service' },
];

let filters = { floor: '', status: '' };

export async function render(el) {
  el.innerHTML = viewSkeleton();
  const data = await api.get('/api/rooms');
  const reload = () => render(el);

  const rooms = data.rooms.filter(
    (room) =>
      (!filters.floor || String(room.floor) === filters.floor) &&
      (!filters.status || room.displayStatus === filters.status)
  );

  el.innerHTML = `
    <div class="view-head">
      <div class="view-head-text">
        <span class="eyebrow">Room inventory</span>
        <h2>Rooms</h2>
        <p>Click a room to open its stay details, housekeeping log and status actions.</p>
      </div>
      <div class="page-actions">
        ${
          can('admin')
            ? `<button class="btn btn-ghost" type="button" id="add-room">${icon('plus', 15)} Add room</button>`
            : ''
        }
        <button class="icon-btn" type="button" data-refresh title="Refresh">${icon('refresh', 17)}</button>
      </div>
    </div>

    <div class="stats-grid">
      ${Object.entries(ROOM_STATUS)
        .map(
          ([key, meta]) => `<article class="stat tone-${meta.tone} slim">
            <span class="stat-icon">${icon(
              key === 'maintenance' ? 'alertTriangle' : key === 'cleaning' ? 'broom' : key === 'reserved' ? 'calendarCheck' : key === 'occupied' ? 'users' : 'doorOpen',
              18
            )}</span>
            <div class="stat-body">
              <span class="stat-label">${esc(meta.label)}</span>
              <strong class="stat-value">${esc(num(data.counts[key] || 0))}</strong>
            </div>
          </article>`
        )
        .join('')}
    </div>

    <section class="card">
      <div class="card-head wrap">
        <div class="segmented" role="tablist" aria-label="Filter by floor">
          ${FLOORS.map(
            (floor) => `<button class="seg-btn ${filters.floor === floor.value ? 'active' : ''}" type="button"
              data-floor="${floor.value}">${floor.label}</button>`
          ).join('')}
        </div>
        <div class="segmented quiet" role="tablist" aria-label="Filter by status">
          ${STATUS_FILTERS.map(
            (status) => `<button class="seg-btn ${filters.status === status.value ? 'active' : ''}" type="button"
              data-status="${status.value}">${status.label}</button>`
          ).join('')}
        </div>
      </div>

      <div class="card-body">
        <div class="room-legend">
          ${Object.values(ROOM_STATUS)
            .map((item) => `<span class="legend-inline"><i class="dot" style="background:${item.color}"></i>${esc(
              item.label
            )}</span>`)
            .join('')}
        </div>
        ${
          rooms.length
            ? `<div class="room-grid">${rooms.map(roomTile).join('')}</div>`
            : emptyState('door', 'No rooms in this view', 'Try another floor or status filter.')
        }
      </div>
    </section>
  `;

  el.querySelector('[data-refresh]')?.addEventListener('click', reload);
  el.querySelector('#add-room')?.addEventListener('click', () => openRoomForm(null, { onDone: reload }));

  el.querySelectorAll('[data-floor]').forEach((button) => {
    button.addEventListener('click', () => {
      filters.floor = button.dataset.floor;
      reload();
    });
  });

  el.querySelectorAll('[data-status]').forEach((button) => {
    button.addEventListener('click', () => {
      filters.status = button.dataset.status;
      reload();
    });
  });

  el.onclick = (event) => {
    const tile = event.target.closest('[data-room]');
    if (tile) openRoomDetail(Number(tile.dataset.room), { onDone: reload });
  };
}
