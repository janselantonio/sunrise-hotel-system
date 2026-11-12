import { api } from '../api.js';
import { state } from '../store.js';
import { icon } from '../icons.js';
import {
  esc,
  initials,
  fmtDate,
  num,
  statusPill,
  ROLE_LABELS,
  setConfig,
  toast,
  withBusy,
  confirmDialog,
  viewSkeleton,
  emptyState,
} from '../utils.js';
import { openStaffForm, openPasswordReset } from '../flows.js';

export const meta = {
  title: 'Administration',
  sub: 'Staff accounts, roles and hotel configuration.',
  roles: ['admin'],
};

const ROLE_TONES = { admin: 'violet', receptionist: 'blue', manager: 'amber', housekeeping: 'green' };
let tab = 'staff';

export async function render(el) {
  el.innerHTML = viewSkeleton();
  const [userData, settingsData] = await Promise.all([api.get('/api/users'), api.get('/api/settings')]);
  const reload = () => render(el);
  const users = userData.users;
  const settings = settingsData.settings;
  const summary = userData.summary;
  const activeCount = users.filter((user) => user.active).length;

  el.innerHTML = `
    <div class="view-head">
      <div class="view-head-text">
        <span class="eyebrow">System administration</span>
        <h2>Administration</h2>
        <p>Manage the team, their access levels and hotel-wide settings.</p>
      </div>
      <div class="page-actions">
        <div class="segmented" role="tablist" aria-label="Administration sections">
          <button class="seg-btn ${tab === 'staff' ? 'active' : ''}" type="button" data-tab="staff">Staff</button>
          <button class="seg-btn ${tab === 'settings' ? 'active' : ''}" type="button" data-tab="settings">Settings</button>
        </div>
      </div>
    </div>

    <div class="stats-grid">
      <article class="stat tone-amber">
        <span class="stat-icon">${icon('users', 18)}</span>
        <div class="stat-body"><span class="stat-label">Team members</span>
        <strong class="stat-value">${esc(num(users.length))}</strong>
        <span class="stat-meta">${esc(String(activeCount))} active accounts</span></div>
      </article>
      <article class="stat tone-violet">
        <span class="stat-icon">${icon('shield', 18)}</span>
        <div class="stat-body"><span class="stat-label">Administrators</span>
        <strong class="stat-value">${esc(String(summary.counts.admin))}</strong>
        <span class="stat-meta">Full system access</span></div>
      </article>
      <article class="stat tone-blue">
        <span class="stat-icon">${icon('bell', 18)}</span>
        <div class="stat-body"><span class="stat-label">Front desk</span>
        <strong class="stat-value">${esc(String(summary.counts.receptionist))}</strong>
        <span class="stat-meta">Receptionists on duty</span></div>
      </article>
      <article class="stat tone-green">
        <span class="stat-icon">${icon('broom', 18)}</span>
        <div class="stat-body"><span class="stat-label">Housekeeping</span>
        <strong class="stat-value">${esc(String(summary.counts.housekeeping))}</strong>
        <span class="stat-meta">Room readiness updates only</span></div>
      </article>
    </div>

    ${
      tab === 'staff'
        ? `<section class="card">
            <div class="card-head">
              <div><h3>Staff accounts</h3><p>Roles control what each person can see and change</p></div>
              <button class="btn btn-primary btn-sm" type="button" id="add-staff">${icon('userPlus', 14)} New account</button>
            </div>
            ${
              users.length
                ? `<div class="table-wrap">
                    <table class="table">
                      <thead><tr><th>Staff member</th><th>Username</th><th>Role</th><th>Phone</th><th>Status</th><th>Created</th><th></th></tr></thead>
                      <tbody>
                        ${users
                          .map(
                            (user) => `<tr>
                              <td>
                                <div class="cell-main"><span class="avatar sm">${esc(initials(user.fullName))}</span>
                                  <div><span class="cell-title">${esc(user.fullName)}</span>
                                  <span class="cell-sub">${esc(ROLE_LABELS[user.role] || user.role)}</span></div>
                                </div>
                              </td>
                              <td><span class="mono">${esc(user.username)}</span></td>
                              <td>${statusPill(
                                { label: ROLE_LABELS[user.role] || user.role, tone: ROLE_TONES[user.role] || 'gray' }
                              )}</td>
                              <td>${esc(user.phone || '—')}</td>
                              <td>${user.active ? '<span class="pill green">Active</span>' : '<span class="pill gray">Disabled</span>'}</td>
                              <td>${esc(fmtDate(user.createdAt))}</td>
                              <td class="right">
                                <div class="row-actions">
                                  <button class="btn btn-sm btn-ghost" type="button" data-edit="${user.id}">Edit</button>
                                  <button class="btn btn-sm btn-ghost" type="button" data-reset="${user.id}">Password</button>
                                  <button class="btn btn-sm ${
                                    user.active ? 'btn-danger-soft' : 'btn-ghost'
                                  }" type="button" data-toggle="${user.id}">${
                              user.active ? 'Disable' : 'Enable'
                            }</button>
                                </div>
                              </td>
                            </tr>`
                          )
                          .join('')}
                      </tbody>
                    </table>
                  </div>`
                : `<div class="card-body">${emptyState('users', 'No staff accounts', 'Create the first account to get started.')}</div>`
            }
          </section>`
        : `<div class="settings-grid">
            <section class="card">
              <div class="card-head">
                <div><h3>Hotel profile</h3><p>Printed on receipts and used across the app</p></div>
              </div>
              <div class="card-body">
                <form id="settings-form" class="form-stack" autocomplete="off">
                  <div class="form-grid">
                    <label class="field span-2"><span>Hotel name</span><input name="hotelName" value="${esc(
                      settings.hotelName
                    )}" required /></label>
                    <label class="field span-2"><span>Address</span><input name="address" value="${esc(
                      settings.address
                    )}" /></label>
                    <label class="field"><span>Phone</span><input name="phone" value="${esc(settings.phone)}" /></label>
                    <label class="field"><span>Email</span><input name="email" type="email" value="${esc(
                      settings.email
                    )}" /></label>
                    <label class="field"><span>Currency code</span><input name="currency" value="${esc(
                      settings.currency
                    )}" maxlength="8" /></label>
                    <label class="field"><span>Currency symbol</span><input name="currencySymbol" value="${esc(
                      settings.currencySymbol
                    )}" maxlength="4" /></label>
                    <label class="field"><span>VAT rate (%)</span><input name="taxRate" type="number" min="0" max="40" step="0.5" value="${esc(
                      String(settings.taxRate)
                    )}" /></label>
                    <label class="field"><span>Check-in time</span><input name="checkInTime" type="time" value="${esc(
                      settings.checkInTime
                    )}" /></label>
                    <label class="field"><span>Check-out time</span><input name="checkOutTime" type="time" value="${esc(
                      settings.checkOutTime
                    )}" /></label>
                  </div>
                  <p class="hint">Changing the VAT rate affects new charges only; issued invoices keep their original tax.</p>
                  <div class="form-actions">
                    <button class="btn btn-primary" type="submit" id="save-settings">${icon('check', 15)} Save settings</button>
                  </div>
                </form>
              </div>
            </section>

            <aside class="card access-card">
              <div class="card-head"><div><h3>Access levels</h3><p>Role responsibilities</p></div></div>
              <div class="card-body access-list">
                <div class="access-row"><span class="pill violet">Administrator</span><p>Staff accounts, hotel settings, security and all operations.</p></div>
                <div class="access-row"><span class="pill blue">Receptionist</span><p>Reservations, guests, check-in/out, payments and room status.</p></div>
                <div class="access-row"><span class="pill amber">Manager</span><p>Read-only operations plus reports and activity history.</p></div>
                <div class="access-row"><span class="pill green">Housekeeping</span><p>Room board and cleaning status updates only.</p></div>
              </div>
            </aside>
          </div>`
    }
  `;

  el.querySelectorAll('[data-tab]').forEach((button) => {
    button.addEventListener('click', () => {
      tab = button.dataset.tab;
      reload();
    });
  });

  el.querySelector('#add-staff')?.addEventListener('click', () => openStaffForm(null, { onDone: reload }));

  el.onclick = async (event) => {
    const edit = event.target.closest('[data-edit]');
    if (edit) {
      const user = users.find((item) => item.id === Number(edit.dataset.edit));
      if (user) openStaffForm(user, { onDone: reload });
      return;
    }
    const reset = event.target.closest('[data-reset]');
    if (reset) {
      const user = users.find((item) => item.id === Number(reset.dataset.reset));
      if (user) openPasswordReset(user, { onDone: reload });
      return;
    }
    const toggle = event.target.closest('[data-toggle]');
    if (toggle) {
      const user = users.find((item) => item.id === Number(toggle.dataset.toggle));
      if (!user) return;
      const confirmed = await confirmDialog({
        title: user.active ? 'Disable this account?' : 'Enable this account?',
        message: user.active
          ? `${user.fullName} will no longer be able to sign in. Their history stays intact.`
          : `${user.fullName} will be able to sign in again with their existing password.`,
        confirmLabel: user.active ? 'Disable account' : 'Enable account',
        tone: user.active ? 'danger' : 'primary',
      });
      if (!confirmed) return;
      await withBusy(toggle, async () => {
        try {
          await api.patch(`/api/users/${user.id}`, { active: !user.active });
          toast(user.active ? 'Account disabled.' : 'Account enabled.');
          reload();
        } catch (error) {
          toast(error.message, 'error');
        }
      });
      return;
    }
  };

  el.querySelector('#settings-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = el.querySelector('#save-settings');
    const values = Object.fromEntries(new FormData(event.currentTarget).entries());
    await withBusy(
      button,
      async () => {
        try {
          const data = await api.patch('/api/settings', {
            ...values,
            taxRate: Number(values.taxRate),
          });
          setConfig(data.settings);
          state.settings = data.settings;
          toast('Hotel settings saved.');
          reload();
        } catch (error) {
          toast(error.message, 'error');
        }
      },
      'Saving…'
    );
  });
}
