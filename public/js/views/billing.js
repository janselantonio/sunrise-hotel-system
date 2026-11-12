import { api } from '../api.js';
import { icon } from '../icons.js';
import {
  esc,
  initials,
  fmtDate,
  money,
  statusPill,
  invoiceStatusMeta,
  emptyState,
  viewSkeleton,
  downloadCSV,
} from '../utils.js';
import { openInvoice } from '../flows.js';

export const meta = {
  title: 'Billing',
  sub: 'Invoices, payments and outstanding balances.',
  roles: ['admin', 'receptionist', 'manager'],
};

const TABS = [
  { value: '', label: 'All' },
  { value: 'open', label: 'Open' },
  { value: 'paid', label: 'Paid' },
  { value: 'void', label: 'Void' },
];

let filters = { status: '', q: '' };

export async function render(el) {
  el.innerHTML = viewSkeleton();
  const params = new URLSearchParams();
  if (filters.status) params.set('status', filters.status);
  if (filters.q) params.set('q', filters.q);
  const query = params.toString();
  const data = await api.get(`/api/invoices${query ? `?${query}` : ''}`);
  const reload = () => render(el);
  const invoices = data.invoices;
  const summary = data.summary;

  el.innerHTML = `
    <div class="view-head">
      <div class="view-head-text">
        <span class="eyebrow">Folios &amp; payments</span>
        <h2>Billing</h2>
        <p>Track charges, record payments and close guest folios.</p>
      </div>
      <div class="page-actions">
        <button class="btn btn-ghost" type="button" id="export-invoices">${icon('download', 15)} Export CSV</button>
        <button class="icon-btn" type="button" data-refresh title="Refresh">${icon('refresh', 17)}</button>
      </div>
    </div>

    <div class="stats-grid">
      <article class="stat tone-amber">
        <span class="stat-icon">${icon('receipt', 18)}</span>
        <div class="stat-body"><span class="stat-label">Open invoices</span>
        <strong class="stat-value">${esc(String(summary.openCount))}</strong>
        <span class="stat-meta">Awaiting settlement</span></div>
      </article>
      <article class="stat tone-red">
        <span class="stat-icon">${icon('wallet', 18)}</span>
        <div class="stat-body"><span class="stat-label">Outstanding</span>
        <strong class="stat-value">${money(summary.openBalance)}</strong>
        <span class="stat-meta">Balance across open folios</span></div>
      </article>
      <article class="stat tone-green">
        <span class="stat-icon">${icon('coin', 18)}</span>
        <div class="stat-body"><span class="stat-label">Collected today</span>
        <strong class="stat-value">${money(summary.collectedToday)}</strong>
        <span class="stat-meta">Payments received today</span></div>
      </article>
      <article class="stat tone-blue">
        <span class="stat-icon">${icon('trendUp', 18)}</span>
        <div class="stat-body"><span class="stat-label">Collected this month</span>
        <strong class="stat-value">${money(summary.collectedMonth)}</strong>
        <span class="stat-meta">${esc(String(summary.paidCount))} paid invoice${summary.paidCount === 1 ? '' : 's'} on record</span></div>
      </article>
    </div>

    <section class="card">
      <div class="card-head wrap">
        <div class="segmented" role="tablist" aria-label="Filter invoices">
          ${TABS.map(
            (tab) => `<button class="seg-btn ${filters.status === tab.value ? 'active' : ''}" type="button"
              data-status="${tab.value}">${tab.label}</button>`
          ).join('')}
        </div>
        <form class="filter-bar" id="invoice-search" autocomplete="off">
          <div class="search">
            ${icon('search', 16)}
            <input name="q" type="search" value="${esc(filters.q)}" placeholder="Invoice, guest or room" />
          </div>
          <button class="btn btn-ghost btn-sm" type="submit">Search</button>
          ${filters.q ? '<button class="link-btn" type="button" id="clear-search">Clear</button>' : ''}
        </form>
      </div>

      <div class="table-meta">
        <span>${esc(String(invoices.length))} invoice${invoices.length === 1 ? '' : 's'}</span>
        <span class="muted">Newest issued first</span>
      </div>

      ${
        invoices.length
          ? `<div class="table-wrap">
              <table class="table">
                <thead>
                  <tr><th>Invoice</th><th>Guest</th><th>Room</th><th>Issued</th><th class="right">Total</th>
                  <th class="right">Paid</th><th class="right">Balance</th><th>Status</th><th></th></tr>
                </thead>
                <tbody>
                  ${invoices
                    .map(
                      (invoice) => `<tr data-invoice="${invoice.id}">
                        <td><span class="cell-title mono">${esc(invoice.number)}</span>
                          <span class="cell-sub">${esc(String(invoice.nights))} night${
                        invoice.nights === 1 ? '' : 's'
                      }</span></td>
                        <td>
                          <div class="cell-main"><span class="avatar sm">${esc(initials(invoice.guestName))}</span>
                            <div><span class="cell-title">${esc(invoice.guestName)}</span>
                            <span class="cell-sub">${esc(invoice.guestPhone || '')}</span></div>
                          </div>
                        </td>
                        <td><span class="room-badge">${esc(invoice.roomNumber)}</span>
                          <span class="cell-sub">${esc(invoice.roomType)}</span></td>
                        <td>${esc(fmtDate(invoice.issuedAt))}</td>
                        <td class="right">${money(invoice.total)}</td>
                        <td class="right">${money(invoice.amountPaid)}</td>
                        <td class="right">${invoice.balance > 0 ? `<strong>${money(invoice.balance)}</strong>` : money(0)}</td>
                        <td>${statusPill(invoiceStatusMeta(invoice.status))}</td>
                        <td class="right"><span class="cell-link">Open ${icon('chevronRight', 13)}</span></td>
                      </tr>`
                    )
                    .join('')}
                </tbody>
              </table>
            </div>`
          : `<div class="card-body">${emptyState('receipt', 'No invoices found', 'Try another status or clear the search.')}</div>`
      }
    </section>
  `;

  el.querySelector('[data-refresh]')?.addEventListener('click', reload);

  el.querySelectorAll('[data-status]').forEach((button) => {
    button.addEventListener('click', () => {
      filters.status = button.dataset.status;
      reload();
    });
  });

  el.querySelector('#invoice-search')?.addEventListener('submit', (event) => {
    event.preventDefault();
    filters.q = String(new FormData(event.currentTarget).get('q') || '').trim();
    reload();
  });

  el.querySelector('#clear-search')?.addEventListener('click', () => {
    filters.q = '';
    reload();
  });

  el.querySelector('#export-invoices')?.addEventListener('click', () => {
    downloadCSV(
      `sunrise-invoices-${new Date().toISOString().slice(0, 10)}.csv`,
      [
        ['Invoice', 'Guest', 'Room', 'Issued', 'Nights', 'Room total', 'Extras', 'Discount', 'Tax', 'Total', 'Paid', 'Balance', 'Status'],
        ...invoices.map((invoice) => [
          invoice.number,
          invoice.guestName,
          invoice.roomNumber,
          invoice.issuedAt,
          invoice.nights,
          invoice.roomTotal,
          invoice.extrasTotal,
          invoice.discount,
          invoice.taxAmount,
          invoice.total,
          invoice.amountPaid,
          invoice.balance,
          invoice.status,
        ]),
      ]
    );
  });

  el.onclick = (event) => {
    if (event.target.closest('button, a, form, input')) return;
    const row = event.target.closest('[data-invoice]');
    if (row) openInvoice(Number(row.dataset.invoice), { onDone: reload });
  };
}
