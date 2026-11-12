import { api } from './api.js';
import { state, setSession, clearSession } from './store.js';
import { setConfig, esc, initials, toast, fmtDate, fmtWeekday, todayISO, closeAllModals, ROLE_LABELS } from './utils.js';
import { icon } from './icons.js';

import * as dashboard from './views/dashboard.js';
import * as frontdesk from './views/frontdesk.js';
import * as reservations from './views/reservations.js';
import * as rooms from './views/rooms.js';
import * as housekeeping from './views/housekeeping.js';
import * as guests from './views/guests.js';
import * as billing from './views/billing.js';
import * as reports from './views/reports.js';
import * as admin from './views/admin.js';
import * as database from './views/database.js';

const ALL = ['admin', 'receptionist', 'manager', 'housekeeping'];
const DESK = ['admin', 'receptionist', 'manager'];

const NAV_GROUPS = [
  {
    label: 'Operations',
    items: [
      { id: 'dashboard', label: 'Dashboard', icon: 'grid', roles: ALL },
      { id: 'frontdesk', label: 'Front desk', icon: 'bell', roles: DESK },
      { id: 'reservations', label: 'Reservations', icon: 'calendar', roles: DESK },
      { id: 'rooms', label: 'Rooms', icon: 'door', roles: ALL },
      { id: 'housekeeping', label: 'Housekeeping', icon: 'broom', roles: ALL },
    ],
  },
  {
    label: 'Guests & billing',
    items: [
      { id: 'guests', label: 'Guests', icon: 'users', roles: DESK },
      { id: 'billing', label: 'Billing', icon: 'receipt', roles: DESK },
    ],
  },
  {
    label: 'Management',
    items: [
      { id: 'reports', label: 'Reports', icon: 'chart', roles: ['admin', 'manager'] },
      { id: 'admin', label: 'Administration', icon: 'settings', roles: ['admin'] },
      { id: 'database', label: 'Database', icon: 'database', roles: ['admin'] },
    ],
  },
];

const VIEWS = { dashboard, frontdesk, reservations, rooms, housekeeping, guests, billing, reports, admin, database };

const loginScreen = document.getElementById('login-screen');
const appEl = document.getElementById('app');
const viewEl = document.getElementById('view');
const navEl = document.getElementById('nav');
const sidebar = document.getElementById('sidebar');
const backdrop = document.getElementById('sidebar-backdrop');
const pageTitle = document.getElementById('page-title');
const pageSub = document.getElementById('page-sub');
const dateChip = document.getElementById('date-chip');
const userCard = document.getElementById('user-card');

let rendering = false;
let routeToken = 0;

/* ------------------------------------------------------------------ */
/* Boot                                                                */
/* ------------------------------------------------------------------ */

document.getElementById('login-year').textContent = new Date().getFullYear();

function setDateChip() {
  const today = todayISO();
  dateChip.innerHTML = `<span class="date-weekday">${esc(fmtWeekday(today))}</span>
    <span class="date-main">${esc(fmtDate(today))}</span>`;
}

function defaultView() {
  return state.user?.role === 'housekeeping' ? 'housekeeping' : 'dashboard';
}

function renderNav() {
  navEl.innerHTML = NAV_GROUPS.map((group) => {
    const items = group.items.filter((item) => item.roles.includes(state.user.role));
    if (!items.length) return '';
    return `<div class="nav-group">
      <span class="nav-label">${esc(group.label)}</span>
      ${items
        .map(
          (item) => `<a class="nav-link" href="#/${item.id}" data-view="${item.id}">
            ${icon(item.icon, 17)}<span>${esc(item.label)}</span>
          </a>`
        )
        .join('')}
    </div>`;
  }).join('');
}

function renderUserCard() {
  userCard.innerHTML = `<span class="avatar">${esc(initials(state.user.fullName))}</span>
    <div class="user-card-text">
      <strong>${esc(state.user.fullName)}</strong>
      <span>${esc(ROLE_LABELS[state.user.role] || state.user.role)}</span>
    </div>`;
}

function showLogin(message = '') {
  clearSession();
  closeAllModals();
  appEl.hidden = true;
  loginScreen.hidden = false;
  document.body.classList.remove('modal-open', 'sidebar-open');
  const error = document.getElementById('login-error');
  if (message) {
    error.textContent = message;
    error.hidden = false;
  }
  const username = document.querySelector('#login-form [name="username"]');
  if (username && window.innerWidth > 780) username.focus({ preventScroll: true });
}

