import { api } from '../api.js';
import { can } from '../store.js';
import { icon } from '../icons.js';
import {
  esc,
  num,
  initials,
  fmtDate,
  fmtDateShort,
  emptyState,
  viewSkeleton,
  downloadCSV,
} from '../utils.js';
import { openGuestDetail, openGuestForm } from '../flows.js';

export const meta = {
  title: 'Guests',
  sub: 'A single, searchable record for every guest.',
  roles: ['admin', 'receptionist', 'manager'],
};

let searchQuery = '';

export async function render(el) {
  el.innerHTML = viewSkeleton();
  const data = await api.get(`/api/guests${searchQuery ? `?q=${encodeURIComponent(searchQuery)}` : ''}`);
  const reload = () => render(el);
  const guests = data.guests;
  const month = new Date().toISOString().slice(0, 7);
  const repeat = guests.filter((guest) => guest.stays > 1).length;
  const active = guests.reduce((sum, guest) => sum + Number(guest.activeStays || 0), 0);
  const newThisMonth = guests.filter((guest) => String(guest.createdAt).slice(0, 7) === month).length;

  el.innerHTML = `
    <div class="view-head">
      <div class="view-head-text">
        <span class="eyebrow">Guest directory</span>
        <h2>Guests</h2>
        <p>Contact details, stay history and folios in one place.</p>
      </div>
      <div class="page-actions">
        <button class="btn btn-ghost" type="button" id="export-guests">${icon('download', 15)} Export CSV</button>
        ${
          can('receptionist', 'admin')
            ? `<button class="btn btn-primary" type="button" id="add-guest">${icon('userPlus', 15)} Add guest</button>`
            : ''
        }
      </div>
    </div>

    <div class="stats-grid">
      <article class="stat tone-amber">
        <span class="stat-icon">${icon('users', 18)}</span>
        <div class="stat-body"><span class="stat-label">Guest records</span>
        <strong class="stat-value">${esc(num(guests.length))}</strong>
        <span class="stat-meta">Named profiles on file</span></div>
      </article>
      <article class="stat tone-violet">
        <span class="stat-icon">${icon('star', 18)}</span>
        <div class="stat-body"><span class="stat-label">Repeat guests</span>
        <strong class="stat-value">${esc(num(repeat))}</strong>
        <span class="stat-meta">More than one stay</span></div>
      </article>
      <article class="stat tone-blue">
        <span class="stat-icon">${icon('calendarCheck', 18)}</span>
        <div class="stat-body"><span class="stat-label">Active stays</span>
        <strong class="stat-value">${esc(num(active))}</strong>
        <span class="stat-meta">Reserved or in-house</span></div>
      </article>
      <article class="stat tone-green">
        <span class="stat-icon">${icon('userPlus', 18)}</span>
        <div class="stat-body"><span class="stat-label">New this month</span>
        <strong class="stat-value">${esc(num(newThisMonth))}</strong>
        <span class="stat-meta">Added in ${esc(fmtDate(`${month}-01`))}</span></div>
      </article>
    </div>

    <section class="card">
      <div class="card-head wrap">
        <form class="filter-bar" id="guest-search-form" autocomplete="off">
          <div class="search wide">
            ${icon('search', 16)}
            <input name="q" type="search" value="${esc(searchQuery)}" placeholder="Search guest name, phone or email" />
          </div>
          <button class="btn btn-ghost btn-sm" type="submit">Search</button>
          ${searchQuery ? '<button class="link-btn" type="button" id="clear-search">Clear</button>' : ''}
        </form>
        <span class="table-meta-inline">${esc(String(guests.length))} record${guests.length === 1 ? '' : 's'}</span>
      </div>

      ${
        guests.length
          ? `<div class="table-wrap">
              <table class="table">
                <thead>
                  <tr><th>Guest</th><th>Contact</th><th>Identification</th><th>Stays</th><th>Last stay</th><th></th></tr>
                </thead>
                <tbody>
                  ${guests
                    .map(
                      (guest) => `<tr data-guest="${guest.id}">
                        <td>
                          <div class="cell-main"><span class="avatar sm">${esc(initials(guest.fullName))}</span>
                            <div><span class="cell-title">${esc(guest.fullName)}</span>
                            <span class="cell-sub">Guest since ${esc(fmtDate(guest.createdAt))}</span></div>
                          </div>
                        </td>
                        <td><span class="cell-title">${esc(guest.phone || '—')}</span>
                          <span class="cell-sub">${esc(guest.email || 'No email on file')}</span></td>
                        <td><span class="cell-title">${esc(guest.idType || '—')}</span>
                          <span class="cell-sub">${esc(guest.idNumber || '')}</span></td>
                        <td>${esc(String(guest.stays || 0))}
                          ${guest.activeStays ? '<span class="pill green tiny">Active</span>' : ''}</td>
                        <td>${guest.lastStay ? esc(fmtDateShort(guest.lastStay)) : '<span class="muted">—</span>'}</td>
                        <td class="right"><span class="cell-link">Open ${icon('chevronRight', 13)}</span></td>
                      </tr>`
                    )
                    .join('')}
                </tbody>
              </table>
            </div>`
          : `<div class="card-body">${emptyState(
              'users',
              searchQuery ? 'No guests match your search' : 'No guest records yet',
              searchQuery ? 'Try a shorter name, phone number or clear the search.' : 'Guests are created with their first reservation.'
            )}</div>`
      }
    </section>
  `;

  el.querySelector('#add-guest')?.addEventListener('click', () => openGuestForm(null, { onDone: reload }));

  el.querySelector('#guest-search-form')?.addEventListener('submit', (event) => {
    event.preventDefault();
    searchQuery = String(new FormData(event.currentTarget).get('q') || '').trim();
    reload();
  });

  el.querySelector('#clear-search')?.addEventListener('click', () => {
    searchQuery = '';
    reload();
  });

  el.querySelector('#export-guests')?.addEventListener('click', () => {
    downloadCSV(
      `sunrise-guests-${new Date().toISOString().slice(0, 10)}.csv`,
      [
        ['Guest', 'Phone', 'Email', 'Address', 'ID type', 'ID number', 'Stays', 'Last stay'],
        ...guests.map((guest) => [
          guest.fullName,
          guest.phone,
          guest.email,
          guest.address,
          guest.idType,
          guest.idNumber,
          guest.stays,
          guest.lastStay || '',
        ]),
      ]
    );
  });

  el.onclick = (event) => {
    if (event.target.closest('button, a, form, input')) return;
    const row = event.target.closest('[data-guest]');
    if (row) openGuestDetail(Number(row.dataset.guest), { onDone: reload });
  };
}
