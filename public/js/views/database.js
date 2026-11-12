import { api } from '../api.js';
import { icon } from '../icons.js';
import { esc, num, viewSkeleton, emptyState, toast } from '../utils.js';

export const meta = {
  title: 'Database',
  sub: 'The live MySQL database behind every screen.',
  roles: ['admin'],
};

let selectedTable = 'reservations';

function formatBytes(bytes) {
  const value = Number(bytes) || 0;
  if (value >= 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  if (value >= 1024) return `${Math.round(value / 1024)} KB`;
  return `${value} B`;
}

function cellValue(value) {
  if (value === null || value === undefined) return '<span class="db-cell-null">NULL</span>';
  const text = String(value);
  return esc(text.length > 140 ? `${text.slice(0, 140)}\u2026` : text);
}

function columnList(table) {
  if (!table.columns.length) return '<li>No columns reported.</li>';
  return table.columns
    .map(
      (column) => `<li><code>${esc(column.name)}</code> <span class="muted">${esc(column.type || 'TEXT')}</span>${
        column.primaryKey ? ' <span class="pill violet">PK</span>' : ''
      }${!column.notNull && !column.primaryKey ? ' <span class="pill gray">nullable</span>' : ''}</li>`
    )
    .join('');
}

function foreignKeyList(table) {
  if (!table.foreignKeys.length) return '<li>No foreign keys.</li>';
  return table.foreignKeys
    .map(
      (fk) =>
        `<li><code>${esc(fk.column)}</code> \u2192 <code>${esc(fk.referencesTable)}.${esc(
          fk.referencesColumn
        )}</code></li>`
    )
    .join('');
}

function indexList(table) {
  if (!table.indexes.length) return '<li>No indexes.</li>';
  return table.indexes
    .map(
      (index) =>
        `<li><code>${esc(index.name)}</code> <span class="muted">(${esc(index.columns.join(', '))})</span>${
          index.unique ? ' <span class="pill amber">unique</span>' : ''
        }</li>`
    )
    .join('');
}

function recordsTable(table) {
  if (!table.rows.length) return emptyState('database', 'This table is empty', 'Records will appear here.');
  const columns = table.columns.map((column) => column.name);
  return `<div class="table-wrap">
    <table class="table table-compact">
      <thead><tr>${columns.map((name) => `<th>${esc(name)}</th>`).join('')}</tr></thead>
      <tbody>
        ${table.rows
          .map(
            (row) => `<tr>${columns.map((name) => `<td>${cellValue(row[name])}</td>`).join('')}</tr>`
          )
          .join('')}
      </tbody>
    </table>
  </div>`;
}

export async function render(el) {
  el.innerHTML = viewSkeleton();
  const overview = await api.get('/api/database/tables');
  const names = overview.tables.map((table) => table.name);
  if (!names.includes(selectedTable)) {
    selectedTable = names.includes('reservations') ? 'reservations' : names[0];
  }

  let table;
  try {
    table = await api.get(`/api/database/tables/${selectedTable}?limit=25`);
  } catch (error) {
    toast(error.message, 'error');
    table = null;
  }

  const totalRows = overview.tables.reduce((sum, entry) => sum + entry.rows, 0);
  const activeTable = overview.tables.find((entry) => entry.name === selectedTable);

  el.innerHTML = `
    <div class="view-head">
      <div class="view-head-text">
        <span class="eyebrow">Under the hood</span>
        <h2>Database</h2>
        <p>The live MySQL database. Everything entered in the staff app or the guest site is stored here.</p>
      </div>
      <div class="page-actions">
        <span class="pill violet">${icon('database', 13)} ${esc(overview.engine)}</span>
        <span class="pill ${overview.foreignKeys ? 'green' : 'red'}">Foreign keys ${
    overview.foreignKeys ? 'on' : 'off'
  }</span>
        <button class="icon-btn" type="button" data-refresh title="Refresh">${icon('refresh', 17)}</button>
      </div>
    </div>

    <div class="stats-grid">
      <article class="stat tone-violet">
        <span class="stat-icon">${icon('database', 18)}</span>
        <div class="stat-body"><span class="stat-label">Engine</span>
        <strong class="stat-value">${esc(overview.engine)}</strong>
        <span class="stat-meta">${esc(overview.storageEngine)} storage engine</span></div>
      </article>
      <article class="stat tone-blue">
        <span class="stat-icon">${icon('list', 18)}</span>
        <div class="stat-body"><span class="stat-label">Tables</span>
        <strong class="stat-value">${esc(num(overview.tables.length))}</strong>
        <span class="stat-meta">Relational schema with foreign keys</span></div>
      </article>
      <article class="stat tone-green">
        <span class="stat-icon">${icon('grid', 18)}</span>
        <div class="stat-body"><span class="stat-label">Records</span>
        <strong class="stat-value">${esc(num(totalRows))}</strong>
        <span class="stat-meta">Rows across all tables</span></div>
      </article>
      <article class="stat tone-amber">
        <span class="stat-icon">${icon('coin', 18)}</span>
        <div class="stat-body"><span class="stat-label">Data size</span>
        <strong class="stat-value">${esc(formatBytes(overview.sizeBytes))}</strong>
        <span class="stat-meta mono">${esc(overview.location)}</span></div>
      </article>
    </div>

    <div class="notice">
      ${icon('info', 16)}
      <div><strong>Read-only view</strong>
      <span>Records are masked where needed (staff passwords show as a secure hash). Changes are made through the staff app, not here.</span></div>
    </div>

    <div class="db-layout">
      <aside class="card">
        <div class="card-head">
          <div><h3>Tables</h3><p>${esc(String(overview.tables.length))} tables in the schema</p></div>
        </div>
        <div class="db-table-list">
          ${overview.tables
            .map(
              (entry) => `<button class="db-table-btn ${entry.name === selectedTable ? 'active' : ''}" type="button"
                data-table="${esc(entry.name)}">
                <span class="db-table-name"><strong>${esc(entry.name)}</strong><span>${esc(entry.description)}</span></span>
                <span class="db-count">${esc(num(entry.rows))}</span>
              </button>`
            )
            .join('')}
        </div>
      </aside>

      <div class="db-main">
        ${
          table
            ? `<section class="card">
                <div class="card-head">
                  <div>
                    <h3><span class="mono">${esc(table.table)}</span></h3>
                    <p>${esc(table.description)}</p>
                  </div>
                  <span class="card-chip">${esc(num(table.total))} rows</span>
                </div>
                <div class="card-body">
                  <div class="db-schema-grid">
                    <div class="db-schema-block">
                      <h4>Columns (${esc(String(table.columns.length))})</h4>
                      <ul>${columnList(table)}</ul>
                    </div>
                    <div class="db-schema-block">
                      <h4>Foreign keys</h4>
                      <ul>${foreignKeyList(table)}</ul>
                    </div>
                    <div class="db-schema-block">
                      <h4>Indexes</h4>
                      <ul>${indexList(table)}</ul>
                    </div>
                  </div>
                </div>
              </section>

              <section class="card">
                <div class="card-head wrap">
                  <div>
                    <h3>Records</h3>
                    <p>${esc(
                      `Latest ${Math.min(table.limit, table.total)} of ${table.total} row${
                        table.total === 1 ? '' : 's'
                      }`
                    )}</p>
                  </div>
                  <div class="db-legend">
                    <span>${icon('lock', 12)} Password hashes are masked</span>
                    <span>${icon('database', 12)} Read-only</span>
                  </div>
                </div>
                ${recordsTable(table)}
              </section>`
            : `<div class="card card-body">${emptyState(
                'database',
                'Could not load this table',
                'Pick another table from the list.'
              )}</div>`
        }
      </div>
    </div>
  `;

  el.querySelector('[data-refresh]')?.addEventListener('click', () => render(el));
  el.querySelectorAll('[data-table]').forEach((button) => {
    button.addEventListener('click', () => {
      selectedTable = button.dataset.table;
      render(el);
    });
  });

  if (activeTable) {
    document.title = `${activeTable.name} \u00B7 Database \u00B7 Sunrise Hotel`;
  }
}
