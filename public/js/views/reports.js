import { api } from '../api.js';
import { icon } from '../icons.js';
import { areaChart, barChart } from '../charts.js';
import {
  esc,
  num,
  money,
  fmtDate,
  fmtDateShort,
  addDaysISO,
  todayISO,
  CATEGORY_LABELS,
  PAYMENT_METHODS,
  RESERVATION_STATUS,
  statusPill,
  downloadCSV,
  printDocument,
  viewSkeleton,
  emptyState,
} from '../utils.js';

export const meta = {
  title: 'Reports',
  sub: 'Occupancy, revenue and front desk performance at a glance.',
  roles: ['admin', 'manager'],
};

const initialTo = todayISO();
const range = { from: addDaysISO(initialTo, -29), to: initialTo };

function stat(tone, label, value, metaText) {
  return `<article class="stat tone-${tone}">
    <div class="stat-body"><span class="stat-label">${esc(label)}</span>
    <strong class="stat-value">${value}</strong>
    <span class="stat-meta">${esc(metaText)}</span></div>
  </article>`;
}

export async function render(el) {
  el.innerHTML = viewSkeleton();
  const data = await api.get(`/api/reports?from=${range.from}&to=${range.to}`);
  const reload = () => render(el);
  const s = data.summary;

  const categoryTotal = data.categories.reduce((sum, row) => sum + Number(row.amount || 0), 0) || 1;
  const methodTotal = data.methods.reduce((sum, row) => sum + Number(row.amount || 0), 0) || 1;

  el.innerHTML = `
    <div class="view-head">
      <div class="view-head-text">
        <span class="eyebrow">Management reporting</span>
        <h2>Reports</h2>
        <p>${esc(fmtDate(data.from))} &mdash; ${esc(fmtDate(data.to))} &middot; ${esc(
    String(s.invoices)
  )} invoices, ${esc(num(s.bookings))} bookings</p>
      </div>
      <div class="page-actions">
        <button class="btn btn-ghost" type="button" id="export-report">${icon('download', 15)} Export CSV</button>
        <button class="btn btn-ghost" type="button" id="print-report">${icon('printer', 15)} Print</button>
      </div>
    </div>

    <section class="card no-print">
      <div class="card-body toolbar">
        <div class="segmented" role="tablist" aria-label="Quick ranges">
          <button class="seg-btn" type="button" data-range="7">Last 7 days</button>
          <button class="seg-btn" type="button" data-range="30">Last 30 days</button>
          <button class="seg-btn" type="button" data-range="90">Last 90 days</button>
        </div>
        <form class="filter-bar" id="report-range" autocomplete="off">
          <label class="date-field"><span>From</span><input type="date" name="from" value="${esc(range.from)}" /></label>
          <label class="date-field"><span>To</span><input type="date" name="to" value="${esc(range.to)}" /></label>
          <button class="btn btn-primary btn-sm" type="submit">Apply range</button>
        </form>
      </div>
    </section>

    <div class="stats-grid">
      ${stat('amber', 'Invoiced', money(s.invoiced), 'Total guest charges')}
      ${stat('green', 'Collected', money(s.collected), 'Payments received')}
      ${stat('red', 'Outstanding', money(s.outstanding), 'Open balances across all dates')}
      ${stat('blue', 'ADR', money(s.adr), 'Average daily room rate')}
      ${stat('violet', 'Occupancy avg', `${s.occupancyAvg}%`, 'Across the selected range')}
      ${stat('teal', 'Nights sold', num(s.nightsSold), `${num(s.invoices)} invoices issued`)}
    </div>

    <div class="dash-grid">
      <section class="card">
        <div class="card-head">
          <div><h3>Occupancy</h3><p>Share of rooms occupied each day</p></div>
          <span class="card-chip">${esc(String(s.occupancyAvg))}% avg</span>
        </div>
        <div class="card-body chart-pad">
          ${areaChart(
            data.series.map((point) => ({ label: fmtDateShort(point.date), pct: point.pct })),
            { gradientId: 'reportOccupancy' }
          )}
        </div>
      </section>

      <section class="card">
        <div class="card-head">
          <div><h3>Collections</h3><p>Payments received per day</p></div>
          <span class="card-chip">${money(s.collected)}</span>
        </div>
        <div class="card-body chart-pad">
          ${barChart(
            data.series.map((point) => ({
              label: fmtDateShort(point.date),
              value: point.collected,
              display: money(point.collected),
            })),
            { color: '#2e8b63' }
          )}
        </div>
      </section>
    </div>

    <div class="dash-grid">
      <section class="card">
        <div class="card-head">
          <div><h3>Revenue by category</h3><p>Room versus extras and services</p></div>
        </div>
        <div class="card-body">
          ${
            data.categories.length
              ? `<div class="bar-list">${data.categories
                  .map(
                    (row) => `<div class="bar-row">
                      <div class="bar-row-head">
                        <span>${esc(CATEGORY_LABELS[row.category] || row.category)}</span>
                        <strong>${money(row.amount)}</strong>
                      </div>
                      <div class="bar-track"><span style="width:${Math.round(
                        (Number(row.amount) / categoryTotal) * 100
                      )}%"></span></div>
                    </div>`
                  )
                  .join('')}</div>`
              : emptyState('chart', 'No revenue recorded', 'Issued invoices will be summarised here.')
          }
        </div>
      </section>

      <section class="card">
        <div class="card-head">
          <div><h3>Payment methods</h3><p>How guests settled their folios</p></div>
        </div>
        <div class="card-body">
          ${
            data.methods.length
              ? `<div class="bar-list">${data.methods
                  .map(
                    (row) => `<div class="bar-row">
                      <div class="bar-row-head">
                        <span>${esc(PAYMENT_METHODS[row.method] || row.method)} <em class="muted">· ${esc(
                      String(row.count)
                    )} payment${row.count === 1 ? '' : 's'}</em></span>
                        <strong>${money(row.amount)}</strong>
                      </div>
                      <div class="bar-track"><span class="alt" style="width:${Math.round(
                        (Number(row.amount) / methodTotal) * 100
                      )}%"></span></div>
                    </div>`
                  )
                  .join('')}</div>`
              : emptyState('wallet', 'No payments yet', 'Record a payment to see this breakdown.')
          }
        </div>
      </section>
    </div>

    <div class="dash-grid">
      <section class="card">
        <div class="card-head">
          <div><h3>Room type performance</h3><p>Nights sold and room revenue</p></div>
        </div>
        ${
          data.roomTypes.length
            ? `<div class="table-wrap">
                <table class="table">
                  <thead><tr><th>Room type</th><th class="right">Nights</th><th class="right">Revenue</th><th class="right">Share</th></tr></thead>
                  <tbody>
                    ${data.roomTypes
                      .map(
                        (row) => `<tr>
                          <td><span class="cell-title">${esc(row.type)}</span></td>
                          <td class="right">${esc(num(row.nights))}</td>
                          <td class="right">${money(row.revenue)}</td>
                          <td class="right">${
                            s.roomRevenue ? `${Math.round((Number(row.revenue) / s.roomRevenue) * 100)}%` : '—'
                          }</td>
                        </tr>`
                      )
                      .join('')}
                  </tbody>
                </table>
              </div>`
            : `<div class="card-body">${emptyState('bed', 'No room revenue', 'Completed stays in this range will be summarised here.')}</div>`
        }
      </section>

      <section class="card">
        <div class="card-head">
          <div><h3>Reservation status</h3><p>Bookings with check-in dates in range</p></div>
          <span class="card-chip">${esc(num(s.bookings))} bookings</span>
        </div>
        <div class="card-body">
          ${
            data.statuses.length
              ? `<div class="status-list">${data.statuses
                  .map(
                    (row) => `<div class="status-row">
                      ${statusPill(RESERVATION_STATUS[row.status] || { label: row.status, tone: 'gray' })}
                      <strong>${esc(String(row.count))}</strong>
                    </div>`
                  )
                  .join('')}</div>`
              : emptyState('calendar', 'No bookings in range', 'Reservation activity will appear here.')
          }
          <div class="report-note">
            <span>Room revenue</span><strong>${money(s.roomRevenue)}</strong>
            <span>Extras</span><strong>${money(s.extrasRevenue)}</strong>
            <span>VAT</span><strong>${money(s.taxAmount)}</strong>
          </div>
        </div>
      </section>
    </div>
  `;

  const setRange = (days) => {
    range.to = todayISO();
    range.from = addDaysISO(range.to, -(days - 1));
    reload();
  };

  el.querySelectorAll('[data-range]').forEach((button) => {
    button.addEventListener('click', () => setRange(Number(button.dataset.range)));
  });

  el.querySelector('#report-range')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget).entries());
    if (!values.from || !values.to) return;
    range.from = values.from;
    range.to = values.to;
    reload();
  });

  el.querySelector('#export-report')?.addEventListener('click', () => {
    downloadCSV(
      `sunrise-report-${range.from}-to-${range.to}.csv`,
      [
        ['Sunrise Hotel report', `${range.from} to ${range.to}`],
        [],
        ['Summary'],
        ['Invoiced', s.invoiced],
        ['Collected', s.collected],
        ['Outstanding (all dates)', s.outstanding],
        ['Room revenue', s.roomRevenue],
        ['Extras', s.extrasRevenue],
        ['VAT', s.taxAmount],
        ['ADR', s.adr],
        ['Occupancy average %', s.occupancyAvg],
        ['Nights sold', s.nightsSold],
        [],
        ['Daily performance'],
        ['Date', 'Occupancy %', 'Occupied rooms', 'Total rooms', 'Collected'],
        ...data.series.map((point) => [point.date, point.pct, point.occupied, point.total, point.collected]),
      ]
    );
  });

  el.querySelector('#print-report')?.addEventListener('click', printDocument);
}