function startApp(session) {
  setSession(session);
  setConfig(session.settings);
  renderNav();
  renderUserCard();
  setDateChip();
  loginScreen.hidden = true;
  appEl.hidden = false;
  document.getElementById('login-error').hidden = true;

  const target = location.hash.replace(/^#\/?/, '');
  if (!target || !VIEWS[target]) {
    location.hash = `#/${defaultView()}`;
    route();
  } else {
    route();
  }
}

/* ------------------------------------------------------------------ */
/* Routing                                                             */
/* ------------------------------------------------------------------ */

function setActiveNav(id) {
  document.querySelectorAll('.nav-link').forEach((link) => {
    link.classList.toggle('active', link.dataset.view === id);
  });
}

function closeSidebar() {
  appEl.classList.remove('sidebar-open');
  backdrop.hidden = true;
}

async function route() {
  if (!state.user) return;
  const id = location.hash.replace(/^#\/?/, '').split('?')[0];
  const view = VIEWS[id];

  if (!view || !view.meta.roles.includes(state.user.role)) {
    const fallback = defaultView();
    if (id !== fallback) {
      location.hash = `#/${fallback}`;
      return;
    }
    return;
  }

  closeSidebar();
  closeAllModals();
  const token = ++routeToken;
  setActiveNav(id);
  pageTitle.textContent = view.meta.title;
  pageSub.textContent = view.meta.sub;
  document.title = `${view.meta.title} · Sunrise Hotel`;
  document.querySelector('.main')?.scrollTo({ top: 0 });

  viewEl.innerHTML = '';
  rendering = true;
  try {
    await view.render(viewEl);
  } catch (error) {
    if (token !== routeToken) return;
    viewEl.innerHTML = `<div class="card error-panel">
      <div class="empty-icon">${icon('alert', 20)}</div>
      <h4>Could not load this page</h4>
      <p>${esc(error.message || 'Unexpected error.')}</p>
      <button class="btn btn-primary" type="button" data-retry>${icon('refresh', 15)} Try again</button>
    </div>`;
    viewEl.querySelector('[data-retry]')?.addEventListener('click', () => route());
    if (error.status === 401) showLogin('Your session expired. Please sign in again.');
  } finally {
    rendering = false;
  }
}

window.addEventListener('hashchange', route);

/* ------------------------------------------------------------------ */
/* Login                                                               */
/* ------------------------------------------------------------------ */

const loginForm = document.getElementById('login-form');
const loginButton = document.getElementById('login-submit');
const loginError = document.getElementById('login-error');

function showLoginError(message) {
  loginError.textContent = message;
  loginError.hidden = !message;
}

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  showLoginError('');
  const values = Object.fromEntries(new FormData(loginForm).entries());
  const original = loginButton.innerHTML;
  loginButton.disabled = true;
  loginButton.innerHTML = '<span class="spinner"></span>Signing in…';
  try {
    const session = await api.post('/api/auth/login', {
      username: String(values.username || '').trim(),
      password: String(values.password || ''),
    });
    loginForm.reset();
    startApp(session);
    setDateChip();
  } catch (error) {
    showLoginError(error.message || 'Unable to sign in.');
  } finally {
    loginButton.disabled = false;
    loginButton.innerHTML = original;
  }
});

document.querySelectorAll('.demo-chip').forEach((chip) => {
  chip.addEventListener('click', () => {
    loginForm.elements.username.value = chip.dataset.user;
    loginForm.elements.password.value = chip.dataset.pass;
    showLoginError('');
    loginButton.focus();
  });
});

/* ------------------------------------------------------------------ */
/* Logout / session expiry / mobile menu                               */
/* ------------------------------------------------------------------ */

async function logout() {
  try {
    await api.post('/api/auth/logout');
  } catch {
    /* the local session is cleared regardless */
  }
  location.hash = '';
  showLogin();
}

document.querySelectorAll('.js-logout').forEach((button) => button.addEventListener('click', logout));

window.addEventListener('session-expired', () => {
  if (!appEl.hidden) showLogin('Your session expired. Please sign in again.');
});

document.getElementById('btn-menu').addEventListener('click', () => {
  const open = appEl.classList.toggle('sidebar-open');
  backdrop.hidden = !open;
});
backdrop.addEventListener('click', closeSidebar);
sidebar.addEventListener('click', (event) => {
  if (event.target.closest('.nav-link')) closeSidebar();
});

window.addEventListener('resize', () => {
  if (window.innerWidth > 900) closeSidebar();
});

/* ------------------------------------------------------------------ */
/* Start                                                               */
/* ------------------------------------------------------------------ */

(async function boot() {
  setDateChip();
  try {
    const session = await api.get('/api/auth/me');
    startApp(session);
    if (session.staff) state.staff = session.staff;
  } catch (error) {
    if (error.status === 401) {
      showLogin();
    } else {
      showLogin(error.message || 'The server is not reachable. Run "npm start".');
    }
  }
})();
