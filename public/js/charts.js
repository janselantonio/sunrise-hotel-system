import { esc } from './utils.js';

export function donutChart(items, { centerValue, centerLabel = 'rooms' } = {}) {
  const total = items.reduce((sum, item) => sum + (Number(item.value) || 0), 0);
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  const segments = items
    .filter((item) => Number(item.value) > 0)
    .map((item) => {
      const length = (Number(item.value) / (total || 1)) * circumference;
      const drawn = Math.max(0, length - 2.5);
      const segment = `<circle cx="80" cy="80" r="${radius}" fill="none" stroke="${item.color}" stroke-width="15"
        stroke-dasharray="${drawn} ${circumference - drawn}" stroke-dashoffset="${-offset}"
        transform="rotate(-90 80 80)" stroke-linecap="butt"/>`;
      offset += length;
      return segment;
    })
    .join('');

  return `<svg viewBox="0 0 160 160" class="donut" role="img" aria-label="Room status breakdown">
    <circle cx="80" cy="80" r="${radius}" fill="none" stroke="#f1ece3" stroke-width="15"/>
    ${segments}
    <text x="80" y="76" text-anchor="middle" class="donut-num">${esc(centerValue ?? total)}</text>
    <text x="80" y="95" text-anchor="middle" class="donut-label">${esc(centerLabel)}</text>
  </svg>`;
}

export function areaChart(points, { valueKey = 'pct', labelKey = 'label', gradientId = 'areaFill' } = {}) {
  const width = 520;
  const height = 172;
  const padX = 20;
  const top = 18;
  const bottom = 32;
  if (!points.length) return `<div class="chart-empty">No data for this period.</div>`;

  const values = points.map((point) => Number(point[valueKey]) || 0);
  const max = Math.max(1, ...values) * 1.18;
  const step = (width - padX * 2) / Math.max(1, points.length - 1);
  const x = (index) => padX + index * step;
  const y = (value) => height - bottom - (value / max) * (height - top - bottom);

  const coords = points.map((point, index) => [x(index), y(values[index])]);
  const line = coords.map(([cx, cy], index) => `${index ? 'L' : 'M'}${cx.toFixed(1)},${cy.toFixed(1)}`).join(' ');
  const area = `${line} L${coords[coords.length - 1][0].toFixed(1)},${height - bottom} L${coords[0][0].toFixed(
    1
  )},${height - bottom} Z`;

  const grid = [0, 0.5, 1]
    .map((ratio) => {
      const gy = top + ratio * (height - top - bottom);
      return `<line x1="${padX}" x2="${width - padX}" y1="${gy}" y2="${gy}" stroke="#efeae1" stroke-dasharray="3 5"/>`;
    })
    .join('');

  const labelEvery = Math.max(1, Math.ceil(points.length / 7));
  const lastIndex = points.length - 1;
  const showLast = lastIndex % labelEvery >= Math.ceil(labelEvery / 2);
  const labels = points
    .map((point, index) =>
      index % labelEvery === 0 || (index === lastIndex && showLast)
        ? `<text x="${x(index)}" y="${height - 9}" text-anchor="middle" class="chart-label">${esc(
            point[labelKey] ?? ''
          )}</text>`
        : ''
    )
    .join('');

  const dots = coords
    .map(([cx, cy], index) =>
      index === coords.length - 1
        ? `<circle cx="${cx}" cy="${cy}" r="4" fill="#c9842a" stroke="#fff" stroke-width="2"/>`
        : ''
    )
    .join('');

  return `<svg viewBox="0 0 ${width} ${height}" class="area-chart" role="img">
    <defs>
      <linearGradient id="${gradientId}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#e9b75f" stop-opacity=".32"/>
        <stop offset="100%" stop-color="#e9b75f" stop-opacity="0"/>
      </linearGradient>
    </defs>
    ${grid}
    <path d="${area}" fill="url(#${gradientId})"/>
    <path d="${line}" fill="none" stroke="#c9842a" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
    ${dots}
    ${labels}
  </svg>`;
}

export function barChart(points, { valueKey = 'value', color = '#d99a3d' } = {}) {
  const width = 520;
  const height = 176;
  const padX = 18;
  const top = 16;
  const bottom = 30;
  if (!points.length) return `<div class="chart-empty">No data for this period.</div>`;

  const values = points.map((point) => Number(point[valueKey]) || 0);
  const max = Math.max(1, ...values);
  const slot = (width - padX * 2) / points.length;
  const barWidth = Math.max(3, Math.min(30, slot * 0.6));
  const labelEvery = Math.max(1, Math.ceil(points.length / 8));
  const lastIndex = points.length - 1;
  const showLast = lastIndex % labelEvery >= Math.ceil(labelEvery / 2);

  const bars = points
    .map((point, index) => {
      const barHeight = Math.max(values[index] > 0 ? 3 : 1, (values[index] / max) * (height - top - bottom));
      const bx = padX + index * slot + (slot - barWidth) / 2;
      const by = height - bottom - barHeight;
      const label =
        index % labelEvery === 0 || (index === lastIndex && showLast)
          ? `<text x="${bx + barWidth / 2}" y="${height - 9}" text-anchor="middle" class="chart-label">${esc(
              point.label ?? ''
            )}</text>`
          : '';
      return `<rect x="${bx.toFixed(1)}" y="${by.toFixed(1)}" width="${barWidth.toFixed(1)}" height="${barHeight.toFixed(
        1
      )}" rx="3.5" fill="${point.color || color}" opacity=".92"><title>${esc(point.label ?? '')}: ${esc(
        point.display ?? values[index]
      )}</title></rect>${label}`;
    })
    .join('');

  return `<svg viewBox="0 0 ${width} ${height}" class="area-chart" role="img">${bars}</svg>`;
}
